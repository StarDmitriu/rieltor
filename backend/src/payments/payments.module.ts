import { Module } from '@nestjs/common';
import { SupabaseModule } from '../supabase/supabase.module';
import { ProdamusController } from './prodamus.controller';
import { ProdamusService } from './prodamus.service';

@Module({
  imports: [SupabaseModule],
  controllers: [ProdamusController],
  providers: [ProdamusService],
  exports: [ProdamusService],
})
export class PaymentsModule {}
