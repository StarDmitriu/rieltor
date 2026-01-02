//backend/src/campaigns/campaigns.controller.ts
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

@Controller('campaigns')
@UseGuards(JwtAuthGuard) // ✅ теперь все методы требуют токен
export class CampaignsController {
  constructor(private readonly campaigns: CampaignsService) {}

  // ✅ active — без userId в URL, берём из токена
  @Get('active')
  async active(@Req() req: any) {
    const userId = req?.user?.userId;
    if (!userId) return { success: false, message: 'userId is required' };
    return this.campaigns.getActiveCampaign(userId);
  }

  // ✅ start-multi — без userId в body, берём из токена
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
      repeatMinMax: toNum(body?.repeatMinMax),
    });
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

  // API можно оставить, но кнопку уберём с фронта — ок
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
