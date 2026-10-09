import { Module } from '@nestjs/common';
import { BackupController } from './backup.controller';
import { BackupService } from './backup.service';

/** Space/Sprint yedek ve geri yükleme (Faz 8.5). */
@Module({ controllers: [BackupController], providers: [BackupService] })
export class BackupModule {}
