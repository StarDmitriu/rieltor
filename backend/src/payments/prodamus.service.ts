import { Injectable } from '@nestjs/common';
import { createHmac } from 'crypto';

type AnyObj = Record<string, any>;

@Injectable()
export class ProdamusService {
  private readonly formUrl = (process.env.PRODAMUS_FORM_URL || '').trim();
  private readonly secretKey = (process.env.PRODAMUS_SECRET_KEY || '').trim();

  assertConfig() {
    if (!this.formUrl) throw new Error('Missing env: PRODAMUS_FORM_URL');
    if (!this.secretKey) throw new Error('Missing env: PRODAMUS_SECRET_KEY');
  }

  getBaseFormUrl(): string {
    this.assertConfig();
    // гарантируем trailing slash
    return this.formUrl.endsWith('/') ? this.formUrl : `${this.formUrl}/`;
  }

  getSecretKey(): string {
    this.assertConfig();
    return this.secretKey;
  }

  /**
   * Приводим все значения к строкам (как требует дока)
   */
  private stringifyDeep(input: any): any {
    if (input === null || input === undefined) return '';
    if (Array.isArray(input)) return input.map((v) => this.stringifyDeep(v));
    if (typeof input === 'object') {
      const out: AnyObj = {};
      for (const k of Object.keys(input)) out[k] = this.stringifyDeep(input[k]);
      return out;
    }
    return String(input);
  }

  /**
   * Сортировка ключей по алфавиту "вглубь"
   */
  private sortDeep(input: any): any {
    if (Array.isArray(input)) return input.map((v) => this.sortDeep(v));
    if (input && typeof input === 'object') {
      const out: AnyObj = {};
      const keys = Object.keys(input).sort((a, b) => a.localeCompare(b));
      for (const k of keys) out[k] = this.sortDeep(input[k]);
      return out;
    }
    return input;
  }

  /**
   * JSON stringify + экранирование /
   */
  private toSignedJson(data: any): string {
    const str = JSON.stringify(data);
    return str.replace(/\//g, '\\/');
  }

  /**
   * Подпись: HMAC-SHA256(json, secretKey) hex
   */
  sign(data: AnyObj): string {
    const prepared = this.sortDeep(this.stringifyDeep(data));
    const json = this.toSignedJson(prepared);
    return createHmac('sha256', this.getSecretKey())
      .update(json, 'utf8')
      .digest('hex');
  }

  verify(data: AnyObj, signature: string): boolean {
    const sig = (signature || '').trim();
    if (!sig) return false;
    const expected = this.sign(data);
    // timing-safe сравнение тут не критично, но можно
    return expected === sig;
  }

  /**
   * В webhook от Payform часто прилетает multipart с ключами вида:
   * products[0][name] и т.п.
   * Для корректной подписи надо преобразовать это в объект/массив.
   */
  expandBracketKeys(flat: AnyObj): AnyObj {
    const out: AnyObj = {};

    const setDeep = (obj: any, path: (string | number)[], value: any) => {
      let cur = obj;
      for (let i = 0; i < path.length; i++) {
        const key = path[i];
        const isLast = i === path.length - 1;
        const nextKey = path[i + 1];

        const nextIsIndex = typeof nextKey === 'number';

        if (isLast) {
          cur[key as any] = value;
          return;
        }

        if (cur[key as any] === undefined) {
          cur[key as any] = nextIsIndex ? [] : {};
        }
        cur = cur[key as any];
      }
    };

    const parsePath = (k: string): (string | number)[] => {
      // products[0][name] -> ["products", 0, "name"]
      const parts = k.split(/\[|\]/).filter(Boolean);
      return parts.map((p) => (/^\d+$/.test(p) ? Number(p) : p));
    };

    for (const [k, v] of Object.entries(flat || {})) {
      if (!k.includes('[')) {
        out[k] = v;
        continue;
      }
      setDeep(out, parsePath(k), v);
    }

    return out;
  }

  /**
   * Собираем ссылку на оплату (do=link) + подпись.
   * Важно: в URL кладём плоские параметры, но signature считаем по "вложенному" объекту.
   */
  buildPaymentLink(params: {
    orderId: string; // ваш order_num (например payments.id)
    customerPhone?: string;
    customerEmail?: string;
    customerExtra?: string;
    productName: string;
    productPrice: number; // "2000"
    quantity?: number;
  }): string {
    const base = this.getBaseFormUrl();

    const dataForSign: AnyObj = {
      do: 'link',
      order_id: params.orderId,
      customer_phone: params.customerPhone || '',
      customer_email: params.customerEmail || '',
      customer_extra: params.customerExtra || '',
      products: [
        {
          name: params.productName,
          price: String(params.productPrice),
          quantity: String(params.quantity ?? 1),
        },
      ],
    };

    const signature = this.sign(dataForSign);

    // В URL кладём "плоско", как принимает Payform
    const q = new URLSearchParams();
    q.set('do', 'link');
    q.set('order_id', params.orderId);
    if (params.customerPhone) q.set('customer_phone', params.customerPhone);
    if (params.customerEmail) q.set('customer_email', params.customerEmail);
    if (params.customerExtra) q.set('customer_extra', params.customerExtra);

    q.set('products[0][name]', params.productName);
    q.set('products[0][price]', String(params.productPrice));
    q.set('products[0][quantity]', String(params.quantity ?? 1));

    q.set('signature', signature);

    return `${base}?${q.toString()}`;
  }
}
