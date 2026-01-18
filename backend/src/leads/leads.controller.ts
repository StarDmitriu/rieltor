import {
  Body,
  Controller,
  ForbiddenException,
  Post,
  Req,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateLeadDto } from './dto/create-lead.dto';

@Controller('leads')
export class LeadsController {
  constructor(private readonly supabaseService: SupabaseService) {}

  @Post()
  async create(@Body() dto: CreateLeadDto, @Req() req: any) {
    if (!dto.consent_personal) {
      throw new ForbiddenException('consent_personal_required');
    }

    const supabase = this.supabaseService.getClient();

    const birthDate = dto.birth_date?.trim() ? dto.birth_date.trim() : null;

    const { error } = await supabase.from('lead_requests').insert({
      full_name: dto.full_name.trim(),
      phone: dto.phone.trim(),
      birth_date: birthDate,
      city: dto.city.trim(),
      telegram: dto.telegram?.trim() || null,
      consent_personal: !!dto.consent_personal,
      consent_marketing: !!dto.consent_marketing,
      user_agent: String(req.headers['user-agent'] || '').slice(0, 400),
      ip:
        String(
          req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '',
        ).slice(0, 200) || null,
    });

    if (error) {
      return {
        success: false,
        message: 'supabase_insert_error',
        error: error.message,
      };
    }

    return { success: true };
  }
}
