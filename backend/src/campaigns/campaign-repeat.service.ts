// backend/src/campaigns/campaign-repeat.service.ts
import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { CampaignsService } from './campaigns.service';

@Injectable()
export class CampaignRepeatService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CampaignRepeatService.name);
  private timer: NodeJS.Timeout | null = null;

  private readonly enabled =
    String(process.env.CAMPAIGN_REPEAT_ENABLED || '').toLowerCase() === 'true';

  private readonly intervalMs = Number(
    process.env.CAMPAIGN_REPEAT_TICK_MS || 10_000,
  );

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly campaignsService: CampaignsService,
  ) {}

  onModuleInit() {
    if (!this.enabled) {
      this.logger.warn(
        'Campaign repeat watcher disabled (set CAMPAIGN_REPEAT_ENABLED=true to enable)',
      );
      return;
    }

    // каждые 10 сек (или из env)
    this.timer = setInterval(
      () => this.tick().catch(() => undefined),
      this.intervalMs,
    );
    this.logger.log(`Campaign repeat watcher started (${this.intervalMs}ms)`);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private async tick() {
    const supabase = this.supabaseService.getClient();
    const nowIso = new Date().toISOString();

    // ВАЖНО: берём только те, у которых next_repeat_at НЕ null и уже <= now
    const { data: camps, error } = await supabase
      .from('campaigns')
      .select('id')
      .eq('repeat_enabled', true)
      .eq('status', 'running')
      .not('next_repeat_at', 'is', null)
      .lte('next_repeat_at', nowIso)
      .limit(20);

    if (error) {
      this.logger.warn(`repeat select error: ${error.message}`);
      return;
    }

    this.logger.log(`repeat tick now=${nowIso} due=${(camps ?? []).length}`);

    for (const c of camps ?? []) {
      await this.campaignsService.repeatWaveIfReady((c as any).id);
    }
  }
}
