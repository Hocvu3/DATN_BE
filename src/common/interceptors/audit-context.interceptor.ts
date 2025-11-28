import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { tap, finalize } from 'rxjs/operators';
import { Request } from 'express';
import { AuditContextService } from '../../prisma/audit-context.service';
import { SKIP_AUDIT_CONTEXT } from '../decorators/skip-audit-context.decorator';

@Injectable()
export class AuditContextInterceptor implements NestInterceptor {
  constructor(
    private auditContextService: AuditContextService,
    private reflector: Reflector,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    // Check if audit context should be skipped
    const skipAuditContext = this.reflector.getAllAndOverride<boolean>(
      SKIP_AUDIT_CONTEXT,
      [context.getHandler(), context.getClass()],
    );

    const request = context.switchToHttp().getRequest<Request>();
    
    // Skip audit context for health check endpoints or decorated routes
    if (skipAuditContext || request.url?.includes('/health')) {
      return next.handle();
    }
    
    const user = request.user as any; // Assuming user is attached to request after auth

    // Extract audit context from request
    const userId = user?.id;
    const ipAddress = this.getClientIp(request);
    const userAgent = request.headers['user-agent'];

    // Set audit context before operation
    const setContextPromise = this.auditContextService
      .setAuditContext(userId, ipAddress, userAgent)
      .catch((error) => {
        // Log error but don't throw to avoid breaking the request
        console.error('Failed to set audit context:', error);
      });

    return next.handle().pipe(
      tap(async () => {
        // Wait for context to be set
        await setContextPromise;
      }),
      finalize(async () => {
        // Clear context after operation
        try {
          await this.auditContextService.clearAuditContext();
        } catch (error) {
          console.error('Failed to clear audit context:', error);
        }
      }),
    );
  }

  private getClientIp(request: Request): string {
    return (
      (request.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      (request.headers['x-real-ip'] as string) ||
      request.connection?.remoteAddress ||
      request.socket?.remoteAddress ||
      'unknown'
    );
  }
}