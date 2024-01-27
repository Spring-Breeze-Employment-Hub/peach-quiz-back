import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';
import appConfig from './config/app.config';
import databaseConfig from './config/database.config';
import { LoggerModule } from './logger/logger.module';
import { DatabaseModule } from './database/database.module';
import { UserModule } from './user/user.module';
import { RoomModule } from './room/room.module';
import { GameModule } from './game/game.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, databaseConfig],
    }),
    LoggerModule,
    DatabaseModule,
    UserModule,
    RoomModule,
    GameModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
