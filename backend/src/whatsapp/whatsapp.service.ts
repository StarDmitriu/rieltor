// backend/src/whatsapp/whatsapp.service.ts
import { Injectable, Logger } from '@nestjs/common';
import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  WASocket,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import * as path from 'path';
import * as fs from 'fs';
import pino from 'pino';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
// ... твои импорты
import { Buffer } from 'buffer';

function isProbablyVideo(contentType: string, url: string) {
  const ct = (contentType || '').toLowerCase();
  if (ct.startsWith('video/')) return true;
  const u = (url || '').toLowerCase();
  return u.endsWith('.mp4') || u.endsWith('.mov') || u.endsWith('.webm') || u.endsWith('.mkv');
}

async function fetchWithTimeout(url: string, timeoutMs: number) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: 'GET',
      signal: ctrl.signal,
      headers: {
        // иногда помогает против “капризных” хостингов
        'User-Agent': 'Mozilla/5.0',
      },
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(`media_fetch_failed_${res.status}: ${txt.slice(0, 120)}`);
    }

    const contentType = res.headers.get('content-type') || '';
    const arr = await res.arrayBuffer();
    const buf = Buffer.from(arr);
    return { buf, contentType };
  } catch (e: any) {
    if (e?.name === 'AbortError') throw new Error('media_fetch_timeout');
    throw e;
  } finally {
    clearTimeout(t);
  }
}

function normalizeSendTime(v: any): string | null {
  const s = String(v || '').trim();
  if (!s) return null;
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(s) ? s : null;
}


export type WhatsappStatus =
  | 'not_connected'
  | 'connecting'
  | 'pending_qr'
  | 'connected'
  | 'error';

export interface SessionInfo {
  status: WhatsappStatus;
  qr?: string;
  lastError?: string;
}

type InternalSession = {
  info: SessionInfo;
  sock?: WASocket;
  starting?: Promise<void>;
  restartAttempts: number;
  lastQrAt?: number;
  lastChangeAt: number;
};

