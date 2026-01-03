import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { CampaignsService } from './campaigns.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

function toBool(v: any) {
  return v === true || v === 'true' || v === 1 || v === '1';
}
function toNum(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}
function normChannel(v: any): 'wa' | 'tg' {
  return String(v || 'wa').toLowerCase() === 'tg' ? 'tg' : 'wa';
}

@Controller('campaigns')
@UseGuards(JwtAuthGuard)
export class CampaignsController {
  constructor(private readonly campaigns: CampaignsService) {}

  // ✅ Active по конкретному каналу
  @Get('active/:channel')
  async activeByChannel(@Req() req: any, @Param('channel') channel: string) {
    const userId = req?.user?.userId;
    if (!userId) return { success: false, message: 'userId is required' };
    return this.campaigns.getActiveCampaign(userId, normChannel(channel));
  }

  // ✅ Active сразу для двух каналов (удобно для фронта)
  @Get('active')
  async activeAll(@Req() req: any) {
    const userId = req?.user?.userId;
    if (!userId) return { success: false, message: 'userId is required' };

    const wa = await this.campaigns.getActiveCampaign(userId, 'wa');
    const tg = await this.campaigns.getActiveCampaign(userId, 'tg');

    if (!wa.success) return wa;
    if (!tg.success) return tg;

    return { success: true, wa: wa.active, tg: tg.active };
  }

  @Post('start-multi')
  async startMulti(@Req() req: any, @Body() body: any) {
    const userId = req?.user?.userId;
    if (!userId) return { success: false, message: 'userId is required' };

    return this.campaigns.startMulti(userId, {
      timeFrom: body?.timeFrom,
      timeTo: body?.timeTo,
      betweenGroupsSecMin: toNum(body?.betweenGroupsSecMin),
      betweenGroupsSecMax: toNum(body?.betweenGroupsSecMax),
      betweenTemplatesMinMin: toNum(body?.betweenTemplatesMinMin),
      betweenTemplatesMinMax: toNum(body?.betweenTemplatesMinMax),

      repeatEnabled: toBool(body?.repeatEnabled),
      repeatMinMin: toNum(body?.repeatMinMin),
      repeatMaxMin: undefined as any, // не используем
      repeatMinMax: toNum(body?.repeatMinMax),

      // ✅ ВАЖНО: передаём channel
      channel:body?.channel,
    } as any);
  }

  @Get(':campaignId/progress')
  async progress(@Param('campaignId') campaignId: string) {
    if (!campaignId)
      return { success: false, message: 'campaignId is required' };
    return this.campaigns.getProgress(campaignId);
  }

  @Get(':campaignId/jobs')
  async jobs(@Param('campaignId') campaignId: string) {
    if (!campaignId)
      return { success: false, message: 'campaignId is required' };
    return this.campaigns.getJobs(campaignId);
  }

  @Post(':campaignId/requeue')
  async requeue(@Param('campaignId') campaignId: string, @Body() body: any) {
    if (!campaignId)
      return { success: false, message: 'campaignId is required' };

    return this.campaigns.requeueCampaign(campaignId, {
      includeSent: toBool(body?.includeSent),
      forceNow: toBool(body?.forceNow),
    });
  }

  @Post(':campaignId/stop')
  async stop(@Param('campaignId') campaignId: string) {
    if (!campaignId)
      return { success: false, message: 'campaignId is required' };
    return this.campaigns.stopCampaign(campaignId);
  }
}
