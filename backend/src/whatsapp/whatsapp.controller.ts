// backend/src/whatsapp/whatsapp.controller.ts
import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { WhatsappService, SessionInfo } from './whatsapp.service';

@Controller('whatsapp')
export class WhatsappController {
  constructor(private readonly whatsapp: WhatsappService) {}

  @Post('start')
  async start(
    @Body('userId') userId: string,
  ): Promise<
    { success: false; message: string } | { success: true; status: SessionInfo }
  > {
    if (!userId) return { success: false, message: 'userId is required' };

    const status = await this.whatsapp.startSession(userId);
    return { success: true, status };
  }

  @Get('status/:userId')
  async status(
    @Param('userId') userId: string,
  ): Promise<
    { success: false; message: string } | { success: true; status: SessionInfo }
  > {
    if (!userId) return { success: false, message: 'userId is required' };

    const status = this.whatsapp.getStatus(userId);
    return { success: true, status };
  }

  @Post('sync-groups')
  async syncGroups(@Body('userId') userId: string) {
    if (!userId) return { success: false, message: 'userId is required' };
    return await this.whatsapp.syncGroups(userId);
  }

  @Get('groups/:userId')
  async getGroups(@Param('userId') userId: string) {
    if (!userId) return { success: false, message: 'userId is required' };
    return await this.whatsapp.getGroupsFromDb(userId);
  }

  // ✅ НОВОЕ: включить/выключить группу для рассылки
  @Post('groups/select')
  async setSelected(
    @Body() body: { userId?: string; wa_group_id?: string; is_selected?: any },
  ) {
    const userId = body?.userId;
    const waGroupId = body?.wa_group_id;
    const isSelected =
      body?.is_selected === true ||
      body?.is_selected === 'true' ||
      body?.is_selected === 1 ||
      body?.is_selected === '1';

    if (!userId) return { success: false, message: 'userId is required' };
    if (!waGroupId)
      return { success: false, message: 'wa_group_id is required' };

    return await this.whatsapp.setGroupSelected({
      userId,
      waGroupId,
      isSelected,
    });
  }

  @Post('groups/time')
  async setSendTime(
    @Body()
    body: { userId?: string; wa_group_id?: string; send_time?: string | null },
  ) {
    const userId = body?.userId;
    const waGroupId = body?.wa_group_id;
    const sendTime =
      body?.send_time === '' || body?.send_time == null
        ? null
        : String(body?.send_time);

    if (!userId) return { success: false, message: 'userId is required' };
    if (!waGroupId)
      return { success: false, message: 'wa_group_id is required' };

    return await this.whatsapp.setGroupSendTime({
      userId,
      waGroupId,
      sendTime,
    });
  }
}
