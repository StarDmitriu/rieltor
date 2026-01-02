//backend/src/telegram/telegram.controller.ts
import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { TelegramService } from './telegram.service';

@Controller('telegram')
export class TelegramController {
  constructor(private readonly telegram: TelegramService) {}

  @Get('status/:userId')
  async status(@Param('userId') userId: string) {
    if (!userId) return { success: false, message: 'userId is required' };
    return this.telegram.getStatus(userId);
  }

  // старт: отправить код на номер (номер берём из users.phone)
  @Post('start')
  async start(@Body('userId') userId: string) {
    if (!userId) return { success: false, message: 'userId is required' };
    return this.telegram.startAuth(userId);
  }

  @Post('confirm-code')
  async confirmCode(@Body() body: any) {
    const userId = body?.userId;
    const code = body?.code;
    if (!userId) return { success: false, message: 'userId is required' };
    if (!code) return { success: false, message: 'code is required' };
    return this.telegram.confirmCode(userId, code);
  }

  @Post('confirm-password')
  async confirmPassword(@Body() body: any) {
    const userId = body?.userId;
    const password = body?.password;
    if (!userId) return { success: false, message: 'userId is required' };
    if (!password) return { success: false, message: 'password is required' };
    return this.telegram.confirmPassword(userId, password);
  }

  @Post('disconnect')
  async disconnect(@Body('userId') userId: string) {
    if (!userId) return { success: false, message: 'userId is required' };
    return this.telegram.disconnect(userId);
  }

  @Post('sync-groups')
  async syncGroups(@Body('userId') userId: string) {
    if (!userId) return { success: false, message: 'userId is required' };
    return this.telegram.syncGroups(userId);
  }

  @Get('groups/:userId')
  async getGroups(@Param('userId') userId: string) {
    if (!userId) return { success: false, message: 'userId is required' };
    return this.telegram.getGroupsFromDb(userId);
  }

  @Post('groups/select')
  async setSelected(@Body() body: any) {
    const userId = body?.userId;
    const tgChatId = String(body?.tg_chat_id || '').trim();
    const isSelected =
      body?.is_selected === true ||
      body?.is_selected === 'true' ||
      body?.is_selected === 1 ||
      body?.is_selected === '1';

    if (!userId) return { success: false, message: 'userId is required' };
    if (!tgChatId) return { success: false, message: 'tg_chat_id is required' };

    return this.telegram.setGroupSelected({ userId, tgChatId, isSelected });
  }
}
