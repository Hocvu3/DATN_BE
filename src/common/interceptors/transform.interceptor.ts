import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Request } from 'express';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiResponse } from '../interfaces/api-response.interface';

interface ResponseWithFile {
  isFile?: boolean;
  isStream?: boolean;
  [key: string]: any;
}

/**
 * Interceptor to transform all successful responses to a standardized format
 */
@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, ApiResponse<T>> {
  intercept(context: ExecutionContext, next: CallHandler): Observable<ApiResponse<T>> {
    const ctx = context.switchToHttp();
    const request = ctx.getRequest<Request>();
    const startTime = Date.now();

    return next.handle().pipe(
      map((data: any) => {
        // Skip transformation for streams, files, etc.
        if (data && ((data as ResponseWithFile).isFile || (data as ResponseWithFile).isStream)) {
          return data as unknown as ApiResponse<T>;
        }

        // Check if the data already has our response format
        if (data && typeof data === 'object' && 'success' in data) {
          return data as unknown as ApiResponse<T>;
        }

        // Handle login response specially
        if (
          request.url === '/api/auth/login' &&
          data &&
          typeof data === 'object' &&
          'accessToken' in data
        ) {
          return {
            success: true,
            message: 'Login successful',
            data: data as unknown as T,
            timestamp: new Date().toISOString(),
            path: request.url,
            duration: `${Date.now() - startTime}ms`,
          };
        }

        // Return standardized response format
        return {
          success: true,
          message: 'Operation successful',
          data: data as unknown as T,
          timestamp: new Date().toISOString(),
          path: request.url,
          duration: `${Date.now() - startTime}ms`,
        };
      }),
    );
  }
}