@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);

  private sessions = new Map<string, InternalSession>();

  private supabase: SupabaseClient;

  constructor() {
    this.supabase = createClient(
      process.env.SUPABASE_URL as string,
      process.env.SUPABASE_KEY as string,
    );
  }

  private getAuthDir(userId: string) {
    return path.join(process.cwd(), 'wa_auth', userId);
  }

  private ensureSession(userId: string): InternalSession {
    const existing = this.sessions.get(userId);
    if (existing) return existing;

    const s: InternalSession = {
      info: { status: 'not_connected' },
      restartAttempts: 0,
      lastChangeAt: Date.now(),
    };
    this.sessions.set(userId, s);
    return s;
  }

  getStatus(userId: string): SessionInfo {
    return this.ensureSession(userId).info;
  }

  resetSession(userId: string) {
    const s = this.ensureSession(userId);
    try {
      s.sock?.end?.(new Error('manual reset'));
    } catch {}
    s.sock = undefined;
    s.starting = undefined;
    s.restartAttempts = 0;

    const authDir = this.getAuthDir(userId);
    if (fs.existsSync(authDir)) {
      fs.rmSync(authDir, { recursive: true, force: true });
    }

    s.info = { status: 'not_connected' };
    s.lastChangeAt = Date.now();
  }

  async startSession(userId: string): Promise<SessionInfo> {
    const s = this.ensureSession(userId);

    if (s.info.status === 'connected') return s.info;

    if (s.starting) {
      await s.starting.catch(() => undefined);
      return s.info;
    }

    s.starting = this.startInternal(userId).finally(() => {
      s.starting = undefined;
    });

    await s.starting.catch(() => undefined);
    return s.info;
  }

  async syncGroups(userId: string) {
    const s = this.ensureSession(userId);

    if (!s.sock || s.info.status !== 'connected') {
      return {
        success: false,
        message: 'whatsapp_not_connected',
      };
    }

    const { data: existingTimes, error: timeErr } = await this.supabase
      .from('whatsapp_groups')
      .select('wa_group_id, send_time')
      .eq('user_id', userId);

    if (timeErr) {
      this.logger.error(
        'Supabase select whatsapp_groups send_time error',
        timeErr as any,
      );
      return { success: false, message: 'supabase_select_error', error: timeErr };
    }

    const sendTimeMap = new Map(
      (existingTimes ?? []).map((r: any) => [
        String(r.wa_group_id),
        r.send_time,
      ]),
    );

    const groupsMap = await s.sock.groupFetchAllParticipating();
    const groups = Object.values(groupsMap ?? {});

    const nowIso = new Date().toISOString();

    const rows = groups.map((g: any) => ({
      user_id: userId,
      wa_group_id: g.id,
      subject: g.subject ?? null,
      participants_count: Array.isArray(g.participants)
        ? g.participants.length
        : null,
      is_announcement: !!g.announce,
      is_restricted: !!g.restrict,
      updated_at: nowIso,
      send_time: sendTimeMap.get(String(g.id)) ?? null,

      // ✅ важно: если колонка есть — новые группы будут включены по умолчанию
      // если колонки ещё нет (до миграции) — Supabase просто проигнорирует поле
      is_selected: true,
    }));

    const { error } = await this.supabase
      .from('whatsapp_groups')
      .upsert(rows, { onConflict: 'user_id,wa_group_id' });

    if (error) {
      this.logger.error('Supabase upsert whatsapp_groups error', error as any);
      return { success: false, message: 'supabase_upsert_error', error };
    }

    return { success: true, count: rows.length };
  }

  async getGroupsFromDb(userId: string) {
    // ✅ добавили is_selected
    const { data, error } = await this.supabase
      .from('whatsapp_groups')
      .select(
        'wa_group_id, subject, participants_count, is_announcement, is_restricted, updated_at, is_selected, send_time',
      )
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });

    if (error) {
      this.logger.error('Supabase select whatsapp_groups error', error as any);
      return { success: false, message: 'supabase_select_error', error };
    }

    return { success: true, groups: data ?? [] };
  }

  // ✅ НОВОЕ: включить/выключить группу для рассылки
  async setGroupSelected(params: {
    userId: string;
    waGroupId: string;
    isSelected: boolean;
  }) {
    const { userId, waGroupId, isSelected } = params;

    const { data, error } = await this.supabase
      .from('whatsapp_groups')
      .update({
        is_selected: isSelected,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .eq('wa_group_id', waGroupId)
      .select('wa_group_id, is_selected')
      .maybeSingle();

    if (error) {
      this.logger.error('Supabase update whatsapp_groups error', error as any);
      return { success: false, message: 'supabase_update_error', error };
    }

    if (!data) {
      return { success: false, message: 'group_not_found' };
    }

    return { success: true, group: data };
  }

  async setGroupSendTime(params: {
    userId: string;
    waGroupId: string;
    sendTime: string | null;
  }) {
    const { userId, waGroupId, sendTime } = params;
    const normalized = normalizeSendTime(sendTime);

    const { data, error } = await this.supabase
      .from('whatsapp_groups')
      .update({
        send_time: normalized,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .eq('wa_group_id', waGroupId)
      .select('wa_group_id, send_time')
      .maybeSingle();

    if (error) {
      this.logger.error(
        'Supabase update whatsapp_groups send_time error',
        error as any,
      );
      return { success: false, message: 'supabase_update_error', error };
    }

    if (!data) return { success: false, message: 'group_not_found' };
    return { success: true, group: data };
  }

  async sendToGroup(
    userId: string,
    groupJid: string,
    payload: { text: string; mediaUrl?: string | null },
  ) {
    const s = this.ensureSession(userId);

    if (!s.sock || s.info.status !== 'connected') {
      throw new Error('whatsapp_not_connected');
    }

    const text = payload.text || '';
    const mediaUrl = (payload.mediaUrl || '').trim();

    // ✅ Только текст
    if (!mediaUrl) {
      await s.sock.sendMessage(groupJid, { text });
      return;
    }

    // timeout на скачивание
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25_000);

    let buf: Buffer;
    let contentType = '';
    try {
      const res = await fetch(mediaUrl, {
        signal: controller.signal,
        headers: { 'User-Agent': 'Mozilla/5.0' },
        redirect: 'follow',
      });

      if (!res.ok) {
        // ✅ если медиа не скачалось — отправим хотя бы текст
        await s.sock.sendMessage(groupJid, { text });
        throw new Error(`media_download_failed status=${res.status}`);
      }

      contentType = (res.headers.get('content-type') || '').toLowerCase();

      const arr = await res.arrayBuffer();
      buf = Buffer.from(arr);

      // ✅ если пришёл HTML или слишком маленький файл — это почти точно не картинка
      if (contentType.includes('text/html') || buf.length < 2000) {
        await s.sock.sendMessage(groupJid, { text });
        throw new Error(
          `media_not_a_file contentType=${contentType} size=${buf.length}`,
        );
      }
    } finally {
      clearTimeout(timeout);
    }

    const lower = mediaUrl.toLowerCase();

    const isVideo =
      contentType.startsWith('video/') ||
      lower.endsWith('.mp4') ||
      lower.endsWith('.mov') ||
      lower.endsWith('.webm');

    const isImage =
      contentType.startsWith('image/') ||
      lower.endsWith('.jpg') ||
      lower.endsWith('.jpeg') ||
      lower.endsWith('.png') ||
      lower.endsWith('.webp');

    if (isVideo) {
      await s.sock.sendMessage(groupJid, {
        video: buf,
        caption: text,
        mimetype: contentType || 'video/mp4',
      });
      return;
    }

    if (isImage) {
      await s.sock.sendMessage(groupJid, {
        image: buf,
        caption: text,
        mimetype: contentType || 'image/jpeg',
      });
      return;
    }

    // ✅ если тип непонятен — отправим текст, а не “левый документ”
    await s.sock.sendMessage(groupJid, { text });
    throw new Error(`unsupported_media_type contentType=${contentType}`);
  }

  private async startInternal(userId: string) {
    const s = this.ensureSession(userId);

    try {
      s.sock?.end?.(new Error('restart'));
    } catch {}
    s.sock = undefined;

    const authDir = this.getAuthDir(userId);
    fs.mkdirSync(authDir, { recursive: true });

    s.info = { status: 'connecting' };
    s.lastChangeAt = Date.now();

    const { state, saveCreds } = await useMultiFileAuthState(authDir);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
      version,
      auth: state,
      logger: pino({ level: 'silent' }),
      printQRInTerminal: false,
      connectTimeoutMs: 20_000,
      keepAliveIntervalMs: 20_000,
      syncFullHistory: false,
      markOnlineOnConnect: false,
    });

    s.sock = sock;

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (connection) {
        this.logger.log(`connection.update for ${userId}: ${connection}`);
      }

      if (qr) {
        s.info = { status: 'pending_qr', qr };
        s.lastQrAt = Date.now();
        s.lastChangeAt = Date.now();
        return;
      }

      if (connection === 'open') {
        s.restartAttempts = 0;
        s.info = { status: 'connected' };
        s.lastChangeAt = Date.now();
        this.logger.log(`WhatsApp connected for user ${userId}`);
        return;
      }

      if (connection === 'close') {
        const boom = lastDisconnect?.error as Boom | undefined;
        const statusCode = boom?.output?.statusCode;

        const loggedOut = statusCode === DisconnectReason.loggedOut;
        const msg = boom?.message ?? 'connection closed';

        this.logger.warn(
          `WhatsApp closed for ${userId}, code=${statusCode}, loggedOut=${loggedOut}, msg=${msg}`,
        );

        if (loggedOut) {
          s.restartAttempts = 0; // внёс изменения которые не протестил
          const authDir2 = this.getAuthDir(userId);
          try {
            if (fs.existsSync(authDir2)) {
              fs.rmSync(authDir2, { recursive: true, force: true });
            }
          } catch {}

          s.sock = undefined;
          s.info = { status: 'not_connected', lastError: msg };
          s.lastChangeAt = Date.now();
          return;
        }

        s.restartAttempts += 1;

        s.info = {
          status: 'connecting',
          lastError: msg,
        };
        s.lastChangeAt = Date.now();

        const delay = Math.min(2000 * s.restartAttempts, 10_000);
        setTimeout(() => {
          if (s.restartAttempts <= 5) {
            this.logger.warn(
              `Auto-restart WA for ${userId} (attempt ${s.restartAttempts})`,
            );
            this.startSession(userId).catch(() => undefined);
          } else {
            s.info = { status: 'error', lastError: msg };
            s.lastChangeAt = Date.now();
          }
        }, delay);
      }
    });
  }
}
