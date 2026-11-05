import { Module } from '@nestjs/common';
import { HealthController } from './modules/platform/health.controller';
import { DatabaseService } from './db/database.service';
import { IdentityService } from './modules/identity/identity.service';
import { IdentityController } from './modules/identity/identity.controller';
import { CompaniesController } from './modules/tenancy/companies.controller';
import { BillingDashboardController } from './modules/tenancy/billing-dashboard.controller';
import { CustomersController } from './modules/tenancy/customers.controller';
import { ProductsController } from './modules/tenancy/products.controller';
import { LegacyInvoiceDraftsController } from './modules/tenancy/legacy-invoice-drafts.controller';
import { RegistrationController } from './modules/onboarding/registration.controller';
import { RegistrationService } from './modules/onboarding/registration.service';

// Disabled by default: no signup endpoints or registration DB pool unless enabled.
const registrationEnabled = process.env.ENABLE_REGISTRATION === '1';

@Module({
  controllers: [
    HealthController, IdentityController, CompaniesController, BillingDashboardController, CustomersController, ProductsController, LegacyInvoiceDraftsController,
    ...(registrationEnabled ? [RegistrationController] : []),
  ],
  providers: [
    DatabaseService, IdentityService,
    ...(registrationEnabled ? [RegistrationService] : []),
  ],
})
export class AppModule {}
