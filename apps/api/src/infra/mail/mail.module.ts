import { Global, Module } from '@nestjs/common';
import { SecretBoxService } from '../security/secret-box.service';
import { MailSettingsService } from './mail-settings.service';
import { MailService } from './mail.service';

@Global()
@Module({
  providers: [MailService, MailSettingsService, SecretBoxService],
  exports: [MailService, MailSettingsService],
})
export class MailModule {}
