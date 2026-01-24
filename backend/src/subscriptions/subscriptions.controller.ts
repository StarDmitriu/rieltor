//backend/src/subscriptions/subscriptions.controller.ts
import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SubscriptionsService } from './subscriptions.service';

@Controller('subscriptions')
@UseGuards(JwtAuthGuard)
export class SubscriptionsController {
  constructor(private readonly subs: SubscriptionsService) {}

  @Get('me')
  async me(@Req() req: any) {
    const userId = req?.user?.userId;
    if (!userId) return { success: false, message: 'userId is required' };
    return this.subs.getMySubscription(userId);
  }

  @Post('start-trial')
  async startTrial(@Req() req: any) {
    const userId = req?.user?.userId;
    if (!userId) return { success: false, message: 'userId is required' };
    return this.subs.startTrial(userId, 3);
  }

  @Post('cancel')
  async cancelAutoRenew(@Req() req: any, @Body() body: any) {
    const userId = req?.user?.userId;
    if (!userId) return { success: false, message: 'userId is required' };
    const cancel =
      body?.cancel === true || body?.cancel === 'true' || body?.cancel === 1;
    return this.subs.setCancelAtPeriodEnd(userId, cancel);
  }
}
