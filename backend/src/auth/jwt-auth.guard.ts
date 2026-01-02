import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import * as jwt from 'jsonwebtoken';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();

    const authHeader: string | undefined =
      req.headers?.authorization || req.headers?.Authorization;

    if (!authHeader || typeof authHeader !== 'string') {
      throw new UnauthorizedException('No token provided');
    }

    if (!authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Invalid auth header');
    }

    const token = authHeader.replace('Bearer ', '').trim();
    if (!token) throw new UnauthorizedException('No token provided');

    try {
      const payload = jwt.verify(
        token,
        (process.env.JWT_SECRET as string) || 'dev_secret',
      ) as any;

      if (!payload?.userId) {
        throw new UnauthorizedException('Invalid token payload');
      }

      // кладём user в req для контроллеров
      req.user = payload; // { userId, phone, iat, exp }
      return true;
    } catch (e) {
      throw new UnauthorizedException('Invalid token');
    }
  }
}
