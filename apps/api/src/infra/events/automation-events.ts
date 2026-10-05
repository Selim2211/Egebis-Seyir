import { Global, Injectable, Module } from '@nestjs/common';
import type { AutomationEvent } from '@scrum/shared';

/** İş öğesi olayları (otomasyon tetikleyicileri ve webhook olaylarının ortak kaynağı). */
export type AutomationEventInput = AutomationEvent & { itemId: string; spaceId: string };

/** Otomasyon dışındaki dış olaylar (webhook): yorum ve sprint (ADR-087). */
export type ExternalEventInput =
  | { type: 'COMMENT_CREATED'; itemId: string; spaceId: string; commentId: string }
  | { type: 'SPRINT_STARTED' | 'SPRINT_COMPLETED'; sprintId: string; spaceId: string };

export type DomainEventInput = AutomationEventInput | ExternalEventInput;
type Handler = (event: DomainEventInput) => Promise<void>;

/**
 * Alan olaylarını dinleyicilere ileten dahili veri yolu (ADR-084, ADR-087). Üreticiler dinleyicileri
 * (otomasyon motoru, webhook gönderimi) bilmez; dinleyiciler açılışta kaydolur.
 */
@Injectable()
export class AutomationEvents {
  private readonly handlers: Handler[] = [];

  register(handler: Handler): void {
    this.handlers.push(handler);
  }

  /** Bir dinleyici hata verse bile asıl işlem ve diğer dinleyiciler etkilenmez. */
  async emit(event: DomainEventInput): Promise<void> {
    for (const handler of this.handlers) {
      try {
        await handler(event);
      } catch {
        // Dinleyici hataları kendi günlüklerine yazılır; burada yutulur.
      }
    }
  }
}

@Global()
@Module({ providers: [AutomationEvents], exports: [AutomationEvents] })
export class AutomationEventsModule {}
