import { Body, Controller, Post } from '@nestjs/common';
import { SheetsService } from './sheets.service';

@Controller('sheets')
export class SheetsController {
  constructor(private readonly sheets: SheetsService) {}

  @Post('create')
  async create(@Body('userId') userId: string) {
    if (!userId) return { success: false, message: 'userId is required' };
    return this.sheets.createForUser(userId);
  }
}
