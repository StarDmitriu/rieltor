//backend/src/templates/templates.controller.ts
import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { TemplatesService } from './templates.service';

@Controller('templates')
export class TemplatesController {
  constructor(private readonly templates: TemplatesService) {}

  @Post('sync')
  async sync(@Body('userId') userId: string) {
    if (!userId) return { success: false, message: 'userId is required' };
    return this.templates.syncFromSheet(userId);
  }

  @Get('list/:userId')
  async list(@Param('userId') userId: string) {
    if (!userId) return { success: false, message: 'userId is required' };
    return this.templates.list(userId);
  }

  @Post('create')
  async create(@Body() body: any) {
    const userId = body?.userId;
    if (!userId) return { success: false, message: 'userId is required' };

    return this.templates.createManual(userId, {
      title: body?.title,
      text: body?.text,
      media_url: body?.media_url,
      enabled: body?.enabled,
      order: body?.order,
    });
  }

  // ✅ НОВОЕ: загрузка файла в Supabase Storage
  @Post('upload-media')
  @UseInterceptors(FileInterceptor('file'))
  async uploadMedia(
    @UploadedFile() file: Express.Multer.File,
    @Body('userId') userId: string,
  ) {
    if (!userId) return { success: false, message: 'userId is required' };
    if (!file) return { success: false, message: 'file is required' };

    return this.templates.uploadMedia(userId, file);
  }

  @Post('update')
  async update(@Body() body: any) {
    const userId = body?.userId;
    const templateId = body?.templateId;
    if (!userId) return { success: false, message: 'userId is required' };
    if (!templateId)
      return { success: false, message: 'templateId is required' };

    return this.templates.update(userId, templateId, {
      title: body?.title,
      text: body?.text,
      media_url: body?.media_url,
      enabled: body?.enabled,
      order: body?.order,
    });
  }

  @Get('get/:templateId')
  async get(@Param('templateId') templateId: string) {
    if (!templateId)
      return { success: false, message: 'templateId is required' };
    return this.templates.getById(templateId);
  }

  @Post('delete')
  async del(@Body() body: any) {
    const userId = body?.userId;
    const templateId = body?.templateId;
    if (!userId) return { success: false, message: 'userId is required' };
    if (!templateId)
      return { success: false, message: 'templateId is required' };

    return this.templates.remove(userId, templateId);
  }
  @Get('targets/:userId/:templateId')
  async getTargets(
    @Param('userId') userId: string,
    @Param('templateId') templateId: string,
  ) {
    if (!userId) return { success: false, message: 'userId is required' };
    if (!templateId)
      return { success: false, message: 'templateId is required' };
    return this.templates.getTargets(userId, templateId);
  }

  // ✅ сохранить выбранные группы для шаблона (полная замена списка)
  @Post('targets/set')
  async setTargets(@Body() body: any) {
    const userId = body?.userId;
    const templateId = body?.templateId;
    const groupJids = body?.groupJids;

    if (!userId) return { success: false, message: 'userId is required' };
    if (!templateId)
      return { success: false, message: 'templateId is required' };
    if (!Array.isArray(groupJids))
      return { success: false, message: 'groupJids must be array' };

    return this.templates.setTargets(userId, templateId, groupJids);
  }
}
