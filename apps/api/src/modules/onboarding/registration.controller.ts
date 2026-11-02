import { Body, Controller, HttpCode, Ip, Post } from '@nestjs/common';
import { RegistrationService } from './registration.service';

@Controller('registrations')
export class RegistrationController {
  constructor(private readonly service: RegistrationService) {}

  @Post()
  @HttpCode(202)
  request(@Body() input: unknown, @Ip() ip: string) {
    return this.service.request(input, ip);
  }

  @Post('verify')
  @HttpCode(200)
  verify(@Body() body: { token?: unknown }) {
    return this.service.verify(body?.token);
  }
}
