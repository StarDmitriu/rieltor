// backend/src/telegram/telegram.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions';
import { Api } from 'telegram';
import { Buffer } from 'buffer';
import bigInt from 'big-integer';

type TgStatus =
  | 'not_connected'
  | 'awaiting_code'
  | 'awaiting_password'
  | 'connected'
  | 'error';

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (v: T) => void;
  reject: (e: any) => void;
};

function deferred<T>(): Deferred<T> {
  let resolve!: (v: T) => void;
  let reject!: (e: any) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function normalizePhone(raw: string) {
  let s = String(raw || '').trim();
  // оставляем только цифры и плюс
  s = s.replace(/[^\d+]/g, '');

  // если без плюса, но похоже на номер — добавим +
  if (!s.startsWith('+') && /^\d{10,15}$/.test(s)) s = '+' + s;

  return s;
}

function normalizeSendTime(v: any): string | null {
  const s = String(v || '').trim();
  if (!s) return null;
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(s) ? s : null;
}

type PendingAuth = {
  client: TelegramClient;
  phone: string;
  createdAt: number;
  status: TgStatus;
  lastError?: string;

  phoneCode: Deferred<string>;
  password: Deferred<string>;
  startPromise: Promise<void>;

  cooldownUntil?: number; // timestamp ms
};

function isProbablyVideo(contentType: string, url: string) {
  const ct = (contentType || '').toLowerCase();
  if (ct.startsWith('video/')) return true;
  const u = (url || '').toLowerCase();
  return (
    u.endsWith('.mp4') ||
    u.endsWith('.mov') ||
    u.endsWith('.webm') ||
    u.endsWith('.mkv')
  );
}

function isProbablyImage(contentType: string, url: string) {
  const ct = (contentType || '').toLowerCase();
  if (ct.startsWith('image/')) return true;
  const u = (url || '').toLowerCase();
  return (
    u.endsWith('.jpg') ||
    u.endsWith('.jpeg') ||
    u.endsWith('.png') ||
    u.endsWith('.webp')
  );
}

async function fetchWithTimeout(url: string, timeoutMs: number) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: 'GET',
      signal: ctrl.signal,
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(
        `tg_media_fetch_failed_${res.status}: ${txt.slice(0, 140)}`,
      );
    }

    const contentType = (res.headers.get('content-type') || '').toLowerCase();
    const arr = await res.arrayBuffer();
    const buf = Buffer.from(arr);

    // если это html/ошибка — обычно contentType text/html
    if (contentType.includes('text/html') || buf.length < 800) {
      throw new Error(
        `tg_media_not_a_file contentType=${contentType} size=${buf.length}`,
      );
    }

    return { buf, contentType };
  } catch (e: any) {
    if (e?.name === 'AbortError') throw new Error('tg_media_fetch_timeout');
    throw e;
  } finally {
    clearTimeout(t);
  }
}

