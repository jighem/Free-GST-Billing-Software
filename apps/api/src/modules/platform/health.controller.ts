import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

@ApiTags('platform')
@Controller('health')
export class HealthController {
  @Get()
  @ApiOperation({ summary: 'Process liveness only; not database readiness' })
  health(): { status: 'ok'; service: 'gst-saas-api'; version: 1 } {
    return { status: 'ok', service: 'gst-saas-api', version: 1 };
  }
}
