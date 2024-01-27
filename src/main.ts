import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ValidationConfig } from './config/validation.config';
import { IoAdapter } from '@nestjs/platform-socket.io';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  app.useGlobalPipes(new ValidationPipe(ValidationConfig));
  app.useWebSocketAdapter(new IoAdapter(app));

  const port = configService.get<number>('port');
  await app.listen(port);
  Logger.log(`🚀Application is running on: ${port}`);
}

bootstrap();
