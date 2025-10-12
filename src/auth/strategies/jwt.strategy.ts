import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-jwt';
import { JwtPayload } from '../types';
import type { Request } from 'express';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    // Define a typed extractor to avoid unsafe any from third-party typings
    const jwtFromRequest = (req: Request): string | null => {
      const auth = req.headers?.authorization;
      if (!auth) return null;
      const [scheme, token] = auth.split(' ');
      if (!scheme || scheme.toLowerCase() !== 'bearer' || !token) return null;
      return token;
    };
    const secret = process.env.JWT_SECRET ?? 'dev_access_secret';
    const options: {
      jwtFromRequest: (req: Request) => string | null;
      ignoreExpiration: boolean;
      secretOrKey: string;
    } = {
      jwtFromRequest,
      ignoreExpiration: false,
      secretOrKey: secret,
    };
     
    super(options);
  }

   
  async validate(payload: JwtPayload): Promise<{ userId: string; email: string; role: string }> {
    return { userId: payload.sub, email: payload.email, role: payload.role };
  }
}
