import { Module } from '@nestjs/common';
import { SecretBoxService } from '../../infra/security/secret-box.service';
import { BackupController } from './backup.controller';
import { BackupKeyController } from './backup-key.controller';
import { BackupKeyService } from './backup-key.service';
import { BackupService } from './backup.service';

/** Space/Sprint yedek ve geri yükleme (Faz 8.5). */
@Module({
  controllers: [BackupController, BackupKeyController],
  providers: [BackupService, BackupKeyService, SecretBoxService],
})
export class BackupModule {}
