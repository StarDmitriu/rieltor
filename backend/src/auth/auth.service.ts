//backend/src/auth/auth.service.ts
import { Injectable } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as jwt from 'jsonwebtoken';
import { SmsService } from '../sms/sms.service';
import { requireEnv } from '../config/env';
import { randomBytes } from 'crypto';


type ProfileUpdate = {
  full_name?: string;
  gender?: string;
  telegram?: string;
  birthday?: string | null;
  city?: string | null;
};

type OtpRow = {
  phone: string;
  code: string;
  created_at?: string | null;
  expires_at?: string | null;
  attempts?: number | null;
  last_sent_at?: string | null;
  updated_at?: string | null;
};

@Injectable()
export class AuthService {
  private supabase: SupabaseClient;

  // можно переопределить через env при желании
  private readonly OTP_TTL_MIN = Number(process.env.OTP_TTL_MINUTES || 5); // 5 минут
  private readonly OTP_MAX_ATTEMPTS = Number(process.env.OTP_MAX_ATTEMPTS || 5); // 5 попыток
  private readonly OTP_RESEND_COOLDOWN_SEC = Number(
    process.env.OTP_RESEND_COOLDOWN_SEC || 60,
  ); // 60 секунд

  constructor(private readonly smsService: SmsService) {
    this.supabase = createClient(
      requireEnv('SUPABASE_URL'),
      requireEnv('SUPABASE_KEY'),
    );
  }

  // -------------------------
  // helpers
  // -------------------------

  private nowIso() {
    return new Date().toISOString();
  }

  private addMinutesIso(minutes: number) {
    return new Date(Date.now() + minutes * 60_000).toISOString();
  }

  private safeFail(message: string) {
    return { success: false, message };
  }

  /**
   * Нормализация телефона без внешних либ:
   * - убираем всё кроме цифр
   * - если 11 цифр и начинается с 8 => меняем на 7 (частый РФ кейс)
   * - добавляем '+'
   *
   * Если у тебя много стран, позже лучше заменить на libphonenumber.
   */
  private normalizePhone(input: string): string {
    const raw = String(input || '').trim();
    if (!raw) return '';

    let digits = raw.replace(/[^\d]/g, '');
    if (!digits) return '';

    // RU: 8XXXXXXXXXX -> 7XXXXXXXXXX
    if (digits.length === 11 && digits.startsWith('8')) {
      digits = '7' + digits.slice(1);
    }

    // RU: 10 digits -> assume country code 7
    if (digits.length === 10) {
      digits = '7' + digits;
    }

    // BY: 9 digits -> assume country code 375
    if (digits.length === 9) {
      digits = '375' + digits;
    }

    return digits;
  }

  // ---------- users ----------

  private async findUserByPhone(phone: string) {
    const { data, error } = await this.supabase
      .from('users')
      .select('*')
      .eq('phone', phone)
      .maybeSingle();

    if (error) {
      console.error('Supabase findUserByPhone error:', error);
      throw error;
    }

    return data;
  }

  private async createUser(phone: string) {
    const referral_code = await this.ensureUniqueReferralCode();

    const { data, error } = await this.supabase
      .from('users')
      .insert({
        phone,
        is_verified: true,
        referral_code, // ✅
      })
      .select()
      .single();

    if (error) {
      console.error('Supabase createUser error:', error);
      throw error;
    }

    return data;
  }

  private async updateLastLogin(phone: string) {
    const { data, error } = await this.supabase
      .from('users')
      .update({
        last_login: this.nowIso(),
        is_verified: true,
      })
      .eq('phone', phone)
      .select()
      .single();

    if (error) {
      console.error('Supabase updateLastLogin error:', error);
      throw error;
    }

    return data;
  }

  async getUserById(id: string) {
    const { data, error } = await this.supabase
      .from('users')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      console.error('Supabase getUserById error:', error);
      throw error;
    }

