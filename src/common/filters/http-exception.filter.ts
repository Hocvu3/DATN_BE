import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import { Request, Response } from 'express';
import { ApiResponse } from '../interfaces/api-response.interface';

// In-memory rate limiting for login attempts
// In a production app, you would use Redis or a similar solution
const loginAttempts = new Map<string, { count: number; timestamp: number }>();

/**
 * Global filter to catch and format all HTTP exceptions
 */
@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
    private readonly logger = new Logger(HttpExceptionFilter.name);

    /**
     * Track login attempts for basic rate limiting
     * @param request The HTTP request object
     * @returns Number of attempts in the current window
     */
    private trackLoginAttempt(request: Request): number {
        // Use IP + user-agent as a key for tracking
        // In production, you would want a more sophisticated approach
        const key = `${request.ip}:${request.headers['user-agent'] || 'unknown'}`;
        const now = Date.now();
        const windowMs = 15 * 60 * 1000; // 15 minutes

        const record = loginAttempts.get(key) || { count: 0, timestamp: now };

        // Reset count if window has expired
        if (now - record.timestamp > windowMs) {
            loginAttempts.set(key, { count: 1, timestamp: now });
            return 1;
        }

        // Increment count
        record.count++;
        loginAttempts.set(key, record);

        // Log excessive attempts
        if (record.count >= 5) {
            this.logger.warn(`Multiple login failures detected from ${key}: ${record.count} attempts`);
        }

        return record.count;
    }

    catch(exception: HttpException, host: ArgumentsHost) {
        const ctx = host.switchToHttp();
        const response = ctx.getResponse<Response>();
        const request = ctx.getRequest<Request>();
        const status = exception.getStatus();

        // Extract error message and response body
        let errorMessage = 'An error occurred';
        let validationErrors: Record<string, string[]> | undefined;

        const exceptionResponse = exception.getResponse();

        if (typeof exceptionResponse === 'string') {
            errorMessage = exceptionResponse;
        } else if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
            const exceptionObj = exceptionResponse as Record<string, unknown>;

            if (exceptionObj.message) {
                if (Array.isArray(exceptionObj.message)) {
                    errorMessage = (exceptionObj.message[0] as string) || 'Validation failed';
                    validationErrors = this.formatValidationErrors(exceptionObj.message as string[]);
                } else {
                    errorMessage = exceptionObj.message as string;
                }
            }

            if (exceptionObj.error && typeof exceptionObj.error === 'string') {
                errorMessage = errorMessage || exceptionObj.error;
            }
        }

        // Handle authentication errors specifically
        const isUnauthorized = status === 401; // HttpStatus.UNAUTHORIZED = 401
        if (isUnauthorized) {
            errorMessage = errorMessage || 'Authentication failed';

            // Special case for login failures
            if (request.url.includes('/api/auth/login')) {
                // Format improved for frontend display
                errorMessage = 'Invalid email or password';

                // Add security message for repeated failed attempts
                const attemptCount = this.trackLoginAttempt(request);
                if (attemptCount >= 3) {
                    if (!validationErrors) {
                        validationErrors = {};
                    }
                    validationErrors.general = [
                        'Multiple failed login attempts detected. Please try again later or reset your password.',
                    ];
                }
            }
        }

        // Log the error with appropriate severity level - using explicit numeric check
        // Using a numeric approach as TypeScript ESLint is preventing enum comparisons
        const isServerError = status >= 500;

        if (isServerError) {
            this.logger.error(
                `${request.method} ${request.url} ${status} - ${errorMessage}`,
                exception.stack,
            );
        } else {
            this.logger.warn(`${request.method} ${request.url} ${status} - ${errorMessage}`);
        }

        // Format and send the error response
        const errorResponse: ApiResponse<void> = {
            success: false,
            message: errorMessage,
            errors: validationErrors as Record<string, string[]>,
            timestamp: new Date().toISOString(),
            path: request.url,
            statusCode: status,
        };

        response.status(status).json(errorResponse);
    }

    /**
     * Format validation errors into a more structured object
     */
    private formatValidationErrors(errors: string[]): Record<string, string[]> {
        const formattedErrors: Record<string, string[]> = {};

        errors.forEach(error => {
            const matches = error.match(/^([^\s]+)\s(.+)$/);
            if (matches && matches.length > 2) {
                const field = matches[1];
                const message = matches[2];

                if (!formattedErrors[field]) {
                    formattedErrors[field] = [];
                }

                formattedErrors[field].push(message);
            } else {
                if (!formattedErrors['general']) {
                    formattedErrors['general'] = [];
                }
                formattedErrors['general'].push(error);
            }
        });

        return formattedErrors;
    }
}
