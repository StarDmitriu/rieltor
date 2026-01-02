import { Injectable } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as jwt from 'jsonwebtoken';
import { SmsService } from '../sms/sms.service';

@Injectable()
export class AuthService {
  private supabase: SupabaseClient;

  constructor(private readonly smsService: SmsService) {
    this.supabase = createClient(
      process.env.SUPABASE_URL as string,
      process.env.SUPABASE_KEY as string,
    );
  }

  // ---------- ВСПОМОГАТЕЛЬНЫЕ МЕТОДЫ ДЛЯ users ----------

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
    const { data, error } = await this.supabase
      .from('users')
      .insert({
        phone,
        is_verified: true,
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
        last_login: new Date().toISOString(),
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

  // обновление профиля по id (используем для регистрации)
  async updateProfile(
    userId: string,
    update: {
      full_name?: string;
      gender?: string;
      telegram?: string;
      birthday?: string | null;
    },
  ) {
    const { full_name, gender, telegram, birthday } = update;

    // если реально ничего не передали — просто возвращаем текущего пользователя
    if (
      full_name === undefined &&
      gender === undefined &&
      telegram === undefined &&
      birthday === undefined
    ) {
      const user = await this.getUserById(userId);
      return user;
    }

    const { data, error } = await this.supabase
      .from('users')
      .update({
        full_name,
        gender,
        telegram,
        birthday: birthday || null,
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

  // ---------- ОТПРАВКА КОДА ----------

  async sendCode(phone: string) {
    if (!phone) {
      return { success: false, message: 'phone is required' };
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();

    const { data, error } = await this.supabase
      .from('otp_codes')
      .upsert({ phone, code })
      .select();

    console.log('SUPABASE UPSERT OTP:', { data, error });
    console.log('OTP CODE (debug):', code);

    if (error) {
      return { success: false, message: 'supabase_upsert_error', error };
    }

    const text = `Ваш код подтверждения: ${code}`;
    const smsResult = await this.smsService.sendSms(phone, text);

    /*if (!smsResult.success) {
      console.warn('Не удалось отправить SMS, но код сохранён в БД', smsResult);
    }*/

    return { success: true };
  }

  // получить user по id (для /auth/me)
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

  // ---------- ПРОВЕРКА КОДА + ЛОГИН/РЕГИСТРАЦИЯ ----------

  async verifyCode(
    phone: string,
    code: string,
    profile?: {
      full_name?: string;
      gender?: string;
      telegram?: string;
      birthday?: string | null;
    },
  ) {
    if (!phone || !code) {
      return { success: false, message: 'phone and code are required' };
    }

    const { data, error } = await this.supabase
      .from('otp_codes')
      .select('*')
      .eq('phone', phone)
      .maybeSingle();

    console.log('SUPABASE SELECT OTP:', { data, error });

    if (error) {
      return { success: false, message: 'supabase_select_error', error };
    }

    if (!data) {
      return { success: false, message: 'Код не найден' };
    }

    if (data.code !== code) {
      return { success: false, message: 'Неверный код' };
    }

    // TTL проверки сейчас нет (отключена на время разработки)
    // ❗️Чтобы двойной запрос /auth/verify-code не ломал логин,
    // удаляем OTP чуть позже (а не мгновенно)
    setTimeout(() => {
      this.supabase
        .from('otp_codes')
        .delete()
        .eq('phone', phone)
        .then(() => undefined)
    }, 30_000);

    // --- логика логина / регистрации ---

    let user = await this.findUserByPhone(phone);

    if (!user) {
      // пользователя нет в БД
      if (
        profile &&
        (profile.full_name ||
          profile.gender ||
          profile.telegram ||
          profile.birthday)
      ) {
        // РЕГИСТРАЦИЯ: есть профиль → создаём пользователя и применяем профиль
        user = await this.createUser(phone);
        user = await this.updateProfile(user.id, profile);
      } else {
        // ЛОГИН: профиль не передан → не даём войти
        return { success: false, message: 'user_not_found' };
      }
    } else {
      // пользователь уже есть → обновляем last_login
      user = await this.updateLastLogin(phone);

      // если при логине вдруг передали профиль (теоретически) — обновим
      if (profile) {
        user = await this.updateProfile(user.id, profile);
      }
    }

    const payload = {
      userId: user.id,
      phone: user.phone,
    };

    const token = jwt.sign(
      payload,
      (process.env.JWT_SECRET as string) || 'dev_secret',
      { expiresIn: '7d' },
    );

    return {
      success: true,
      token,
      user,
    };
  }
}
