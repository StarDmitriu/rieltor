import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { requireEnv } from '../config/env';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();

    const authHeader: string | undefined =
      req.headers?.authorization || req.headers?.Authorization;

    const token = this.extractBearerToken(authHeader);

    if (!token) {
      throw new UnauthorizedException('No token provided');
    }

    try {
      const payload = jwt.verify(token, requireEnv('JWT_SECRET')) as any;

      if (!payload?.userId) {
        throw new UnauthorizedException('Invalid token payload');
      }

      req.user = payload; // { userId, phone, iat, exp }
      return true;
    } catch (e) {
      throw new UnauthorizedException('Invalid token');
    }
  }

  private extractBearerToken(authHeader?: string): string | null {
    if (!authHeader || typeof authHeader !== 'string') return null;

    const parts = authHeader.trim().split(/\s+/);
    if (parts.length !== 2) return null;

    const [scheme, token] = parts;
    if (!/^bearer$/i.test(scheme)) return null;

    const t = String(token || '').trim();
    return t ? t : null;
  }
}
