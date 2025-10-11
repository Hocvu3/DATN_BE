import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

@Injectable()
export class BigIntSerializerInterceptor implements NestInterceptor {
    intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
        return next.handle().pipe(
            map(data => {
                return this.serialize(data);
            }),
        );
    }

    private serialize(data: any): any {
        if (data === null || data === undefined) {
            return data;
        }

        if (typeof data === 'bigint') {
            return data.toString();
        }

        // Special handling for Date objects
        if (data instanceof Date) {
            return data.toISOString(); // Convert Date to ISO string for proper JSON serialization
        }

        if (Array.isArray(data)) {
            return data.map(item => this.serialize(item));
        }

        if (typeof data === 'object' && data !== null) {
            // Handle special case of empty object dates that come from Prisma
            // Prisma sometimes returns empty objects for Date fields: {}
            if (Object.keys(data).length === 0 && data.constructor === Object) {
                return null; // Convert empty objects to null
            }

            const result = {};
            for (const key in data) {
                if (Object.prototype.hasOwnProperty.call(data, key)) {
                    result[key] = this.serialize(data[key]);
                }
            }
            return result;
        }

        return data;
    }
}