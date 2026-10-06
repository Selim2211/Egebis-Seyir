import { Module } from '@nestjs/common';
import { MessagesController } from './messages.controller';
import { MessagesService } from './messages.service';

/** Birebir mesajlaşma (Faz 7.8). */
@Module({ controllers: [MessagesController], providers: [MessagesService] })
export class MessagesModule {}
