import { SetMetadata } from '@nestjs/common';

export const LOG_READ_OPERATION = 'log_read_operation';

/**
 * Decorator to mark endpoints that should log read operations
 */
export const LogReadOperation = (resourceName: string) =>
  SetMetadata(LOG_READ_OPERATION, resourceName);