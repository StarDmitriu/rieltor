// backend/src/campaigns/campaigns.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { QueueService } from '../queue/queue.service';
import { DateTime } from 'luxon';

function randInt(min: number, max: number) {
  const a = Number.isFinite(min) ? min : 0;
  const b = Number.isFinite(max) ? max : a;
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  return Math.floor(lo + Math.random() * (hi - lo + 1));
}

function parseHHMM(hhmm: string) {
  const [h, m] = (hhmm || '08:00').split(':').map((x) => Number(x));
  return { h: Number.isFinite(h) ? h : 8, m: Number.isFinite(m) ? m : 0 };
}

function nextFixedTime(base: DateTime, hhmm: string) {
  const { h, m } = parseHHMM(hhmm);
  let target = base.set({ hour: h, minute: m, second: 0, millisecond: 0 });
  if (target < base) target = target.plus({ days: 1 });
  return target;
}

/** Если время попало вне окна — переносим на ближайшее разрешённое. */
/** Поддерживает окна и "через полночь" (например 21:00–06:00). */
function clampToWindow(dt: DateTime, fromHHMM: string, toHHMM: string) {
  const from = parseHHMM(fromHHMM);
  const to = parseHHMM(toHHMM);

  const startToday = dt.set({
    hour: from.h,
    minute: from.m,
    second: 0,
    millisecond: 0,
  });

  const endToday = dt.set({
    hour: to.h,
    minute: to.m,
    second: 0,
    millisecond: 0,
  });

  const crossesMidnight =
    from.h > to.h || (from.h === to.h && from.m > to.m);

  // обычное окно (например 08:00–17:00)
  if (!crossesMidnight) {
    if (dt < startToday) return startToday;
    if (dt > endToday) return startToday.plus({ days: 1 });
    return dt;
  }

  // окно через полночь (например 21:00–06:00)
  // Разрешено: [21:00..24:00) ИЛИ [00:00..06:00]
  // Если dt после полуночи (00:00..06:00) — конец окна "сегодня", а старт был "вчера".
  if (dt >= startToday) {
    // вечерняя часть (21:00..24:00)
    return dt;
  }

  if (dt <= endToday) {
    // утренняя часть (00:00..06:00)
    return dt;
  }

  // иначе мы "днём" (между 06:00 и 21:00) — переносим на ближайшее 21:00
  return startToday;
}

type GroupScheduleSpec =
  | { kind: 'fixed'; hhmm: string }
  | { kind: 'interval'; minMinutes: number; maxMinutes: number };

const GROUP_INTERVALS: Record<
  string,
  { minMinutes: number; maxMinutes: number }
> = {
  '2-5m': { minMinutes: 2, maxMinutes: 5 },
  '5-15m': { minMinutes: 5, maxMinutes: 15 },
  '15-30m': { minMinutes: 15, maxMinutes: 30 },
  '30-60m': { minMinutes: 30, maxMinutes: 60 },
  '1-2h': { minMinutes: 60, maxMinutes: 120 },
  '2-4h': { minMinutes: 120, maxMinutes: 240 },
  '6h': { minMinutes: 360, maxMinutes: 360 },
  '6-12h': { minMinutes: 360, maxMinutes: 720 },
  '12h': { minMinutes: 720, maxMinutes: 720 },
  '24h': { minMinutes: 1440, maxMinutes: 1440 },
};

function parseGroupScheduleSpec(v: any): GroupScheduleSpec | null {
  const s = String(v || '').trim();
  if (!s) return null;
  if (/^([01]\d|2[0-3]):[0-5]\d$/.test(s)) return { kind: 'fixed', hhmm: s };
  const interval = GROUP_INTERVALS[s];
  if (!interval) return null;
  return {
    kind: 'interval',
    minMinutes: interval.minMinutes,
    maxMinutes: interval.maxMinutes,
  };
}


