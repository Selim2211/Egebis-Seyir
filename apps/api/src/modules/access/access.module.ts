import { Global, Module } from '@nestjs/common';
import { AccessService } from './access.service';
import { ItemAccessService } from './item-access.service';
import { SpaceAccessService } from './space-access.service';

@Global()
@Module({
  providers: [AccessService, SpaceAccessService, ItemAccessService],
  exports: [AccessService, SpaceAccessService, ItemAccessService],
})
export class AccessModule {}
