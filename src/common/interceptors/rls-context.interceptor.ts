import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * RLS Context Interceptor
 * Automatically sets PostgreSQL session variables for Row Level Security (RLS)
 * based on the authenticated user's JWT token.
 * 
 * This interceptor extracts user information from the request and sets:
 * - app.current_user_id: The authenticated user's ID
 * - app.current_user_role: The user's role (ADMIN, MANAGER, EMPLOYEE)
 * - app.current_user_department_id: The user's department ID
 * 
 * These session variables are used by RLS policies in PostgreSQL to filter data.
 * 
 * Note: Uses SET (not SET LOCAL) to persist variables across the session.
 * Variables will be automatically cleared when the connection is returned to the pool.
 */
@Injectable()
export class RlsContextInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<any>> {
    const request = context.switchToHttp().getRequest();
    
    // Skip RLS context for health check endpoints
    if (request.url?.includes('/health')) {
      return next.handle();
    }
    
    const user = request.user;

    // Only set RLS context if user is authenticated
    if (user?.userId && user?.role) {
      try {
        // Set PostgreSQL session variables for RLS
        // Using SET (not SET LOCAL) to persist across queries in this request
        await this.prisma.$executeRawUnsafe(
          `SET app.current_user_id = '${user.userId.replace(/'/g, "''")}'`
        );
        await this.prisma.$executeRawUnsafe(
          `SET app.current_user_role = '${user.role.replace(/'/g, "''")}'`
        );
        
        // Set department_id (handle null case)
        if (user.departmentId) {
          await this.prisma.$executeRawUnsafe(
            `SET app.current_user_department_id = '${user.departmentId.replace(/'/g, "''")}'`
          );
        } else {
          await this.prisma.$executeRawUnsafe(
            `SET app.current_user_department_id = ''`
          );
        }
        
        console.log(`🔒 RLS Context set: userId=${user.userId}, role=${user.role}, departmentId=${user.departmentId || 'null'}`);
      } catch (error) {
        console.error('❌ Failed to set RLS context:', error);
      }
    }

    return next.handle();
  }
}