export type StartMultiOptions = {
  timeFrom?: string; // "08:00"
  timeTo?: string; // "17:00"
  betweenGroupsSecMin?: number;
  betweenGroupsSecMax?: number;
  betweenTemplatesMinMin?: number;
  betweenTemplatesMinMax?: number;

  // автоповтор волн
  repeatEnabled?: boolean;
  repeatMinMin?: number; // минут
  repeatMinMax?: number; // минут
  channel?: 'wa' | 'tg';
};

export type RequeueOptions = {
  includeSent?: boolean;
  forceNow?: boolean;
};

type JobStatus = 'pending' | 'processing' | 'sent' | 'failed' | 'skipped';

@Injectable()
export class CampaignsService {
  private readonly logger = new Logger(CampaignsService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly queueService: QueueService,
  ) {}

  // =========================
  // ACTIVE CAMPAIGN (running) for user
  // =========================
  async getActiveCampaign(userId: string, channel: 'wa' | 'tg') {
    const supabase = this.supabaseService.getClient();

    const { data, error } = await supabase
      .from('campaigns')
      .select('id, status, created_at')
      .eq('user_id', userId)
      .eq('status', 'running')
      .eq('channel', channel)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      return {
        success: false,
        message: 'supabase_campaign_select_error',
        error,
      };
    }

