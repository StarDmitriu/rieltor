//backend/src/subscriptions/subscriptions.service.ts
import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

type SubStatus =
  | 'none'
  | 'trial'
  | 'active'
  | 'canceled'
  | 'expired'
  | 'blocked';

@Injectable()
export class SubscriptionsService {
  constructor(private readonly supabaseService: SupabaseService) {}

  private nowIso() {
    return new Date().toISOString();
  }

  private addDaysIso(days: number) {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d.toISOString();
  }

  async getUserAndSub(userId: string) {
    const supabase = this.supabaseService.getClient();

    const { data: user, error: uErr } = await supabase
      .from('users')
      .select('id,is_blocked')
      .eq('id', userId)
      .maybeSingle();
    if (uErr) throw new Error(`supabase_users_error:${uErr.message}`);

    const { data: sub, error: sErr } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    if (sErr) throw new Error(`supabase_subscriptions_error:${sErr.message}`);

    return { user, sub };
  }

  async getMySubscription(userId: string) {
    const { user, sub } = await this.getUserAndSub(userId);

    const now = Date.now();

    const trialEndsMs = sub?.trial_ends_at
      ? new Date(sub.trial_ends_at).getTime()
      : 0;
    const paidEndsMs = sub?.current_period_end
      ? new Date(sub.current_period_end).getTime()
      : 0;

    const trialDaysLeft =
      trialEndsMs > now
        ? Math.max(0, Math.ceil((trialEndsMs - now) / 86400000))
        : 0;

    const paidDaysLeft =
      paidEndsMs > now
        ? Math.max(0, Math.ceil((paidEndsMs - now) / 86400000))
        : 0;

    const accessEndsMs = Math.max(trialEndsMs, paidEndsMs);
    const accessDaysLeft =
      accessEndsMs > now
        ? Math.max(0, Math.ceil((accessEndsMs - now) / 86400000))
        : 0;

    const trialActive = trialEndsMs > now;
    const paidActive = paidEndsMs > now;

    // статус для UI можно “вычислять”
    const derivedStatus: SubStatus = paidActive
      ? 'active'
      : trialActive
        ? 'trial'
        : 'none';

    return {
      success: true,
      isBlocked: !!user?.is_blocked,
      subscription: sub || { status: 'none', plan_code: 'base' },

      // ✅ новые поля (отдельно)
      status: derivedStatus,
      trialDaysLeft,
      paidDaysLeft,
      accessDaysLeft,

      trialEndsAt: sub?.trial_ends_at || null,
      paidEndsAt: sub?.current_period_end || null,
      accessEndsAt: accessEndsMs ? new Date(accessEndsMs).toISOString() : null,

      now: new Date(now).toISOString(),
    };
  }

  async startTrial(userId: string, days = 3) {
    const supabase = this.supabaseService.getClient();
    const nowIso = this.nowIso();

    const { user, sub } = await this.getUserAndSub(userId);
    if (!user) return { success: false, message: 'user_not_found' };

    if (user.is_blocked) {
      return { success: false, message: 'user_blocked' };
    }

    // Если уже есть активная подписка — тест не даём
    if (sub?.status === 'active') {
      return { success: false, message: 'already_active' };
    }

    // Если уже есть активный trial и он не истёк — не перезапускаем
    if (sub?.status === 'trial' && sub?.trial_ends_at) {
      const t = new Date(sub.trial_ends_at);
      if (t.getTime() > Date.now()) {
        return { success: false, message: 'trial_already_running' };
      }
    }

    const trialEndsAt = this.addDaysIso(days);

    const row = {
      user_id: userId,
      status: 'trial',
      plan_code: 'base',
      trial_started_at: nowIso,
      trial_ends_at: trialEndsAt,

      cancel_at_period_end: false,
      updated_at: nowIso,
    };

    const { data, error } = await supabase
      .from('subscriptions')
      .upsert(row, { onConflict: 'user_id' })
      .select()
      .single();

    if (error)
      return { success: false, message: 'supabase_upsert_error', error };

    return { success: true, subscription: data };
  }

  // Главная функция для защиты доступа
  async hasAccess(
    userId: string,
  ): Promise<{ allowed: boolean; reason?: string }> {
    const { user, sub } = await this.getUserAndSub(userId);

    if (!user) return { allowed: false, reason: 'user_not_found' };
    if (user.is_blocked) return { allowed: false, reason: 'blocked' };

    const now = Date.now();

    const trialEnds = sub?.trial_ends_at
      ? new Date(sub.trial_ends_at).getTime()
      : 0;
    if (trialEnds > now) return { allowed: true };

    const paidEnds = sub?.current_period_end
      ? new Date(sub.current_period_end).getTime()
      : 0;
    if (paidEnds > now) return { allowed: true };

    // чуть более понятные причины
    if (trialEnds || sub?.status === 'trial')
      return { allowed: false, reason: 'trial_expired' };
    if (paidEnds || sub?.status === 'active')
      return { allowed: false, reason: 'subscription_expired' };

    return { allowed: false, reason: 'no_subscription' };
  }
}
