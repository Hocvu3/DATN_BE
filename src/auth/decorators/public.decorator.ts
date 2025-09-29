import { SetMetadata } from '@nestjs/common';

/**
 * Public route key for metadata
 */
export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Mark a route as public (no authentication required)
 * @returns Decorator function
 */
export const Public = (): MethodDecorator => SetMetadata(IS_PUBLIC_KEY, true);
