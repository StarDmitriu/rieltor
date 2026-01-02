import { Body, Controller, Get, Headers, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import * as jwt from 'jsonwebtoken';

@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  @Post('send-code')
  sendCode(@Body('phone') phone: string) {
    return this.auth.sendCode(phone);
  }

  @Post('verify-code')
  verify(@Body() body: any) {
    const { phone, code, full_name, gender, telegram, birthday } = body;

    return this.auth.verifyCode(phone, code, {
      full_name,
      gender,
      telegram,
      birthday,
    });
  }

  @Get('me')
  async me(@Headers('authorization') authHeader?: string) {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return { success: false, message: 'No token provided' };
    }

    const token = authHeader.replace('Bearer ', '').trim();

    try {
      const payload = jwt.verify(
        token,
        (process.env.JWT_SECRET as string) || 'dev_secret',
      ) as { userId: string; phone: string };

      if (!payload.userId) {
        return { success: false, message: 'Invalid token payload' };
      }

      const user = await this.auth.getUserById(payload.userId);

      if (!user) {
        return { success: false, message: 'User not found' };
      }

      return { success: true, user };
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
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return { success: false, message: 'No token provided' };
    }

    const token = authHeader.replace('Bearer ', '').trim();

    try {
      const payload = jwt.verify(
        token,
        (process.env.JWT_SECRET as string) || 'dev_secret',
      ) as { userId: string; phone: string };

      if (!payload.userId) {
        return { success: false, message: 'Invalid token payload' };
      }

      const user = await this.auth.updateProfile(payload.userId, body || {});

      return { success: true, user };
    } catch (e) {
      console.error('JWT verify error (update-profile):', e);
      return { success: false, message: 'Invalid token' };
    }
  }
}
