import {
  Body,
  Controller,
  ForbiddenException,
  Headers,
  Post,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SupabaseService } from '../supabase/supabase.service';
import { ProdamusService } from './prodamus.service';
import { AnyFilesInterceptor } from '@nestjs/platform-express';

@Controller('payments/prodamus')
export class ProdamusController {
  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly prodamus: ProdamusService,
  ) {}

  /**
   * Создаём платеж и отдаём ссылку на оплату
   * POST /api/payments/prodamus/create
   */
  @Post('create')
  @UseGuards(JwtAuthGuard)
  async create(@Req() req: any, @Body() body: any) {
    const userId = req?.user?.userId;
    if (!userId) throw new ForbiddenException('no_user');

    const supabase = this.supabaseService.getClient();

    // Берём пользователя (телефон пригодится для формы)
    const { data: user, error: uErr } = await supabase
      .from('users')
      .select('id,phone,email')
      .eq('id', userId)
      .maybeSingle();

    if (uErr) {
      return {
        success: false,
        message: 'supabase_users_error',
        error: uErr.message,
      };
    }
    if (!user) return { success: false, message: 'user_not_found' };

    const planCode = String(body?.plan_code || 'wa_tg').trim();
    const plans: Record<string, { price: number; productName: string }> = {
      wa: { price: 200, productName: 'Подписка WhatsApp (30 дней)' },
      tg: { price: 100, productName: 'Подписка Telegram (30 дней)' },
      wa_tg: {
        price: 250,
        productName: 'Подписка WhatsApp + Telegram (30 дней)',
      },
    };

    const plan = plans[planCode];
    if (!plan) {
      return { success: false, message: 'invalid_plan_code' };
    }

    const amountRub = plan.price;

    // Создаём запись в payments
    const { data: payment, error: pErr } = await supabase
      .from('payments')
      .insert({
        user_id: userId,
        provider: 'prodamus',
        amount_rub: amountRub,
        status: 'created',
        // order_id можно использовать как "наш номер заказа"
        // чтобы потом по webhook легко найти
        order_id: null,
      })
      .select()
      .single();

    if (pErr || !payment) {
      return {
        success: false,
        message: 'supabase_payments_insert_error',
        error: pErr?.message,
      };
    }

    // В качестве order_num/нашего order_id используем payment.id
    const internalOrderId = `${String(payment.id)}|${planCode}`;

    // Сохраним order_id = internalOrderId (чисто для удобства)
    await supabase
      .from('payments')
      .update({ order_id: internalOrderId })
      .eq('id', payment.id);

    const payformUrl = this.prodamus.buildPaymentLink({
      orderId: internalOrderId,
      customerPhone: user.phone || undefined,
      customerEmail: user.email || undefined,
      customerExtra: `user_id=${userId}`,
      productName: plan.productName,
      productPrice: amountRub,
      quantity: 1,
    });
    const paymentUrl = await this.prodamus.resolvePaymentLink(payformUrl);

    return {
      success: true,
      payment_url: paymentUrl,
    };
  }

  /**
   * Webhook от Prodamus (Payform)
   * POST /api/payments/prodamus/webhook
   * Важно: приходит multipart/form-data + подпись в заголовке Sign
   */
  @Post('webhook')
  @UseInterceptors(AnyFilesInterceptor())
  async webhook(
    @Req() req: any,
    @Headers('sign') signLower?: string,
    @Headers('Sign') signUpper?: string,
    @Body() body?: any,
  ) {
    const signature = (signLower || signUpper || '').trim();

    // multer положит поля в req.body
    const rawBody = (req?.body ?? body ?? {}) as Record<string, any>;
    const expanded = this.prodamus.expandBracketKeys(rawBody);

    const dataToVerify = expanded?.submit ? expanded.submit : expanded;
    const ok = this.prodamus.verify(dataToVerify, signature);

    if (!ok) {
      // НЕ 200 -> Prodamus будет ретраить
      throw new ForbiddenException('invalid_signature');
    }

    console.log('--- PRODAMUS WEBHOOK HIT ---');
    console.log('sign:', signature);
    console.log('expanded keys:', Object.keys(expanded || {}));
    console.log(
      'order_num:',
      expanded?.order_num,
      'order_id:',
      expanded?.order_id,
    );
    if (expanded?.submit)
      console.log('submit keys:', Object.keys(expanded.submit));

    // По доке:
    // order_id = ID заказа в Prodamus
    // order_num = номер заказа на стороне магазина
    const orderNum = String(
      expanded?.order_num || expanded?.submit?.order_num || '',
    ).trim(); // это наш internal id
    const prodamusOrderId = String(
      expanded?.order_id || expanded?.submit?.order_id || '',
    ).trim();

    const planCodeFromOrder = orderNum.includes('|')
      ? orderNum.split('|')[1]
      : null;
    const allowedPlans = new Set(['wa', 'tg', 'wa_tg']);
    const planCode = allowedPlans.has(String(planCodeFromOrder || ''))
      ? String(planCodeFromOrder)
      : 'wa_tg'; // это их id

    const paymentStatus = String(expanded?.payment_status || '').trim(); // success | order_canceled | ...
    const sum = String(expanded?.sum || '').trim();

    const supabase = this.supabaseService.getClient();

    // Пытаемся найти payment по нашему orderNum (мы отправляем payment.id)
    let paymentRow: any = null;

    if (orderNum) {
      const { data, error } = await supabase
        .from('payments')
        .select('*')
        .eq('order_id', orderNum)
        .maybeSingle();
      if (!error) paymentRow = data;
    }

    // fallback: иногда order_num может отсутствовать; попробуем по raw order_id (если вы так будете отправлять)
    if (!paymentRow && orderNum) {
      const { data } = await supabase
        .from('payments')
        .select('*')
        .eq('id', orderNum)
        .maybeSingle();
      paymentRow = data;
    }

    if (!paymentRow) {
      // Возвращаем 200, чтобы не было вечных ретраев,
      // но логически это проблема сопоставления
      return { success: true, ignored: true, reason: 'payment_not_found' };
    }

    if (paymentRow.status === 'paid') {
      return { success: true, already_processed: true };
    }

    // маппинг статуса
    const isSuccess = paymentStatus === 'success';

    const newPaymentStatus = isSuccess ? 'paid' : 'failed';

    // обновляем payments
    await supabase
      .from('payments')
      .update({
        provider_payment_id: prodamusOrderId || paymentRow.provider_payment_id,
        status: newPaymentStatus,
        paid_at: isSuccess ? new Date().toISOString() : null,
        raw: expanded,
      })
      .eq('id', paymentRow.id);

    if (!isSuccess) {
      return { success: true };
    }

    // Активируем подписку на 30 дней
    const now = new Date();
    const nowMs = now.getTime();

    let baseEndMs = nowMs;

    // если подписка уже активна — продлеваем от текущего конца
    if (
      paymentRow.current_period_end &&
      new Date(paymentRow.current_period_end).getTime() > nowMs
    ) {
      baseEndMs = new Date(paymentRow.current_period_end).getTime();
    }

    const startIso = new Date(baseEndMs).toISOString();

    const end = new Date(baseEndMs);
    end.setDate(end.getDate() + 30);
    const endIso = end.toISOString();


    // Upsert subscriptions
    await supabase.from('subscriptions').upsert(
      {
        user_id: paymentRow.user_id,
        status: 'active',
        plan_code: planCode,
        provider: 'prodamus',
        current_period_start: startIso,
        current_period_end: endIso,
        cancel_at_period_end: false,
        updated_at: startIso,
      },
      { onConflict: 'user_id' },
    );

    // (Опционально) можно тут обновлять referrals (если захочешь — добавим на следующем шаге)

    return { success: true };
  }
}



