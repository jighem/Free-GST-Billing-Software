import { Body, Controller, Get, Headers, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IdentityService } from './identity.service';

@ApiTags('identity')
@Controller('auth')
export class IdentityController {
  constructor(private readonly identity: IdentityService) {}

  @Post('login')
  async login(@Body() body: { email?: unknown; password?: unknown }) {
    return this.identity.login(body?.email, body?.password);
  }

  @Get('tenants')
  @ApiBearerAuth()
  async tenants(@Headers('authorization') authorization?: string) {
    return this.identity.memberships(await this.identity.authenticate(authorization));
  }
}
