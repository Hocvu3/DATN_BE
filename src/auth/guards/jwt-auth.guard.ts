import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { HealthCheckLogger } from 'src/common/utils/health-check-logger';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const handler = context.getHandler().name;
    const controller = context.getClass().name;

    if (isPublic) {
      // Skip logging for health check to reduce noise
      if (controller === 'HealthController' && handler === 'check') {
        HealthCheckLogger.logHealthCheck();
      } else {
        console.log(`🟢 PUBLIC route: ${controller}.${handler}`);
      }
      return true;
    }

    console.log(`🔒 PROTECTED route: ${controller}.${handler}`);
    return super.canActivate(context);
  }
}
