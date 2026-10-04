import { Global, Injectable, Module } from '@nestjs/common';
import type { AutomationEvent } from '@scrum/shared';

export type AutomationEventInput = AutomationEvent & { itemId: string; spaceId: string };
type Handler = (event: AutomationEventInput) => Promise<void>;

/**
 * İş öğesi olaylarını otomasyon motoruna ileten dahili veri yolu (ADR-084). İş servisleri
 * motoru doğrudan bilmez (döngüsel bağımlılık olmasın); motor açılışta işleyicisini kaydeder.
 */
@Injectable()
export class AutomationEvents {
  private handler: Handler | null = null;

  register(handler: Handler): void {
    this.handler = handler;
  }

  /** İşleyici hata verse bile asıl işlem etkilenmez. */
  async emit(event: AutomationEventInput): Promise<void> {
    if (!this.handler) return;
    try {
      await this.handler(event);
    } catch {
      // Otomasyon hataları çalışma günlüğüne yazılır; burada yutulur.
    }
  }
}

@Global()
@Module({ providers: [AutomationEvents], exports: [AutomationEvents] })
export class AutomationEventsModule {}
