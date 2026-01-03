//backend/src/queue/campaign.worker.ts
import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Worker, Job } from 'bullmq';
import { SupabaseService } from '../supabase/supabase.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { QueueService } from './queue.service';
import { TelegramService } from '../telegram/telegram.service';

type SendJobData = {
  jobId: string;
  userId: string;
  groupJid: string;
  templateId: string;
  channel?: 'wa' | 'tg';
};

function withTimeout<T>(
  p: Promise<T>,
  ms: number,
  label = 'timeout',
): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(label)), ms);
    p.then((v) => {
      clearTimeout(t);
      resolve(v);
    }).catch((e) => {
      clearTimeout(t);
      reject(e);
    });
  });
}

@Injectable()
export class CampaignBullWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CampaignBullWorker.name);
  private worker?: Worker<SendJobData>;

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly whatsapp: WhatsappService,
    private readonly telegram: TelegramService,
    private readonly queueService: QueueService,
  ) {}

  onModuleInit() {
    this.logger.warn('### WORKER VERSION: 2026-01-03 channel-routing-fix ###');
    this.worker = new Worker<SendJobData>(
      'campaign-send',
      async (job: Job<SendJobData>) => this.process(job.data),
      {
        connection: this.queueService.connectionOptions as any,
        concurrency: 1,
      },
    );

    this.worker.on('completed', (job) => {
      this.logger.log(`completed bull job ${job.id}`);
    });

    this.worker.on('failed', (job, err) => {
      this.logger.error(`failed bull job ${job?.id}: ${err?.message ?? err}`);
    });

    this.logger.log('BullMQ worker started (campaign-send)');
  }

  async onModuleDestroy() {
    await this.worker?.close();
  }

  private async process(data: SendJobData) {
    const supabase = this.supabaseService.getClient();

    const { data: dbJob, error: jobErr } = await supabase
      .from('campaign_jobs')
      .select('id, user_id, group_jid, template_id, status, channel')
      .eq('id', data.jobId)
      .maybeSingle();

    if (jobErr || !dbJob) throw new Error('db_job_not_found');

    if (dbJob.status !== 'pending') return;

    const { error: lockErr } = await supabase
      .from('campaign_jobs')
      .update({ status: 'processing', error: null })
      .eq('id', dbJob.id)
      .eq('status', 'pending');

    if (lockErr) return;

    const { data: tpl, error: tplErr } = await supabase
      .from('message_templates')
      .select('id, text, media_url, enabled')
      .eq('id', data.templateId)
      .maybeSingle();

    if (tplErr || !tpl) {
      await supabase
        .from('campaign_jobs')
        .update({
          status: 'failed',
          error: 'template_not_found',
          sent_at: new Date().toISOString(),
        })
        .eq('id', dbJob.id);
      return;
    }

    if (tpl.enabled === false) {
      await supabase
        .from('campaign_jobs')
        .update({
          status: 'skipped',
          error: 'template_disabled',
          sent_at: new Date().toISOString(),
        })
        .eq('id', dbJob.id);
      return;
    }

    const channel = String((dbJob as any).channel || 'wa');

    const jid = String((dbJob as any).group_jid || '');

    if (channel === 'tg' && jid.includes('@g.us')) {
      await supabase
        .from('campaign_jobs')
        .update({
          status: 'failed',
          error: 'wrong_target_for_tg',
          sent_at: new Date().toISOString(),
        })
        .eq('id', dbJob.id);
      return;
    }

    if (channel === 'wa' && /^-?\d+$/.test(jid)) {
      await supabase
        .from('campaign_jobs')
        .update({
          status: 'failed',
          error: 'wrong_target_for_wa',
          sent_at: new Date().toISOString(),
        })
        .eq('id', dbJob.id);
      return;
    }


    try {
      this.logger.warn(
        `### ROUTE job=${dbJob.id} channel=${channel} group=${dbJob.group_jid} tpl=${data.templateId} ###`,
      );
      if (channel === 'tg') {
        await withTimeout(
          this.telegram.sendToGroup(dbJob.user_id, dbJob.group_jid, {
            text: tpl.text ?? '',
            mediaUrl: tpl.media_url ?? null,
          }),
          30_000,
          'send_timeout',
        );
      } else {
        // wa
        let waStatus = this.whatsapp.getStatus(dbJob.user_id);
        if (waStatus.status !== 'connected') {
          await this.whatsapp.startSession(dbJob.user_id);
          waStatus = this.whatsapp.getStatus(dbJob.user_id);
        }

        if (waStatus.status !== 'connected') {
          await supabase
            .from('campaign_jobs')
            .update({ status: 'pending', error: 'wa_not_connected' })
            .eq('id', dbJob.id);
          throw new Error('wa_not_connected');
        }

        await withTimeout(
          this.whatsapp.sendToGroup(dbJob.user_id, dbJob.group_jid, {
            text: tpl.text ?? '',
            mediaUrl: tpl.media_url ?? null,
          }),
          30_000,
          'send_timeout',
        );
      }

      await supabase
        .from('campaign_jobs')
        .update({
          status: 'sent',
          error: null,
          sent_at: new Date().toISOString(),
        })
        .eq('id', dbJob.id);
    } catch (e: any) {
      await supabase
        .from('campaign_jobs')
        .update({
          status: 'failed',
          error: e?.message ?? String(e),
          sent_at: new Date().toISOString(),
        })
        .eq('id', dbJob.id);

      throw e;
    }
  }
}
