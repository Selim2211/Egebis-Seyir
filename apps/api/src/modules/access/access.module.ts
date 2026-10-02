import { Global, Module } from '@nestjs/common';
import { AccessService } from './access.service';
import { SpaceAccessService } from './space-access.service';

@Global()
@Module({
  providers: [AccessService, SpaceAccessService],
  exports: [AccessService, SpaceAccessService],
})
export class AccessModule {}
