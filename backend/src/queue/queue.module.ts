import { Module } from '@nestjs/common';
import { QueueService } from './queue.service';
import { CampaignBullWorker } from './campaign.worker';
import { SupabaseModule } from '../supabase/supabase.module';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { TelegramModule } from '../telegram/telegram.module';

@Module({
  imports: [SupabaseModule, WhatsappModule, TelegramModule],
  providers: [QueueService, CampaignBullWorker],
  exports: [QueueService],
})
export class QueueModule {}
