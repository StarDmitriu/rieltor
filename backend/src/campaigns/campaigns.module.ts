import { Module } from '@nestjs/common';
import { SupabaseModule } from '../supabase/supabase.module';
import { CampaignsController } from './campaigns.controller';
import { CampaignsService } from './campaigns.service';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { QueueModule } from '../queue/queue.module';
import { CampaignRepeatService } from './campaign-repeat.service';

@Module({
  imports: [SupabaseModule, WhatsappModule, QueueModule],
  controllers: [CampaignsController],
  providers: [CampaignsService, CampaignRepeatService],
  exports: [CampaignsService],
})
export class CampaignsModule {}
