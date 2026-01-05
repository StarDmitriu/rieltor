//backend/src/subscriptions/subscriptions.controller.ts
import { Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
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
}
