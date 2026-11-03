import { Global, Module } from '@nestjs/common';
import { AccessService } from './access.service';
import { HandoverService } from './handover.service';
import { ItemAccessService } from './item-access.service';
import { SpaceAccessService } from './space-access.service';

@Global()
@Module({
  providers: [AccessService, SpaceAccessService, ItemAccessService, HandoverService],
  exports: [AccessService, SpaceAccessService, ItemAccessService, HandoverService],
})
export class AccessModule {}
