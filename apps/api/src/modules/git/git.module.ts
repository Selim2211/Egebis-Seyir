import { Module } from '@nestjs/common';
import { GitIntegrationsController, GitReceiverController } from './git.controller';
import { GitService } from './git.service';

/** GitHub/GitLab bağlantısı (Faz 6.4). */
@Module({
  controllers: [GitIntegrationsController, GitReceiverController],
  providers: [GitService],
})
export class GitModule {}
