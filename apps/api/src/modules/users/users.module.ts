import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { AvatarService } from './avatar.service';
import { AvatarController, UsersController } from './users.controller';

@Module({
  imports: [MulterModule.register({ storage: memoryStorage() })],
  controllers: [UsersController, AvatarController],
  providers: [AvatarService],
})
export class UsersModule {}
