import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api/v1');
  app.enableShutdownHooks();
  const origins = (process.env.CORS_ORIGINS || '').split(',').map(x => x.trim()).filter(Boolean);
  if (origins.length) app.enableCors({ origin: origins, credentials: false });
  if (process.env.ENABLE_SWAGGER === '1') {
    const config = new DocumentBuilder().setTitle('GST SaaS API').setVersion('1.0.0').build();
    SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, config));
  }
  const port = Number(process.env.API_PORT || 4100);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid API_PORT');
  // Private by default. Container network access is an explicit staging opt-in
  // and must be paired with a loopback-only host port binding and Plesk proxy.
  const bindHost = process.env.API_BIND_HOST || '127.0.0.1';
  if (bindHost !== '127.0.0.1' &&
      !(bindHost === '0.0.0.0' && process.env.ALLOW_CONTAINER_BIND === '1')) {
    throw new Error('Refusing API_BIND_HOST without explicit container bind opt-in');
  }
  await app.listen(port, bindHost);
}
bootstrap().catch(error => { console.error(error); process.exitCode = 1; });
