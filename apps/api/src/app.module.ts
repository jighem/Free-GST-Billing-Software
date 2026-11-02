import { Module } from '@nestjs/common';
import { HealthController } from './modules/platform/health.controller';

@Module({
  controllers: [HealthController],
})
export class AppModule {}