    return {
      success: true,
      active: data ? { campaignId: String((data as any).id) } : null,
    };
  } 

  // =========================
  // START MULTI (если уже есть running — вернуть её)
  // =========================
  async startMulti(userId: string, opts: StartMultiOptions = {}) {
    const supabase = this.supabaseService.getClient();

    const ch = opts.channel === 'tg' ? 'tg' : 'wa';

    const { data: running, error: rErr } = await supabase
      .from('campaigns')
      .select('id')
      .eq('user_id', userId)
      .eq('status', 'running')
      .eq('channel', ch) // ✅ ВАЖНО
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();


    if (rErr) {
      return {
        success: false,
        message: 'supabase_campaign_select_error',
        error: rErr,
      };
    }

    if (running?.id) {
      return {
        success: true,
        campaignId: String((running as any).id),
        alreadyRunning: true,
        message: 'already_running',
      };
    }

    // timezone пользователя (fallback UTC)
    const { data: user, error: userErr } = await supabase
      .from('users')
      .select('id, timezone')
      .eq('id', userId)
      .maybeSingle();

    if (userErr) {
      return {
        success: false,
        message: 'supabase_users_error',
        error: userErr,
      };
    }

    const tz =
      (user as any)?.timezone || process.env.DEFAULT_TZ || 'Europe/Moscow';


    // настройки времени/задержек
    const time_from = opts.timeFrom ?? '08:00';
    const time_to = opts.timeTo ?? '17:00';

    const between_groups_sec_min = Number.isFinite(opts.betweenGroupsSecMin)
      ? Number(opts.betweenGroupsSecMin)
      : 2;
    const between_groups_sec_max = Number.isFinite(opts.betweenGroupsSecMax)
      ? Number(opts.betweenGroupsSecMax)
      : 3;

    const between_templates_min_min = Number.isFinite(
      opts.betweenTemplatesMinMin,
    )
      ? Number(opts.betweenTemplatesMinMin)
      : 2;
    const between_templates_min_max = Number.isFinite(
      opts.betweenTemplatesMinMax,
    )
      ? Number(opts.betweenTemplatesMinMax)
      : 3;

    // repeat settings
    const repeat_enabled = !!opts.repeatEnabled;
    const repeat_min_min = Number.isFinite(opts.repeatMinMin)
      ? Number(opts.repeatMinMin)
      : 2;
    const repeat_min_max = Number.isFinite(opts.repeatMinMax)
      ? Number(opts.repeatMinMax)
      : 3;

    const next_repeat_at = repeat_enabled
      ? new Date(
          Date.now() + randInt(repeat_min_min, repeat_min_max) * 60_000,
        ).toISOString()
      : null;

    // 1) создаём кампанию (сразу running — так лучше с уникальным индексом)
    const { data: camp, error: cErr } = await supabase
      .from('campaigns')
      .insert({
        user_id: userId,
        status: 'running',
        mode: 'multi',
        time_from,
        time_to,
        timezone: tz,

        between_groups_sec_min,
        between_groups_sec_max,
        between_templates_min_min,
        between_templates_min_max,

        repeat_enabled,
        repeat_min_min: repeat_enabled ? repeat_min_min : null,
        repeat_min_max: repeat_enabled ? repeat_min_max : null,
        next_repeat_at,
        channel: opts.channel === 'tg' ? 'tg' : 'wa',
      })
      .select('id')
      .single();

    // если стоит уникальный индекс и словили гонку — вернём уже существующую running
    if (cErr) {
      const code = (cErr as any)?.code;
      if (code === '23505') {
        const { data: r2 } = await supabase
          .from('campaigns')
          .select('id')
          .eq('user_id', userId)
          .eq('status', 'running')
          .eq('channel', ch)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();


        if (r2?.id) {
          return {
            success: true,
            campaignId: String((r2 as any).id),
            alreadyRunning: true,
            message: 'already_running',
          };
        }
      }

      return {
        success: false,
        message: 'supabase_campaign_insert_error',
        error: cErr,
      };
    }

    if (!camp) {
      return { success: false, message: 'supabase_campaign_insert_empty' };
    }

    const campaignId = String((camp as any).id);

    // 2) создаём 1 волну
    const waveRes = await this.createWaveAndEnqueue({
      campaignId,
      userId,
      tz,
      time_from,
      time_to,
      betweenGroupsSecMin: between_groups_sec_min,
      betweenGroupsSecMax: between_groups_sec_max,
      betweenTemplatesMinMin: between_templates_min_min,
      betweenTemplatesMinMax: between_templates_min_max,
      baseIso: DateTime.now().setZone(tz).toISO()!,
      channel: opts.channel === 'tg' ? 'tg' : 'wa',
    });

    if (!waveRes.success) {
      // откатываем кампанию, чтобы не висела running без jobs
      await supabase
        .from('campaigns')
        .update({
          status: 'stopped',
          repeat_enabled: false,
          next_repeat_at: null,
        })
        .eq('id', campaignId);

      return waveRes;
    }

    return {
      success: true,
      campaignId,
      alreadyRunning: false,
      groups: waveRes.groups,
      templates: waveRes.templates,
      jobs: waveRes.jobs,
      settings: {
        timeFrom: time_from,
        timeTo: time_to,
        betweenGroupsSecMin: between_groups_sec_min,
        betweenGroupsSecMax: between_groups_sec_max,
        betweenTemplatesMinMin: between_templates_min_min,
        betweenTemplatesMinMax: between_templates_min_max,
        timezone: tz,
        repeatEnabled: repeat_enabled,
        repeatMinMin: repeat_min_min,
        repeatMinMax: repeat_min_max,
        nextRepeatAt: next_repeat_at,
      },
    };
  }

  // =========================
  // GET JOBS
  // =========================
  async getJobs(campaignId: string) {
    const supabase = this.supabaseService.getClient();
    const { data, error } = await supabase
      .from('campaign_jobs')
      .select(
        'id, group_jid, template_id, status, scheduled_at, sent_at, error',
      )
      .eq('campaign_id', campaignId)
      .order('scheduled_at', { ascending: true });

    if (error)
      return { success: false, message: 'supabase_jobs_select_error', error };
    return { success: true, jobs: data ?? [] };
  }

  // =========================
  // PROGRESS
  // =========================
  async getProgress(campaignId: string) {
    const supabase = this.supabaseService.getClient();

    const { data: camp, error: cErr } = await supabase
      .from('campaigns')
      .select('id, status, created_at')
      .eq('id', campaignId)
      .maybeSingle();

    if (cErr || !camp)
      return { success: false, message: 'campaign_not_found', error: cErr };

    const { data: jobs, error: jErr } = await supabase
      .from('campaign_jobs')
      .select(
        'id, group_jid, template_id, status, scheduled_at, sent_at, error',
      )
      .eq('campaign_id', campaignId)
      .order('scheduled_at', { ascending: true });

    if (jErr) {
      return {
        success: false,
        message: 'supabase_jobs_select_error',
        error: jErr,
      };
    }

    const counters: Record<JobStatus, number> = {
      pending: 0,
      processing: 0,
      sent: 0,
      failed: 0,
      skipped: 0,
    };

    for (const j of jobs ?? []) {
      const s = (j as any).status as JobStatus;
      if (counters[s] !== undefined) counters[s] += 1;
    }

    const total = (jobs ?? []).length;
    const done = counters.pending === 0 && counters.processing === 0;

    return {
      success: true,
      campaignId: (camp as any).id,
      total,
      sent: counters.sent,
      failed: counters.failed,
      pending: counters.pending,
      processing: counters.processing,
      skipped: counters.skipped,
      done,
      jobs: jobs ?? [],
    };
  }

  // =========================
  // STOP
  // =========================
  async stopCampaign(campaignId: string) {
    const supabase = this.supabaseService.getClient();

    await supabase
      .from('campaigns')
      .update({
        status: 'stopped',
        repeat_enabled: false,
        next_repeat_at: null,
      })
      .eq('id', campaignId);

    const { error } = await supabase
      .from('campaign_jobs')
      .update({
        status: 'skipped',
        error: 'campaign_stopped',
        sent_at: new Date().toISOString(),
      })
      .eq('campaign_id', campaignId)
      .in('status', ['pending', 'processing']);

    if (error)
      return { success: false, message: 'supabase_jobs_update_error', error };
    return { success: true, message: 'campaign_stopped' };
  }

  // =========================
  // REQUEUE (оставляем, но на фронте не используем)
  // =========================
  async requeueCampaign(campaignId: string, opts: RequeueOptions = {}) {
    const supabase = this.supabaseService.getClient();

    const includeSent = !!opts.includeSent;
    const forceNow = !!opts.forceNow;

    const statuses = includeSent
      ? ['pending', 'sent', 'failed', 'skipped', 'processing']
      : ['pending'];

    const { data: jobs, error: jErr } = await supabase
      .from('campaign_jobs')
      .select('id, user_id, group_jid, template_id, scheduled_at, status')
      .eq('campaign_id', campaignId)
      .in('status', statuses)
      .order('scheduled_at', { ascending: true });

    if (jErr)
      return {
        success: false,
        message: 'supabase_jobs_select_error',
        error: jErr,
      };
    if (!jobs?.length)
      return { success: false, message: 'no_jobs_for_requeue' };

    const nowIso = new Date().toISOString();

    if (forceNow) {
      const ids = jobs.map((j: any) => j.id);

      const { error: upErr } = await supabase
        .from('campaign_jobs')
        .update({
          status: 'pending',
          error: null,
          sent_at: null,
          scheduled_at: nowIso,
        })
        .in('id', ids);

      if (upErr)
        return {
          success: false,
          message: 'supabase_jobs_update_error',
          error: upErr,
        };

      const { data: fresh, error: fErr } = await supabase
        .from('campaign_jobs')
        .select('id, user_id, group_jid, template_id, scheduled_at')
        .in('id', ids);

      if (fErr)
        return {
          success: false,
          message: 'supabase_jobs_refetch_error',
          error: fErr,
        };

      await this.enqueueRows(fresh ?? []);
      return {
        success: true,
        enqueued: (fresh ?? []).length,
        includeSent,
        forceNow: true,
      };
    }

    const firstOldMs = new Date((jobs[0] as any).scheduled_at).getTime();
    const baseMs = Date.now();

    const ids: string[] = [];
    const toEnqueue: any[] = [];

    for (const j of jobs as any[]) {
      const oldMs = new Date(j.scheduled_at).getTime();
      const delta = Math.max(0, oldMs - firstOldMs);
      const newIso = new Date(baseMs + delta).toISOString();

      const { error: uErr } = await supabase
        .from('campaign_jobs')
        .update({
          status: 'pending',
          error: null,
          sent_at: null,
          scheduled_at: newIso,
        })
        .eq('id', j.id);

      if (uErr)
        return {
          success: false,
          message: 'supabase_jobs_update_error',
          error: uErr,
        };

      ids.push(j.id);
      toEnqueue.push({
        id: j.id,
        user_id: j.user_id,
        group_jid: j.group_jid,
        template_id: j.template_id,
        scheduled_at: newIso,
      });
    }

    await this.enqueueRows(toEnqueue);
    return {
      success: true,
      enqueued: toEnqueue.length,
      includeSent,
      forceNow: false,
    };
  }

  // =========================
  // REPEAT WAVE
  // =========================
  async repeatWaveIfReady(campaignId: string) {
    const supabase = this.supabaseService.getClient();

    const { data: camp, error: cErr } = await supabase
      .from('campaigns')
      .select(
        `id, user_id, status, channel, timezone, time_from, time_to,
         repeat_enabled, repeat_min_min, repeat_min_max, next_repeat_at,
         between_groups_sec_min, between_groups_sec_max,
         between_templates_min_min, between_templates_min_max`,
      )
      .eq('id', campaignId)
      .maybeSingle();

    if (cErr || !camp)
      return { success: false, message: 'campaign_not_found', error: cErr };

    const c: any = camp;
    if (c.status !== 'running')
      return { success: false, message: 'campaign_not_running' };
    if (!c.repeat_enabled)
      return { success: false, message: 'repeat_disabled' };
    if (!c.next_repeat_at)
      return { success: false, message: 'no_next_repeat_at' };

    const nowIso = new Date().toISOString();
    const nextMs = new Date(c.next_repeat_at).getTime();
    if (Number.isFinite(nextMs) && nextMs > Date.now())
      return { success: true, message: 'not_time_yet' };

    // если есть pending/processing с временем <= сейчас — волна ещё идёт
    const { data: inFlight, error: fErr } = await supabase
      .from('campaign_jobs')
      .select('id')
      .eq('campaign_id', campaignId)
      .in('status', ['pending', 'processing'])
      .lte('scheduled_at', nowIso)
      .limit(1);

    if (fErr)
      return {
        success: false,
        message: 'supabase_jobs_select_error',
        error: fErr,
      };
    if (inFlight?.length) return { success: true, message: 'wave_in_progress' };

    // CLAIM
    const repMin = Number.isFinite(c.repeat_min_min)
      ? Number(c.repeat_min_min)
      : 5;
    const repMax = Number.isFinite(c.repeat_min_max)
      ? Number(c.repeat_min_max)
      : 15;
    const newNext = new Date(
      Date.now() + randInt(repMin, repMax) * 60_000,
    ).toISOString();

    const { data: claimed, error: claimErr } = await supabase
      .from('campaigns')
      .update({ next_repeat_at: newNext })
      .eq('id', campaignId)
      .eq('repeat_enabled', true)
      .eq('status', 'running')
      .lte('next_repeat_at', nowIso)
      .select('id')
      .maybeSingle();

    if (claimErr)
      return { success: false, message: 'claim_failed', error: claimErr };
    if (!claimed) return { success: true, message: 'not_claimed' };

    const tz = c.timezone || process.env.DEFAULT_TZ || 'Europe/Moscow';

    const time_from = c.time_from || '00:00';
    const time_to = c.time_to || '23:59';

    const betweenGroupsSecMin = Number.isFinite(c.between_groups_sec_min)
      ? Number(c.between_groups_sec_min)
      : 20;
    const betweenGroupsSecMax = Number.isFinite(c.between_groups_sec_max)
      ? Number(c.between_groups_sec_max)
      : 90;
    const betweenTemplatesMinMin = Number.isFinite(c.between_templates_min_min)
      ? Number(c.between_templates_min_min)
      : 15;
    const betweenTemplatesMinMax = Number.isFinite(c.between_templates_min_max)
      ? Number(c.between_templates_min_max)
      : 60;

    const waveRes = await this.createWaveAndEnqueue({
      campaignId,
      userId: c.user_id,
      tz,
      time_from,
      time_to,
      betweenGroupsSecMin,
      betweenGroupsSecMax,
      betweenTemplatesMinMin,
      betweenTemplatesMinMax,
      baseIso: DateTime.now().setZone(tz).toISO()!,
      channel: c.channel === 'tg' ? 'tg' : 'wa',
    });

    if (!waveRes.success) return waveRes;

    this.logger.log(
      `Repeat wave created for ${campaignId}. Next at ${newNext}`,
    );

    return {
      success: true,
      message: 'repeat_wave_created',
      jobs: waveRes.jobs,
      nextRepeatAt: newNext,
    };
  }

  private async createWaveAndEnqueue(params: {
    campaignId: string;
    userId: string;
    tz: string;
    time_from: string;
    time_to: string;
    betweenGroupsSecMin: number;
    betweenGroupsSecMax: number;
    betweenTemplatesMinMin: number;
    betweenTemplatesMinMax: number;
    baseIso: string;
    channel: 'wa' | 'tg';
  }) {
    const supabase = this.supabaseService.getClient();

    // ✅ 1) load groups by channel into unified shape { jid: string }
    let usableGroups: Array<{
      jid: string;
      is_announcement?: boolean;
      send_time?: string | null;
    }> = [];

    if (params.channel === 'wa') {
      const { data: groups, error: gErr } = await supabase
        .from('whatsapp_groups')
        .select('wa_group_id, is_announcement, is_selected, send_time')
        .eq('user_id', params.userId)
        .eq('is_selected', true);

      if (gErr)
        return {
          success: false,
          message: 'supabase_groups_error',
          error: gErr,
        };

      usableGroups = (groups ?? [])
        .filter((g: any) => !g.is_announcement)
        .map((g: any) => ({
          jid: String(g.wa_group_id),
          send_time: g.send_time ?? null,
        }));
    } else {
      const { data: groups, error: gErr } = await supabase
        .from('telegram_groups')
        .select('tg_chat_id, is_selected, send_time')
        .eq('user_id', params.userId)
        .eq('is_selected', true);

      if (gErr)
        return {
          success: false,
          message: 'supabase_groups_error',
          error: gErr,
        };

      usableGroups = (groups ?? []).map((g: any) => ({
        jid: String(g.tg_chat_id),
        send_time: g.send_time ?? null,
      }));
    }

    if (!usableGroups.length) return { success: false, message: 'no_groups' };

    // ✅ 2) templates
    const { data: templates, error: tErr } = await supabase
      .from('message_templates')
      .select('id, title, text, media_url, enabled, "order"')
      .eq('user_id', params.userId)
      .eq('enabled', true)
      .order('order', { ascending: true });

    if (tErr)
      return {
        success: false,
        message: 'supabase_templates_error',
        error: tErr,
      };
    if (!templates?.length) return { success: false, message: 'no_templates' };

    // ✅ 3) load template->targets WITH channel
    const { data: links, error: lErr } = await supabase
      .from('template_group_targets')
      .select('template_id, group_jid')
      .eq('user_id', params.userId)
      .eq('channel', params.channel)
      .eq('enabled', true);
    const hasAnyTargets = (links ?? []).length > 0;
    if (lErr) {
      return {
        success: false,
        message: 'supabase_template_targets_error',
        error: lErr,
      };
    }

    if (lErr) {
      return {
        success: false,
        message: 'supabase_template_targets_error',
        error: lErr,
      };
    }

    // Map: templateId -> Set(groupJid)
    const targetsMap = new Map<string, Set<string>>();
    for (const row of links ?? []) {
      const tid = String((row as any).template_id);
      const jid = String((row as any).group_jid);
      if (!targetsMap.has(tid)) targetsMap.set(tid, new Set<string>());
      targetsMap.get(tid)!.add(jid);
    }

    const base = DateTime.fromISO(params.baseIso).setZone(params.tz);
    let cursor = clampToWindow(base, params.time_from, params.time_to);

    const jobsToInsert: any[] = [];

    const { data: existingJobs, error: existErr } = await supabase
      .from('campaign_jobs')
      .select('group_jid, template_id, scheduled_at, status')
      .eq('campaign_id', params.campaignId)
      .eq('status', 'pending')
      .gte('scheduled_at', new Date().toISOString());

    if (existErr) {
      return {
        success: false,
        message: 'supabase_jobs_select_error',
        error: existErr,
      };
    }

    const pendingFutureMap = new Map<string, string>();
    for (const j of existingJobs ?? []) {
      const key = `${String((j as any).group_jid)}|${String(
        (j as any).template_id,
      )}`;
      pendingFutureMap.set(key, String((j as any).scheduled_at));
    }

    const { data: allJobs, error: allErr } = await supabase
      .from('campaign_jobs')
      .select('group_jid, template_id, scheduled_at')
      .eq('campaign_id', params.campaignId);

    if (allErr) {
      return {
        success: false,
        message: 'supabase_jobs_select_error',
        error: allErr,
      };
    }

    const latestScheduledMap = new Map<string, string>();
    const latestScheduledGroupMap = new Map<string, string>();
    for (const j of allJobs ?? []) {
      const groupId = String((j as any).group_jid);
      const templateId = String((j as any).template_id);
      const key = `${groupId}|${templateId}`;
      const iso = String((j as any).scheduled_at || '');
      if (!iso) continue;
      const prev = latestScheduledMap.get(key);
      if (!prev || new Date(iso).getTime() > new Date(prev).getTime()) {
        latestScheduledMap.set(key, iso);
      }
      const gPrev = latestScheduledGroupMap.get(groupId);
      if (!gPrev || new Date(iso).getTime() > new Date(gPrev).getTime()) {
        latestScheduledGroupMap.set(groupId, iso);
      }
    }

    const perGroupNextAvailable = new Map<string, DateTime>();

    for (let ti = 0; ti < templates.length; ti++) {
      const template: any = templates[ti];

      // ✅ группы, выбранные для этого шаблона
      const selected = targetsMap.get(String(template.id));

      const targetGroups = selected
        ? usableGroups.filter((g) => selected.has(g.jid))
        : hasAnyTargets
          ? []
          : usableGroups;
      // ✅ если НЕТ вообще ни одной настройки targets — шлём во все группы (как раньше)

      // ✅ если для шаблона не выбрано ни одной группы — не создаём jobs
      if (!targetGroups.length) continue;

      for (let gi = 0; gi < targetGroups.length; gi++) {
        const group: any = targetGroups[gi];

        const scheduleSpec = parseGroupScheduleSpec(group?.send_time);
        let scheduledAt: DateTime | null = null;

        if (scheduleSpec?.kind === 'fixed') {
          const fixed = nextFixedTime(base, scheduleSpec.hhmm);
          const nextAvail = perGroupNextAvailable.get(String(group.jid));
          scheduledAt = nextAvail && nextAvail > fixed ? nextAvail : fixed;
        } else if (scheduleSpec?.kind === 'interval') {
          const groupId = String(group.jid);
          let nextAvail = perGroupNextAvailable.get(groupId);
          if (!nextAvail) {
            const lastGroupIso = latestScheduledGroupMap.get(groupId);
            nextAvail = lastGroupIso
              ? DateTime.fromISO(lastGroupIso).setZone(params.tz).plus({
                  minutes: randInt(
                    scheduleSpec.minMinutes,
                    scheduleSpec.maxMinutes,
                  ),
                })
              : base;
          }
          if (nextAvail < base) nextAvail = base;
          scheduledAt = clampToWindow(
            nextAvail,
            params.time_from,
            params.time_to,
          );
        } else {
          cursor = clampToWindow(cursor, params.time_from, params.time_to);
          scheduledAt = cursor;
        }

        const key = `${String(group.jid)}|${String(template.id)}`;
        if (pendingFutureMap.has(key)) {
          continue;
        }

        jobsToInsert.push({
          campaign_id: params.campaignId,
          user_id: params.userId,
          group_jid: group.jid,
          channel: params.channel,
          template_id: template.id,
          status: 'pending',
          scheduled_at: scheduledAt.toUTC().toISO(),
          created_at: new Date().toISOString(),
        });

        if (scheduleSpec?.kind === 'interval') {
          const groupId = String(group.jid);
          perGroupNextAvailable.set(
            groupId,
            scheduledAt.plus({
              minutes: randInt(
                scheduleSpec.minMinutes,
                scheduleSpec.maxMinutes,
              ),
            }),
          );
          latestScheduledGroupMap.set(groupId, scheduledAt.toUTC().toISO());
          latestScheduledMap.set(
            `${String(group.jid)}|${String(template.id)}`,
            scheduledAt.toUTC().toISO(),
          );
        }

        if (scheduleSpec?.kind === 'fixed') {
          perGroupNextAvailable.set(
            String(group.jid),
            scheduledAt.plus({
              minutes: randInt(
                params.betweenTemplatesMinMin,
                params.betweenTemplatesMinMax,
              ),
            }),
          );
          latestScheduledGroupMap.set(
            String(group.jid),
            scheduledAt.toUTC().toISO(),
          );
          latestScheduledMap.set(
            `${String(group.jid)}|${String(template.id)}`,
            scheduledAt.toUTC().toISO(),
          );
        }

        if (!scheduleSpec) {
          cursor = cursor.plus({
            seconds: randInt(
              params.betweenGroupsSecMin,
              params.betweenGroupsSecMax,
            ),
          });
        }
      }

      if (ti < templates.length - 1) {
        cursor = cursor.plus({
          minutes: randInt(
            params.betweenTemplatesMinMin,
            params.betweenTemplatesMinMax,
          ),
        });
      }
    }

    if (!jobsToInsert.length) {
      return {
        success: false,
        message: hasAnyTargets ? 'no_targets_for_templates' : 'no_jobs',
      };
    }

    const { data: inserted, error: jErr } = await supabase
      .from('campaign_jobs')
      .insert(jobsToInsert)
      .select('id, user_id, group_jid, template_id, scheduled_at, channel');

    if (jErr || !inserted?.length) {
      return {
        success: false,
        message: 'supabase_jobs_insert_error',
        error: jErr,
      };
    }

    await this.enqueueRows(inserted);

    return {
      success: true,
      groups: usableGroups.length,
      templates: templates.length,
      jobs: inserted.length,
    };
  }

  private async enqueueRows(rows: Array<any>) {
    const nowMs = Date.now();

    for (const row of rows) {
      const scheduledMs = new Date(row.scheduled_at as string).getTime();
      const delay = Math.max(0, scheduledMs - nowMs);

      const deterministicJobId = String(row.id);

      const existing =
        await this.queueService.campaignQueue.getJob(deterministicJobId);
      if (existing) await existing.remove();

      await this.queueService.campaignQueue.add(
        'send',
        {
          jobId: row.id,
          userId: row.user_id,
          groupJid: row.group_jid,
          templateId: row.template_id,
          channel: row.channel,
        },
        {
          jobId: deterministicJobId,
          delay,
          attempts: 5,
          backoff: { type: 'exponential', delay: 5000 },
          removeOnComplete: true,
          removeOnFail: false,
        },
      );
    }
  }
}
