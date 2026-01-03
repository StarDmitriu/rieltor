//backend/src/templates/templates.service.ts
import { Injectable, Logger } from '@nestjs/common';
import Papa from 'papaparse';
import { SupabaseService } from '../supabase/supabase.service';
import * as crypto from 'crypto';

type SheetRow = {
  enabled?: string | boolean;
  order?: string | number;
  title?: string;
  text?: string;
  media_url?: string;
};

function toBool(v: unknown): boolean {
  if (typeof v === 'boolean') return v;
  const s = String(v ?? '')
    .trim()
    .toLowerCase();
  return s === 'true' || s === '1' || s === 'yes' || s === 'y';
}

function toInt(v: unknown, def = 1): number {
  const n = Number(String(v ?? '').trim());
  if (!Number.isFinite(n)) return def;
  const x = Math.floor(n);
  return x > 0 ? x : def;
}

function normalizeUrl(input: string): string {
  const url = input.trim();

  if (url.includes('/export') && url.includes('format=csv')) return url;

  const m = url.match(/spreadsheets\/d\/([^/]+)/);
  if (!m) return url;

  const sheetId = m[1];
  const gidMatch = url.match(/gid=([0-9]+)/);
  const gid = gidMatch ? gidMatch[1] : '0';

  return `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
}

@Injectable()
export class TemplatesService {
  private readonly logger = new Logger(TemplatesService.name);

  constructor(private readonly supabaseService: SupabaseService) {}

  // ✅ НОВОЕ: загрузка медиа в bucket template-media
  async uploadMedia(userId: string, file: Express.Multer.File) {
    const supabase = this.supabaseService.getClient();

    const bucket = 'template-media';

    const orig = (file.originalname || 'file').replace(/[^\w.\-]+/g, '_');
    const ext = orig.includes('.') ? orig.split('.').pop() : '';
    const id = crypto.randomUUID();
    const filename = ext ? `${id}.${ext}` : id;

    // Можно хранить по пользователю
    const path = `${userId}/${filename}`;

    const { error: upErr } = await supabase.storage
      .from(bucket)
      .upload(path, file.buffer, {
        contentType: file.mimetype || 'application/octet-stream',
        upsert: true,
      });

    if (upErr) {
      this.logger.error('storage upload error', upErr as any);
      return { success: false, message: 'storage_upload_error', error: upErr };
    }

    // PUBLIC bucket -> можно получить public url
    const { data } = supabase.storage.from(bucket).getPublicUrl(path);

    return {
      success: true,
      path,
      publicUrl: data.publicUrl,
      mime: file.mimetype,
      size: file.size,
    };
  }

  // =========================
  // ✅ LIST
  // =========================
  async listTemplates(userId: string) {
    const supabase = this.supabaseService.getClient();

    const { data, error } = await supabase
      .from('message_templates')
      .select(
        'id, user_id, sheet_row, enabled, "order", title, text, media_url, updated_at',
      )
      .eq('user_id', userId)
      .order('order', { ascending: true })
      .order('updated_at', { ascending: false });

    if (error) {
      return { success: false, message: 'supabase_select_error', error };
    }

    return { success: true, templates: data ?? [] };
  }

  // =========================
  // ✅ CREATE (manual)
  // =========================
  async createTemplate(
    userId: string,
    dto: {
      title?: string;
      text?: string;
      media_url?: string;
      enabled?: boolean;
      order?: number;
    },
  ) {
    const supabase = this.supabaseService.getClient();

    const title = String(dto.title ?? '').trim();
    const text = String(dto.text ?? '').trim();
    const media_url = String(dto.media_url ?? '').trim();

    if (!title && !text) {
      return { success: false, message: 'title_or_text_required' };
    }

    // ⚠️ ВАЖНО:
    // sheet_row используется как уникальный ключ для синка из Google Sheets (user_id, sheet_row).
    // Чтобы ручные шаблоны НЕ перезатирались синком, даём им sheet_row >= 1_000_000.
    const { data: maxRow, error: maxErr } = await supabase
      .from('message_templates')
      .select('sheet_row')
      .eq('user_id', userId)
      .order('sheet_row', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (maxErr) {
      return {
        success: false,
        message: 'supabase_maxrow_error',
        error: maxErr,
      };
    }

    const currentMax = Number((maxRow as any)?.sheet_row ?? 0);
    const base = currentMax >= 1_000_000 ? currentMax : 1_000_000;
    const sheet_row = base + 1;

    const enabled = dto.enabled === undefined ? true : !!dto.enabled;
    const order = Number.isFinite(Number(dto.order)) ? Number(dto.order) : 1;

    const payload = {
      user_id: userId,
      sheet_row,
      enabled,
      order,
      title: title || null,
      text: text || null,
      media_url: media_url || null,
      updated_at: new Date().toISOString(),
    };

    const { data: inserted, error } = await supabase
      .from('message_templates')
      .insert(payload)
      .select(
        'id, user_id, sheet_row, enabled, "order", title, text, media_url, updated_at',
      )
      .single();

    if (error) {
      return { success: false, message: 'supabase_insert_error', error };
    }

    return { success: true, template: inserted };
  }

  // =========================
  // SYNC FROM SHEET (как было)
  // =========================
  async syncFromSheet(userId: string) {
    const supabase = this.supabaseService.getClient();

    const { data: user, error: userErr } = await supabase
      .from('users')
      .select('id, gsheet_url')
      .eq('id', userId)
      .maybeSingle();

    if (userErr) {
      this.logger.error(userErr);
      return { success: false, message: 'Ошибка чтения users из Supabase' };
    }

    if (!user?.gsheet_url) {
      return {
        success: false,
        message:
          'У пользователя не заполнен gsheet_url. Вставь ссылку на Google Sheet (или export csv).',
      };
    }

    const csvUrl = normalizeUrl(user.gsheet_url);

    let csvText: string;
    try {
      const res = await fetch(csvUrl, {
        method: 'GET',
        headers: { 'User-Agent': 'Mozilla/5.0' },
      });

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        return {
          success: false,
          message: `Не удалось скачать CSV (${res.status}). Проверь что таблица "Доступ по ссылке" = Просмотр. Ответ: ${body.slice(
            0,
            200,
          )}`,
        };
      }

      csvText = await res.text();
    } catch (e: any) {
      return {
        success: false,
        message: `Ошибка сети при скачивании Google Sheet: ${e?.message ?? e}`,
      };
    }

    const parsed = Papa.parse<SheetRow>(csvText, {
      header: true,
      skipEmptyLines: true,
    });

    if (parsed.errors?.length) {
      return {
        success: false,
        message: `CSV parse error: ${parsed.errors[0]?.message ?? 'unknown'}`,
      };
    }

    const raw = parsed.data ?? [];

    const payload = raw
      .map((r, i) => ({ r, sheetRow: i + 2 }))
      .filter(({ r }) => r && (r.title || r.text))
      .map(({ r, sheetRow }) => ({
        user_id: userId,
        sheet_row: sheetRow,
        enabled: toBool(r.enabled ?? true),
        order: toInt(r.order ?? 1, 1),
        title: (r.title ?? '').toString().trim() || null,
        text: (r.text ?? '').toString().trim() || null,
        media_url: (r.media_url ?? '').toString().trim() || null,
        updated_at: new Date().toISOString(),
      }));

    const { error: upsertErr } = await supabase
      .from('message_templates')
      .upsert(payload, { onConflict: 'user_id,sheet_row' });

    if (upsertErr) {
      this.logger.error(upsertErr);
      return { success: false, message: 'Не удалось записать шаблоны в БД' };
    }

    return {
      success: true,
      message: `Синхронизировано шаблонов: ${payload.length}`,
      count: payload.length,
    };
  }
  async list(userId: string) {
    const supabase = this.supabaseService.getClient();

    const { data, error } = await supabase
      .from('message_templates')
      .select(
        'id, sheet_row, enabled, "order", title, text, media_url, updated_at',
      )
      .eq('user_id', userId)
      .order('order', { ascending: true })
      .order('updated_at', { ascending: false });

    if (error)
      return { success: false, message: 'supabase_select_error', error };
    return { success: true, templates: data ?? [] };
  }

  private async nextManualSheetRow(userId: string) {
    const supabase = this.supabaseService.getClient();

    const { data, error } = await supabase
      .from('message_templates')
      .select('sheet_row')
      .eq('user_id', userId)
      .gte('sheet_row', 1_000_000)
      .order('sheet_row', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;

    const maxRow = Number((data as any)?.sheet_row ?? 999_999);
    return Math.max(1_000_000, maxRow + 1);
  }

  async createManual(
    userId: string,
    input: {
      title?: string;
      text?: string;
      media_url?: string;
      enabled?: boolean;
      order?: number;
    },
  ) {
    const supabase = this.supabaseService.getClient();

    const title = (input.title ?? '').toString().trim() || null;
    const text = (input.text ?? '').toString().trim() || null;
    const media_url = (input.media_url ?? '').toString().trim() || null;

    if (!title && !text)
      return { success: false, message: 'title_or_text_required' };

    const sheet_row = await this.nextManualSheetRow(userId);

    const enabled = typeof input.enabled === 'boolean' ? input.enabled : true;
    const orderRaw = Number(input.order);
    const order = Number.isFinite(orderRaw)
      ? Math.max(1, Math.floor(orderRaw))
      : 1;

    const { data, error } = await supabase
      .from('message_templates')
      .insert({
        user_id: userId,
        sheet_row,
        enabled,
        order,
        title,
        text,
        media_url,
        updated_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (error)
      return { success: false, message: 'supabase_insert_error', error };

    return { success: true, templateId: (data as any).id };
  }

  async update(
    userId: string,
    templateId: string,
    input: {
      title?: string;
      text?: string;
      media_url?: string;
      enabled?: boolean;
      order?: number;
    },
  ) {
    const supabase = this.supabaseService.getClient();

    const patch: any = { updated_at: new Date().toISOString() };
    if (input.title !== undefined)
      patch.title = (input.title ?? '').toString().trim() || null;
    if (input.text !== undefined)
      patch.text = (input.text ?? '').toString().trim() || null;
    if (input.media_url !== undefined)
      patch.media_url = (input.media_url ?? '').toString().trim() || null;
    if (input.enabled !== undefined) patch.enabled = !!input.enabled;

    if (input.order !== undefined) {
      const n = Number(input.order);
      if (Number.isFinite(n)) patch.order = Math.max(1, Math.floor(n));
    }

    if (patch.title === null && patch.text === null) {
      return { success: false, message: 'title_or_text_required' };
    }

    const { data, error } = await supabase
      .from('message_templates')
      .update(patch)
      .eq('user_id', userId)
      .eq('id', templateId)
      .select('id')
      .maybeSingle();

    if (error)
      return { success: false, message: 'supabase_update_error', error };
    if (!data) return { success: false, message: 'template_not_found' };

    return { success: true };
  }

  async getOne(userId: string, templateId: string) {
    const supabase = this.supabaseService.getClient();

    const { data, error } = await supabase
      .from('message_templates')
      .select(
        'id, sheet_row, enabled, "order", title, text, media_url, updated_at',
      )
      .eq('user_id', userId)
      .eq('id', templateId)
      .maybeSingle();

    if (error)
      return { success: false, message: 'supabase_select_error', error };
    if (!data) return { success: false, message: 'template_not_found' };

    return { success: true, template: data };
  }

  async getById(templateId: string) {
    const supabase = this.supabaseService.getClient();

    const { data, error } = await supabase
      .from('message_templates')
      .select(
        'id, user_id, enabled, "order", title, text, media_url, updated_at',
      )
      .eq('id', templateId)
      .maybeSingle();

    if (error)
      return { success: false, message: 'supabase_select_error', error };
    if (!data) return { success: false, message: 'template_not_found' };

    return { success: true, template: data };
  }

  async remove(userId: string, templateId: string) {
    const supabase = this.supabaseService.getClient();

    const { error } = await supabase
      .from('message_templates')
      .delete()
      .eq('user_id', userId)
      .eq('id', templateId);

    if (error)
      return { success: false, message: 'supabase_delete_error', error };
    return { success: true };
  }

  // backend/src/templates/templates.service.ts

  private normChannel(v: any): 'wa' | 'tg' {
    return String(v || 'wa').toLowerCase() === 'tg' ? 'tg' : 'wa';
  }

  async getTargets(userId: string, templateId: string, channel?: string) {
    const supabase = this.supabaseService.getClient();
    const ch = this.normChannel(channel);

    const { data, error } = await supabase
      .from('template_group_targets')
      .select('group_jid')
      .eq('user_id', userId)
      .eq('template_id', templateId)
      .eq('channel', ch)
      .eq('enabled', true);

    if (error) {
      return {
        success: false,
        message: 'supabase_targets_select_error',
        error,
      };
    }

    const groupJids = (data ?? []).map((x: any) => String(x.group_jid));
    return { success: true, groupJids };
  }

  async setTargets(
    userId: string,
    templateId: string,
    groupJids: string[],
    channel?: string,
  ) {
    const supabase = this.supabaseService.getClient();
    const ch = this.normChannel(channel);

    const unique = Array.from(
      new Set(
        (groupJids ?? []).map((x) => String(x || '').trim()).filter(Boolean),
      ),
    );

    // удаляем старые таргеты только для конкретного канала
    const { error: delErr } = await supabase
      .from('template_group_targets')
      .delete()
      .eq('user_id', userId)
      .eq('template_id', templateId)
      .eq('channel', ch);

    if (delErr) {
      return {
        success: false,
        message: 'supabase_targets_delete_error',
        error: delErr,
      };
    }

    if (!unique.length) return { success: true, count: 0 };

    const rows = unique.map((jid) => ({
      user_id: userId,
      template_id: templateId,
      group_jid: jid,
      channel: ch,
      enabled: true,
      updated_at: new Date().toISOString(),
    }));

    const { error: insErr } = await supabase
      .from('template_group_targets')
      .insert(rows);

    if (insErr) {
      return {
        success: false,
        message: 'supabase_targets_insert_error',
        error: insErr,
      };
    }

    return { success: true, count: rows.length };
  }
}