    return data;
  }

  async updateProfile(userId: string, update: ProfileUpdate) {
    const { full_name, gender, telegram, birthday, city } = update;

    if (
      full_name === undefined &&
      gender === undefined &&
      telegram === undefined &&
      birthday === undefined &&
      city === undefined
    ) {
      return await this.getUserById(userId);
    }

    const { data, error } = await this.supabase
      .from('users')
      .update({
        full_name,
        gender,
        telegram,
        birthday: birthday || null,
        city: city || null,
      })
      .eq('id', userId)
      .select()
      .single();

    if (error) {
      console.error('Supabase updateProfile error:', error);
      throw error;
    }

    return data;
  }

  private generateReferralCode(): string {
    // короткий и читабельный код (10 символов)
    return randomBytes(6)
      .toString('base64url')
      .replace(/[-_]/g, '')
      .slice(0, 10);
  }

  private async ensureUniqueReferralCode(): Promise<string> {
    // 10 попыток найти уникальный код
    for (let i = 0; i < 10; i++) {
      const code = this.generateReferralCode();

      const { data, error } = await this.supabase
        .from('users')
        .select('id')
        .eq('referral_code', code)
        .maybeSingle();

      if (error) {
        console.error('Supabase check referral_code error:', error);
        throw error;
      }

      if (!data) return code;
    }

    // на крайний случай — UUID кусок
    return (Date.now().toString(36) + this.generateReferralCode()).slice(0, 12);
  }

  private async findUserByReferralCode(code: string) {
    const ref = String(code || '').trim();
    if (!ref) return null;

    const { data, error } = await this.supabase
      .from('users')
      .select('id,referral_code')
      .eq('referral_code', ref)
      .maybeSingle();

    if (error) {
      console.error('Supabase findUserByReferralCode error:', error);
      throw error;
    }

    return data;
  }

  // ---------- SEND CODE ----------

  async sendCode(phone: string) {
    const normPhone = this.normalizePhone(phone);
    if (!normPhone) return this.safeFail('phone is required');

    // 1) анти-спам: смотрим last_sent_at
    const { data: existing, error: exErr } = await this.supabase
      .from('otp_codes')
      .select('phone, last_sent_at')
      .eq('phone', normPhone)
      .maybeSingle();

    if (exErr) {
      console.error('Supabase select otp_codes (sendCode) error:', exErr);
      return this.safeFail('supabase_select_error');
    }

    if ((existing as any)?.last_sent_at) {
      const last = new Date((existing as any).last_sent_at).getTime();
      const diffSec = Math.floor((Date.now() - last) / 1000);
      if (Number.isFinite(last) && diffSec < this.OTP_RESEND_COOLDOWN_SEC) {
        return this.safeFail('too_many_requests');
      }
    }

    // 2) генерим код
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const now = this.nowIso();

    // 3) сохраняем код с TTL и attempts=0
    const { error: upErr } = await this.supabase.from('otp_codes').upsert(
      {
        phone: normPhone,
        code,
        attempts: 0,
        expires_at: this.addMinutesIso(this.OTP_TTL_MIN),
        last_sent_at: now,
        updated_at: now,
      },
      { onConflict: 'phone' },
    );

    if (upErr) {
      console.error('Supabase upsert otp_codes error:', upErr);
      return this.safeFail('supabase_upsert_error');
    }

    // 4) отправляем SMS
    const text = `Ваш код подтверждения: ${code}`;
    const smsResult = await this.smsService.sendSms(normPhone, text);

    // если SMS не ушло — вернём ошибку
    if (!smsResult?.success) {
      console.warn('SMS send failed', smsResult);
      return this.safeFail('sms_send_failed');
    }

    return { success: true };
  }

  // ---------- VERIFY CODE + LOGIN/REGISTER ----------

  async verifyCode(phone: string, code: string, profile?: ProfileUpdate, ref?: string) {
    const normPhone = this.normalizePhone(phone);
    const normCode = String(code || '').trim();

    if (!normPhone || !normCode) {
      return this.safeFail('phone and code are required');
    }

    const { data, error } = await this.supabase
      .from('otp_codes')
      .select('phone, code, expires_at, attempts')
      .eq('phone', normPhone)
      .maybeSingle();

    if (error) {
      console.error('Supabase select otp_codes (verifyCode) error:', error);
      return this.safeFail('supabase_select_error');
    }

    const row = data as OtpRow | null;
    if (!row) {
      return this.safeFail('invalid_or_expired_code');
    }

    const attempts = Number.isFinite(row.attempts as any)
      ? Number(row.attempts)
      : 0;

    if (attempts >= this.OTP_MAX_ATTEMPTS) {
      return this.safeFail('too_many_attempts');
    }

    if (row.expires_at) {
      const exp = new Date(row.expires_at).getTime();
      if (Number.isFinite(exp) && exp < Date.now()) {
        return this.safeFail('invalid_or_expired_code');
      }
    }

    if (String(row.code || '').trim() !== normCode) {
      await this.supabase
        .from('otp_codes')
        .update({ attempts: attempts + 1, updated_at: this.nowIso() })
        .eq('phone', normPhone);

      return this.safeFail('invalid_or_expired_code');
    }

    // ✅ успех — удаляем OTP сразу
    await this.supabase.from('otp_codes').delete().eq('phone', normPhone);

    // --- логика логина/регистрации ---
    let user = await this.findUserByPhone(normPhone);

    if (!user) {
      if (
        profile &&
        (profile.full_name ||
          profile.gender ||
          profile.telegram ||
          profile.birthday)
      ) {
        user = await this.createUser(normPhone);
        user = await this.updateProfile(user.id, profile);
      } else {
        return this.safeFail('user_not_found');
      }
    } else {
      user = await this.updateLastLogin(normPhone);

      if (profile) {
        user = await this.updateProfile(user.id, profile);
      }
    }

    // --- рефералка (после того как user создан/найден) ---
    try {
      const refCode = String(ref || '').trim();

      if (refCode) {
        const referrer = await this.findUserByReferralCode(refCode);

        // нельзя сам себя
        if (referrer?.id && referrer.id !== user.id) {
          // привязываем только если ещё не привязан
          if (!user.referred_by_user_id) {
            // 1) обновляем user.referred_by_user_id
            const { data: updatedUser, error: upErr } = await this.supabase
              .from('users')
              .update({ referred_by_user_id: referrer.id })
              .eq('id', user.id)
              .select()
              .maybeSingle();

            if (upErr) {
              console.warn('referred_by_user_id update failed:', upErr);
            } else if (updatedUser) {
              user = updatedUser; // ✅ чтобы /auth/me видел поле
            }

            // 2) записываем referrals (если дубль — таблица сама не даст)
            const { error: refErr } = await this.supabase
              .from('referrals')
              .insert({
                referrer_user_id: referrer.id,
                referred_user_id: user.id,
                status: 'registered',
                reward_type: 'days',
                reward_value: 7, // награда по ТЗ: неделя
              });

            if (refErr) {
              // если уже есть запись — это нормально (unique ограничение)
              console.warn(
                'referrals insert failed:',
                refErr?.message || refErr,
              );
            }
          }
        }
      }
    } catch (e) {
      console.warn('referral logic skipped due to error:', e);
    }

    const payload = { userId: user.id, phone: user.phone };

    const token = jwt.sign(payload, requireEnv('JWT_SECRET'), {
      expiresIn: '7d',
    });

    return { success: true, token, user };
  }
}
