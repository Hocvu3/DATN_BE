import { Controller, Get, OnModuleInit } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Public } from 'src/auth/decorators/public.decorator';
import { SkipAuditContext } from 'src/common/decorators/skip-audit-context.decorator';
import { HealthCheckLogger } from 'src/common/utils/health-check-logger';

@ApiTags('Health')
@Controller('health')
export class HealthController implements OnModuleInit {
  
  onModuleInit() {
    HealthCheckLogger.logOnStartup();
  }

  @Get()
  @Public()
  @SkipAuditContext()
  @ApiOperation({ summary: 'Health check endpoint' })
  @ApiResponse({ status: 200, description: 'Application is healthy' })
  check() {
    HealthCheckLogger.logHealthCheck();
    
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }
}
