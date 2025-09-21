import { applyDecorators } from '@nestjs/common';
import { ApiSecurity } from '@nestjs/swagger';

export function ApiSecurityRequired() {
  return applyDecorators(
    ApiSecurity('access-token')
  );
}
