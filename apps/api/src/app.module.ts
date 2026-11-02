import { Module } from '@nestjs/common';
import { HealthController } from './modules/platform/health.controller';
import { DatabaseService } from './db/database.service';
import { IdentityService } from './modules/identity/identity.service';
import { IdentityController } from './modules/identity/identity.controller';
import { CompaniesController } from './modules/tenancy/companies.controller';

@Module({
  controllers: [HealthController, IdentityController, CompaniesController],
  providers: [DatabaseService, IdentityService],
})
export class AppModule {}
