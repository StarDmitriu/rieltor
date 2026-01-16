import { Body, Controller, Get, Headers, Post, HttpCode } from '@nestjs/common';
import { AuthService } from './auth.service';
import * as jwt from 'jsonwebtoken';
import { requireEnv } from '../config/env';
//backend/src/auth/auth.controller.ts
@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  @Post('send-code')
  @HttpCode(200)
  sendCode(@Body('phone') phone: string) {
    return this.auth.sendCode(phone);
  }

  @Post('verify-code')
  @HttpCode(200)
  verify(@Body() body: any) {
    const { phone, code, full_name, gender, telegram, birthday, ref } = body;

    return this.auth.verifyCode(
      phone,
      code,
      {
        full_name,
        gender,
        telegram,
        birthday,
      },
      ref,
    );
  }

  @Get('me')
  async me(@Headers('authorization') authHeader?: string) {
    const token = this.extractBearerToken(authHeader);
    if (!token) return { success: false, message: 'No token provided' };

    try {
      const payload = jwt.verify(token, requireEnv('JWT_SECRET')) as {
        userId: string;
        phone: string;
      };

      if (!payload?.userId) {
        return { success: false, message: 'Invalid token payload' };
      }

      const user = await this.auth.getUserById(payload.userId);
      if (!user) return { success: false, message: 'User not found' };
      const { tg_session, ...safeUser } = user as any;
      return { success: true, user: safeUser };
    } catch (e) {
      console.error('JWT verify error:', e);
      return { success: false, message: 'Invalid token' };
    }
  }

  @Post('update-profile')
  async updateProfile(
    @Headers('authorization') authHeader?: string,
    @Body()
    body?: {
      full_name?: string;
      gender?: string;
      telegram?: string;
      birthday?: string | null;
    },
  ) {
    const token = this.extractBearerToken(authHeader);
    if (!token) return { success: false, message: 'No token provided' };

    try {
      const payload = jwt.verify(token, requireEnv('JWT_SECRET')) as {
        userId: string;
        phone: string;
      };

      if (!payload?.userId) {
        return { success: false, message: 'Invalid token payload' };
      }

      const user = await this.auth.updateProfile(payload.userId, body || {});
      const { tg_session, ...safeUser } = user as any;
      return { success: true, user: safeUser };
    } catch (e) {
      console.error('JWT verify error (update-profile):', e);
      return { success: false, message: 'Invalid token' };
    }
  }

  private extractBearerToken(authHeader?: string): string | null {
    if (!authHeader || typeof authHeader !== 'string') return null;

    // допускаем "Bearer <token>" в любом регистре
    const parts = authHeader.trim().split(/\s+/);
    if (parts.length !== 2) return null;

    const [scheme, token] = parts;
    if (!/^bearer$/i.test(scheme)) return null;

    const t = String(token || '').trim();
    return t ? t : null;
  }
}