@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);

  private sessions = new Map<string, TelegramClient>(); // userId -> connected client
  private pending = new Map<string, PendingAuth>(); // userId -> auth flow

  constructor(private readonly supabaseService: SupabaseService) {}

  private apiId(): number {
    const v = Number(process.env.TG_API_ID);
    if (!Number.isFinite(v)) throw new Error('TG_API_ID is not set');
    return v;
  }

  private apiHash(): string {
    const v = String(process.env.TG_API_HASH || '').trim();
    if (!v) throw new Error('TG_API_HASH is not set');
    return v;
  }

  // ---------- status ----------
  async getStatus(userId: string) {
    if (this.sessions.has(userId)) {
      return { success: true, status: 'connected' as TgStatus };
    }

    const p = this.pending.get(userId);
    if (p) {
      const left =
        p.cooldownUntil && Date.now() < p.cooldownUntil
          ? Math.ceil((p.cooldownUntil - Date.now()) / 1000)
          : 0;

      return {
        success: true,
        status: p.status,
        lastError: p.lastError || null,
        cooldownSeconds: left || null,
      };
    }

    // если есть сохранённая сессия — пробуем авто-коннект
    const supabase = this.supabaseService.getClient();
    const { data: user, error } = await supabase
      .from('users')
      .select('id, tg_session')
      .eq('id', userId)
      .maybeSingle();

    if (!error && (user as any)?.tg_session) {
      try {
        await this.connectFromSavedSession(
          userId,
          String((user as any).tg_session),
        );
        return { success: true, status: 'connected' as TgStatus };
      } catch (e: any) {
        this.logger.warn(
          `TG connectFromSavedSession failed: ${e?.message ?? e}`,
        );
      }
    }

    return { success: true, status: 'not_connected' as TgStatus };
  }

  private async connectFromSavedSession(userId: string, sessionStr: string) {
    const session = new StringSession(sessionStr);
    const client = new TelegramClient(session, this.apiId(), this.apiHash(), {
      connectionRetries: 5,
      retryDelay: 1000,
    });

    await client.connect();
    const me = await client.getMe().catch(() => null);
    if (!me) {
      await client.disconnect().catch(() => undefined);
      throw new Error('tg_saved_session_invalid');
    }

    this.sessions.set(userId, client);
  }

  // ---------- auth start (send code) ----------
  async startAuth(userId: string) {
    this.logger.log(`[TG] startAuth userId=${userId}`);

    const supabase = this.supabaseService.getClient();
    const { data: user, error } = await supabase
      .from('users')
      .select('id, phone')
      .eq('id', userId)
      .maybeSingle();

    if (error || !user) return { success: false, message: 'user_not_found' };

    let phone = normalizePhone(String((user as any).phone || ''));
    if (!phone.startsWith('+')) {
      return { success: false, message: 'user_phone_invalid_format' };
    }
    this.logger.log(`[TG] normalized phone for ${userId}: ${phone}`);

    // если уже подключён — ок
    if (this.sessions.has(userId)) {
      return {
        success: true,
        status: 'connected' as TgStatus,
        message: 'already_connected',
      };
    }

    // если pending уже есть — не создаём заново (5 минут), а если floodwait — возвращаем его
    const existing = this.pending.get(userId);
    if (existing?.cooldownUntil && Date.now() < existing.cooldownUntil) {
      const left = Math.ceil((existing.cooldownUntil - Date.now()) / 1000);
      return {
        success: false,
        status: existing.status,
        message: 'tg_flood_wait',
        seconds: left,
      };
    }

    if (existing && Date.now() - existing.createdAt < 5 * 60_000) {
      return {
        success: true,
        status: existing.status,
        message: 'already_started',
      };
    }

    const session = new StringSession('');
    const client = new TelegramClient(session, this.apiId(), this.apiHash(), {
      connectionRetries: 2,
    });

    await client.connect();

    const sendCode = (client as any).sendCode?.bind(client);
    if (sendCode) {
      (client as any).sendCode = async (...args: any[]) => {
        const res = await sendCode(...args);
        const typeClass =
          (res as any)?.type?.className ||
          (res as any)?.type?._ ||
          (res as any)?.type?.constructor?.name ||
          '';
        const nextTypeClass =
          (res as any)?.nextType?.className ||
          (res as any)?.nextType?._ ||
          (res as any)?.nextType?.constructor?.name ||
          '';
        const timeout = (res as any)?.timeout;
        this.logger.log(
          `[TG] sendCode type=${typeClass || 'unknown'} nextType=${
            nextTypeClass || 'none'
          } timeout=${timeout ?? 'n/a'}`,
        );
        const isCodeViaApp = (res as any)?.isCodeViaApp;
        const hashLen = String((res as any)?.phoneCodeHash || '').length;
        this.logger.log(
          `[TG] sendCode keys=${Object.keys(res || {}).join(',')} typeKeys=${Object.keys(
            (res as any)?.type || {},
          ).join(',')}`,
        );
        this.logger.log(
          `[TG] sendCode isCodeViaApp=${String(isCodeViaApp)} phoneCodeHashLen=${hashLen}`,
        );
        return res;
      };
    }

    const phoneCode = deferred<string>();
    const password = deferred<string>();

    const p: PendingAuth = {
      client,
      phone,
      createdAt: Date.now(),
      status: 'awaiting_code',
      phoneCode,
      password,
      startPromise: Promise.resolve(),
    };

    // ВАЖНО: НЕ вызываем auth.SendCode вручную.
    // client.start сам отправит код и будет ждать ввода через phoneCode().
    p.startPromise = client.start({
      phoneNumber: async () => phone,

      phoneCode: async () => {
        this.logger.log(
          '[TG] phoneCode() callback entered (code was sent by Telegram)',
        );
        const code = await p.phoneCode.promise;
        p.phoneCode = deferred<string>(); // allow retries if code wrong
        return code;
      },

      password: async () => {
        p.status = 'awaiting_password';
        p.lastError = undefined;
        this.pending.set(userId, p);

        const pass = await p.password.promise;
        p.password = deferred<string>(); // allow retries
        return pass;
      },

      onError: (err) => {
        const msg = String((err as any)?.message ?? err);
        this.logger.warn(`[TG] start onError: ${msg}`);

        // TIMEOUT — шум gramjs, не считаем фатальным
        if (msg.includes('TIMEOUT')) {
          this.logger.warn(`[TG] TIMEOUT ignored: ${msg}`);
          return;
        }

        // FLOOD_WAIT
        const m = msg.match(/A wait of (\d+) seconds is required/i);
        if (m) {
          const seconds = Number(m[1] || 0);
          p.status = 'awaiting_code';
          p.lastError = `flood_wait_${seconds}`;
          p.cooldownUntil = Date.now() + seconds * 1000;
          this.pending.set(userId, p);
          void p.client.disconnect().catch(() => undefined);
          return;
        }

        p.status = 'error';
        p.lastError = msg;
        this.pending.set(userId, p);
      },
    });

    // если startPromise упал (не через onError) — зафиксируем
    p.startPromise.catch((e: any) => {
      const msg = String(e?.message ?? e);

      if (msg.includes('TIMEOUT')) {
        this.logger.warn(`[TG] startPromise TIMEOUT ignored: ${msg}`);
        return;
      }

      const m = msg.match(/A wait of (\d+) seconds is required/i);
      if (m) {
        const seconds = Number(m[1] || 0);
        p.status = 'awaiting_code';
        p.lastError = `flood_wait_${seconds}`;
        p.cooldownUntil = Date.now() + seconds * 1000;
        this.pending.set(userId, p);
        void p.client.disconnect().catch(() => undefined);
        return;
      }

      p.status = 'error';
      p.lastError = msg;
      this.pending.set(userId, p);
      this.logger.warn(`[TG] startPromise failed: ${msg}`);
    });

    this.pending.set(userId, p);
    return { success: true, status: 'awaiting_code' as TgStatus };
  }

  // ---------- auth confirm code ----------
  async confirmCode(userId: string, code: string) {
    const p = this.pending.get(userId);
    if (!p) return { success: false, message: 'auth_not_started' };

    // если floodwait ещё активен — не принимаем код и не дёргаем start
    if (p.cooldownUntil && Date.now() < p.cooldownUntil) {
      const left = Math.ceil((p.cooldownUntil - Date.now()) / 1000);
      return {
        success: false,
        message: 'tg_flood_wait',
        seconds: left,
        status: p.status,
      };
    }

    const c = String(code || '').trim();
    if (!c) return { success: false, message: 'code_required' };

    try {
      p.phoneCode.resolve(c);

      // даём start() шанс завершиться / переключить статус на пароль
      await Promise.race([
        p.startPromise,
        new Promise((res) => setTimeout(res, 400)),
      ]);

      const me = await p.client.getMe().catch(() => null);
      if (me) {
        const sessionStr = (p.client.session as any).save() as string;

        const supabase = this.supabaseService.getClient();
        await supabase
          .from('users')
          .update({ tg_session: sessionStr })
          .eq('id', userId);

        this.sessions.set(userId, p.client);
        this.pending.delete(userId);

        return { success: true, status: 'connected' as TgStatus };
      }

      return {
        success: true,
        status: p.status as TgStatus,
        lastError: p.lastError || null,
      };
    } catch (e: any) {
      const msg = String(e?.message ?? e);

      if (msg.includes('PHONE_CODE_INVALID')) {
        p.lastError = 'invalid_code';
        this.pending.set(userId, p);
        return { success: false, message: 'invalid_code' };
      }
      if (msg.includes('PHONE_CODE_EXPIRED')) {
        p.lastError = 'code_expired';
        this.pending.set(userId, p);
        return { success: false, message: 'code_expired' };
      }

      const m = msg.match(/A wait of (\d+) seconds is required/i);
      if (m) {
        const seconds = Number(m[1] || 0);
        p.status = 'awaiting_code';
        p.lastError = `flood_wait_${seconds}`;
        p.cooldownUntil = Date.now() + seconds * 1000;
        this.pending.set(userId, p);
        return { success: false, message: 'tg_flood_wait', seconds };
      }

      p.lastError = msg;
      this.pending.set(userId, p);
      return { success: false, message: 'tg_confirm_code_failed', error: msg };
    }
  }

  // ---------- auth confirm password (2FA) ----------
  async confirmPassword(userId: string, password: string) {
    const p = this.pending.get(userId);
    if (!p) return { success: false, message: 'auth_not_started' };

    const pass = String(password || '').trim();
    if (!pass) return { success: false, message: 'password_required' };

    try {
      p.password.resolve(pass);

      await p.startPromise;

      const me = await p.client.getMe().catch(() => null);
      if (!me) throw new Error('tg_password_auth_failed');

      const sessionStr = (p.client.session as any).save() as string;

      const supabase = this.supabaseService.getClient();
      await supabase
        .from('users')
        .update({ tg_session: sessionStr })
        .eq('id', userId);

      this.sessions.set(userId, p.client);
      this.pending.delete(userId);

      return { success: true, status: 'connected' as TgStatus };
    } catch (e: any) {
      const msg = String(e?.message ?? e);

      const m = msg.match(/A wait of (\d+) seconds is required/i);
      if (m) {
        const seconds = Number(m[1] || 0);
        p.status = 'awaiting_code';
        p.lastError = `flood_wait_${seconds}`;
        p.cooldownUntil = Date.now() + seconds * 1000;
        this.pending.set(userId, p);
        return { success: false, message: 'tg_flood_wait', seconds };
      }

      p.lastError = msg;
      p.status = 'awaiting_password';
      this.pending.set(userId, p);
      return { success: false, message: 'tg_password_failed', error: msg };
    }
  }

  async disconnect(userId: string) {
    const c = this.sessions.get(userId);
    if (c) {
      await c.disconnect().catch(() => undefined);
      this.sessions.delete(userId);
    }

    const p = this.pending.get(userId);
    if (p) {
      await p.client.disconnect().catch(() => undefined);
      this.pending.delete(userId);
    }

    // важно: иначе status() сразу подключит обратно
    const supabase = this.supabaseService.getClient();
    await supabase.from('users').update({ tg_session: null }).eq('id', userId);

    return { success: true };
  }

  // ---------- sync groups ----------
  async syncGroups(userId: string) {
    const client = await this.getConnectedClient(userId);
    if (!client) return { success: false, message: 'telegram_not_connected' };

    const supabase = this.supabaseService.getClient();
    const { data: existingTimes, error: timeErr } = await supabase
      .from('telegram_groups')
      .select('tg_chat_id, send_time')
      .eq('user_id', userId);

    if (timeErr) {
      this.logger.error(
        'Supabase select telegram_groups send_time error',
        timeErr as any,
      );
      return { success: false, message: 'supabase_select_error', error: timeErr };
    }

    const sendTimeMap = new Map(
      (existingTimes ?? []).map((r: any) => [
        String(r.tg_chat_id),
        r.send_time,
      ]),
    );

    let dialogs;
    try {
      dialogs = await client.getDialogs({});
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      if (msg.includes('TIMEOUT')) {
        this.logger.warn(`TG getDialogs TIMEOUT: ${msg}`);
        return { success: false, message: 'telegram_timeout', error: msg };
      }
      this.logger.error(`TG getDialogs failed: ${msg}`);
      return {
        success: false,
        message: 'telegram_get_dialogs_failed',
        error: msg,
      };
    }

    const nowIso = new Date().toISOString();
    const rows: any[] = [];

    for (const d of dialogs) {
      const ent: any = d.entity;

      const isGroup = ent?.className === 'Chat' || ent?.className === 'Channel';
      if (!isGroup) continue;

      // exclude broadcast channels
      if (ent?.className === 'Channel' && ent?.broadcast) continue;

      const chatIdStr = String(ent?.id);
      if (!chatIdStr) continue;

      const type =
        ent?.className === 'Chat'
          ? 'chat'
          : ent?.className === 'Channel'
            ? 'channel'
            : null;

      const accessHashStr =
        ent?.className === 'Channel' && ent?.accessHash != null
          ? String(ent.accessHash)
          : null;

      rows.push({
        user_id: userId,
        tg_chat_id: chatIdStr,
        tg_type: type,
        tg_access_hash: accessHashStr,
        title: ent?.title ?? null,
        participants_count: null,
        is_selected: true,
        updated_at: nowIso,
        send_time: sendTimeMap.get(chatIdStr) ?? null,
      });
    }

    const { error } = await supabase
      .from('telegram_groups')
      .upsert(rows, { onConflict: 'user_id,tg_chat_id' });

    if (error) {
      this.logger.error('Supabase upsert telegram_groups error', error as any);
      return { success: false, message: 'supabase_upsert_error', error };
    }

    return { success: true, count: rows.length };
  }

  async getGroupsFromDb(userId: string) {
    const supabase = this.supabaseService.getClient();
    const { data, error } = await supabase
      .from('telegram_groups')
      .select(
        'tg_chat_id, title, participants_count, is_selected, updated_at, send_time',
      )
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });

    if (error) {
      this.logger.error('Supabase select telegram_groups error', error as any);
      return { success: false, message: 'supabase_select_error', error };
    }
    return { success: true, groups: data ?? [] };
  }

  async setGroupSelected(params: {
    userId: string;
    tgChatId: string;
    isSelected: boolean;
  }) {
    const supabase = this.supabaseService.getClient();
    const { userId, tgChatId, isSelected } = params;

    const { data, error } = await supabase
      .from('telegram_groups')
      .update({ is_selected: isSelected, updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('tg_chat_id', tgChatId)
      .select('tg_chat_id, is_selected')
      .maybeSingle();

    if (error) {
      this.logger.error('Supabase update telegram_groups error', error as any);
      return { success: false, message: 'supabase_update_error', error };
    }
    if (!data) return { success: false, message: 'group_not_found' };
    return { success: true, group: data };
  }

  async setGroupSendTime(params: {
    userId: string;
    tgChatId: string;
    sendTime: string | null;
  }) {
    const supabase = this.supabaseService.getClient();
    const { userId, tgChatId, sendTime } = params;
    const normalized = normalizeSendTime(sendTime);

    const { data, error } = await supabase
      .from('telegram_groups')
      .update({ send_time: normalized, updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('tg_chat_id', tgChatId)
      .select('tg_chat_id, send_time')
      .maybeSingle();

    if (error) {
      this.logger.error('Supabase update telegram_groups error', error as any);
      return { success: false, message: 'supabase_update_error', error };
    }
    if (!data) return { success: false, message: 'group_not_found' };
    return { success: true, group: data };
  }

  // ---------- send ----------
  async sendToGroup(
    userId: string,
    tgChatId: string,
    payload: { text: string; mediaUrl?: string | null },
  ) {
    const client = await this.getConnectedClient(userId);
    if (!client) throw new Error('telegram_not_connected');

    const rawId = String(tgChatId || '').trim();
    if (!rawId) throw new Error('tg_chat_id_empty');

    // достаём peer-данные из БД
    const supabase = this.supabaseService.getClient();
    const { data: g, error: gErr } = await supabase
      .from('telegram_groups')
      .select('tg_chat_id, tg_type, tg_access_hash')
      .eq('user_id', userId)
      .eq('tg_chat_id', rawId)
      .maybeSingle();

    if (gErr) throw new Error(`supabase_telegram_groups_error:${gErr.message}`);

    let peer: any = null;
    const tgType = String((g as any)?.tg_type || '');
    const ah = (g as any)?.tg_access_hash;

    if (tgType === 'chat') {
      peer = new Api.InputPeerChat({ chatId: bigInt(rawId) });
    } else if (tgType === 'channel') {
      if (!ah) throw new Error('tg_access_hash_missing');
      peer = new Api.InputPeerChannel({
        channelId: bigInt(rawId),
        accessHash: bigInt(String(ah)),
      });
    } else {
      peer = /^-?\d+$/.test(rawId) ? bigInt(rawId) : rawId;
    }

    const text = payload.text || '';
    const mediaUrl = String(payload.mediaUrl || '').trim();

    if (!mediaUrl) {
      await client.sendMessage(peer, { message: text });
      return;
    }

    // скачиваем медиа
    let buf: Buffer;
    let contentType = '';
    try {
      const r = await fetchWithTimeout(mediaUrl, 25_000);
      buf = r.buf;
      contentType = r.contentType;
    } catch {
      // если медиа не скачалось — отправим хотя бы текст
      await client.sendMessage(peer, { message: text });
      return;
    }

    const isVideo = isProbablyVideo(contentType, mediaUrl);
    const isImage = isProbablyImage(contentType, mediaUrl);

    if (isVideo || isImage) {
      await client.sendFile(peer, {
        file: buf,
        caption: text,
        forceDocument: false,
      });
      return;
    }

    await client.sendMessage(peer, { message: text });
  }

  // ---------- helper: connect if session exists ----------
  private async getConnectedClient(
    userId: string,
  ): Promise<TelegramClient | null> {
    const existing = this.sessions.get(userId);
    if (existing) return existing;

    const supabase = this.supabaseService.getClient();
    const { data: user, error } = await supabase
      .from('users')
      .select('id, tg_session')
      .eq('id', userId)
      .maybeSingle();

    if (error || !(user as any)?.tg_session) return null;

    try {
      await this.connectFromSavedSession(
        userId,
        String((user as any).tg_session),
      );
      return this.sessions.get(userId) ?? null;
    } catch (e: any) {
      this.logger.warn(`TG auto-connect failed: ${e?.message ?? e}`);
      return null;
    }
  }
}
