//backend/src/admin/admin.module.ts
import { Module } from '@nestjs/common';
import { SupabaseModule } from '../supabase/supabase.module';
import { AdminController } from './admin.controller';
import { AdminGuard } from './admin.guard';

@Module({
  imports: [SupabaseModule],
  controllers: [AdminController],
  providers: [AdminGuard],
})
export class AdminModule {}
