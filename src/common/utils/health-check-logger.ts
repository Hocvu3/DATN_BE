import { Logger } from '@nestjs/common';

export class HealthCheckLogger {
  private static readonly logger = new Logger('HealthCheck');
  private static lastLogTime = 0;
  private static readonly LOG_INTERVAL = 6 * 60 * 60 * 1000; // 6 hours in milliseconds

  static logHealthCheck() {
    const now = Date.now();
    
    // Only log once every 6 hours
    if (now - this.lastLogTime >= this.LOG_INTERVAL) {
      this.logger.log('🟢 PUBLIC route: HealthController.check (throttled - only logs every 6h)');
      this.lastLogTime = now;
    }
  }

  static logOnStartup() {
    this.logger.log('🚀 Health check endpoint initialized - logging throttled to every 6 hours');
    this.lastLogTime = Date.now();
  }
}