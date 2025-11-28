import { SetMetadata } from '@nestjs/common';

export const SKIP_AUDIT_CONTEXT = 'skip_audit_context';

/**
 * Decorator to skip audit context setup for specific endpoints
 * Use for high-frequency endpoints like health checks
 */
export const SkipAuditContext = () => SetMetadata(SKIP_AUDIT_CONTEXT, true);