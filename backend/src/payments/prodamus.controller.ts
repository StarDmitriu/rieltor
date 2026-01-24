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

const PRODAMUS_SUBSCRIPTION_IDS: Record<string, string> = {
  wa: '2718625',
  tg: '2718627',
  wa_tg: '2718628',
};

const PLAN_BY_SUBSCRIPTION_ID: Record<string, string> = {
  '2718625': 'wa',
  '2718627': 'tg',
  '2718628': 'wa_tg',
};

@Controller('payments/prodamus')
export class ProdamusController {
  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly prodamus: ProdamusService,
  ) {}

  // POST /api/payments/prodamus/create
  @Post('create')
  @UseGuards(JwtAuthGuard)
  async create(@Req() req: any, @Body() body: any) {
    const userId = req?.user?.userId;
    if (!userId) throw new ForbiddenException('no_user');

    const supabase = this.supabaseService.getClient();

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
      wa: { price: 60, productName: 'Подписка WhatsApp (30 дней)' },
      tg: { price: 50, productName: 'Подписка Telegram (30 дней)' },
      wa_tg: {
        price: 65,
        productName: 'Подписка WhatsApp + Telegram (30 дней)',
      },
    };

    const plan = plans[planCode];
    if (!plan) {
      return { success: false, message: 'invalid_plan_code' };
    }

    const amountRub = plan.price;

    const { data: payment, error: pErr } = await supabase
      .from('payments')
      .insert({
        user_id: userId,
        provider: 'prodamus',
        amount_rub: amountRub,
        status: 'created',
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

    const internalOrderId = `${String(payment.id)}|${planCode}`;

    await supabase
      .from('payments')
      .update({ order_id: internalOrderId })
      .eq('id', payment.id);

    const payformUrl = this.prodamus.buildPaymentLink({
      orderId: internalOrderId,
      customerPhone: user.phone || undefined,
      customerEmail: user.email || undefined,
      customerExtra: `user_id=${userId};payment_id=${payment.id};plan_code=${planCode}`,
      subscriptionId: PRODAMUS_SUBSCRIPTION_IDS[planCode],
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

  // POST /api/payments/prodamus/webhook
  @Post('webhook')
  @UseInterceptors(AnyFilesInterceptor())
  async webhook(
    @Req() req: any,
    @Headers('sign') signLower?: string,
    @Headers('Sign') signUpper?: string,
    @Body() body?: any,
  ) {
    const signature = (signLower || signUpper || '').trim();

    const rawBody = (req?.body ?? body ?? {}) as Record<string, any>;
    const expanded = this.prodamus.expandBracketKeys(rawBody);

    const dataToVerify = expanded?.submit ? expanded.submit : expanded;
    const ok = this.prodamus.verify(dataToVerify, signature);

    if (!ok) {
      throw new ForbiddenException('invalid_signature');
    }

    console.log('--- PRODAMUS WEBHOOK HIT ---');
    console.log('sign:', signature);
    console.log('expanded keys:', Object.keys(expanded || {}));
    console.log('order_num:', expanded?.order_num, 'order_id:', expanded?.order_id);
    if (expanded?.submit) {
      console.log('submit keys:', Object.keys(expanded.submit));
    }

    const parseCustomerExtra = (value: string) => {
      const result: Record<string, string> = {};
      if (!value) return result;
      value
        .split(/[;&]/)
        .map((part) => part.trim())
        .filter(Boolean)
        .forEach((part) => {
          const [rawKey, rawValue] = part.split('=');
          if (!rawKey) return;
          const key = decodeURIComponent(rawKey.trim());
          const val = decodeURIComponent((rawValue ?? '').trim());
          result[key] = val;
        });
      return result;
    };

    const customerExtraRaw = String(
      expanded?.customer_extra || expanded?.submit?.customer_extra || '',
    ).trim();
    const customerExtra = parseCustomerExtra(customerExtraRaw);

    const subscriptionInfo =
      expanded?.subscription || expanded?.submit?.subscription || null;

    const parseProdamusDate = (value: string) => {
      if (!value) return null;
      const trimmed = String(value).trim();
      if (!trimmed) return null;
      if (trimmed.includes('T')) {
        const d = new Date(trimmed);
        return isNaN(d.getTime()) ? null : d;
      }
      const normalized = trimmed.replace(' ', 'T');
      const withSeconds = /\d{2}:\d{2}:\d{2}/.test(normalized)
        ? normalized
        : `${normalized}:00`;
      const d = new Date(withSeconds);
      return isNaN(d.getTime()) ? null : d;
    };

    const orderNum = String(
      expanded?.order_num || expanded?.submit?.order_num || '',
    ).trim();
    const prodamusOrderId = String(
      expanded?.order_id || expanded?.submit?.order_id || '',
    ).trim();

    const planCodeFromOrder = orderNum.includes('|')
      ? orderNum.split('|')[1]
      : null;
    const allowedPlans = new Set(['wa', 'tg', 'wa_tg']);
    const planCodeCandidate =
      planCodeFromOrder ||
      customerExtra.plan_code ||
      PLAN_BY_SUBSCRIPTION_ID[String(subscriptionInfo?.id || '')] ||
      '';
    const planCode = allowedPlans.has(String(planCodeCandidate))
      ? String(planCodeCandidate)
      : 'wa_tg';

    const paymentStatus = String(expanded?.payment_status || '').trim();

    const supabase = this.supabaseService.getClient();

    let paymentRow: any = null;

    if (orderNum) {
      const { data, error } = await supabase
        .from('payments')
        .select('*')
        .eq('order_id', orderNum)
        .maybeSingle();
      if (!error) paymentRow = data;
    }

    if (!paymentRow && customerExtra.payment_id) {
      const { data } = await supabase
        .from('payments')
        .select('*')
        .eq('id', customerExtra.payment_id)
        .maybeSingle();
      paymentRow = data;
    }

    if (!paymentRow && orderNum) {
      const { data } = await supabase
        .from('payments')
        .select('*')
        .eq('id', orderNum)
        .maybeSingle();
      paymentRow = data;
    }

    if (!paymentRow && customerExtra.user_id) {
      paymentRow = { id: null, user_id: customerExtra.user_id };
    }

    if (!paymentRow) {
      return { success: true, ignored: true, reason: 'payment_not_found' };
    }

    if (paymentRow?.status === 'paid') {
      return { success: true, already_processed: true };
    }

    const isSuccess = paymentStatus === 'success';
    const newPaymentStatus = isSuccess ? 'paid' : 'failed';

    if (paymentRow?.id) {
      await supabase
        .from('payments')
        .update({
          provider_payment_id: prodamusOrderId || paymentRow.provider_payment_id,
          status: newPaymentStatus,
          paid_at: isSuccess ? new Date().toISOString() : null,
          raw: expanded,
        })
        .eq('id', paymentRow.id);
    }

    if (!isSuccess) {
      return { success: true };
    }

    const nowMs = Date.now();
    let baseEndMs = nowMs;

    if (
      paymentRow.current_period_end &&
      new Date(paymentRow.current_period_end).getTime() > nowMs
    ) {
      baseEndMs = new Date(paymentRow.current_period_end).getTime();
    }

    const startIso = new Date(baseEndMs).toISOString();

    const nextPaymentDate = subscriptionInfo?.date_next_payment
      ? parseProdamusDate(String(subscriptionInfo.date_next_payment))
      : null;

    const endIso = nextPaymentDate
      ? nextPaymentDate.toISOString()
      : new Date(baseEndMs + 30 * 24 * 60 * 60 * 1000).toISOString();

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

    return { success: true };
  }
}
