import type { ActivityEvent } from '@scrum/shared';
import type { TFunction } from 'i18next';
import { describe, expect, it } from 'vitest';
import { describeEvent } from './activity-text';

/** Çeviri yerine anahtarı ve parametreleri döndüren sahte `t`: cümle seçimi test edilir. */
const t = ((key: string, options?: Record<string, unknown>) =>
  options ? `${key}${JSON.stringify(options)}` : key) as unknown as TFunction;

const event = (over: Partial<ActivityEvent>): ActivityEvent => ({
  id: '00000000-0000-7000-8000-000000000001',
  action: 'item.updated',
  actor: null,
  at: '2026-10-02T10:00:00.000Z',
  item: null,
  changes: [],
  detail: null,
  ...over,
});

describe('describeEvent (ADR-057)', () => {
  it('durum değişikliği: alan adı ve okunur değerler', () => {
    const lines = describeEvent(
      event({ changes: [{ field: 'statusId', from: 'Yapılacak', to: 'Devam ediyor' }] }),
      t,
    );
    expect(lines).toEqual([
      'activity.changed{"field":"activity.fields.statusId","from":"Yapılacak","to":"Devam ediyor"}',
    ]);
  });

  it('öncelik değerleri çevrilir', () => {
    const [line] = describeEvent(
      event({ changes: [{ field: 'priority', from: 'NORMAL', to: 'HIGH' }] }),
      t,
    );
    expect(line).toContain('"from":"priority.NORMAL"');
    expect(line).toContain('"to":"priority.HIGH"');
  });

  it('atananlar: eklenen ve çıkarılan ayrı cümle', () => {
    const [line] = describeEvent(
      event({ changes: [{ field: 'assigneeIds', from: ['Ali', 'Veli'], to: ['Veli', 'Zeynep'] }] }),
      t,
    );
    expect(line).toBe(
      'activity.assigneesAdded{"names":"Zeynep"} · activity.assigneesRemoved{"names":"Ali"}',
    );
  });

  it('toplu işaret ve tamamlanma tarihi ayrı satır üretmez; boşsa genel cümle', () => {
    expect(
      describeEvent(
        event({
          changes: [
            { field: 'bulk', from: null, to: 'true' },
            { field: 'completedAt', from: null, to: '2026-10-02' },
          ],
        }),
        t,
      ),
    ).toEqual(['activity.updated']);
  });

  it('açıklama gövdesi gösterilmez', () => {
    expect(
      describeEvent(
        event({ changes: [{ field: 'description', from: 'edited', to: 'edited' }] }),
        t,
      ),
    ).toEqual(['activity.descriptionEdited']);
  });

  it('bilinmeyen alan ham adıyla; bilinmeyen olay eylem adıyla', () => {
    const [line] = describeEvent(
      event({ changes: [{ field: 'yeniAlan', from: null, to: 'x' }] }),
      t,
    );
    expect(line).toContain('"field":"yeniAlan"');
    expect(describeEvent(event({ action: 'item.baska' }), t)).toEqual(['item.baska']);
  });

  it('ek ve checklist olayları ayrıntıyı taşır', () => {
    expect(describeEvent(event({ action: 'item.attachment_added', detail: 'a.pdf' }), t)).toEqual([
      'activity.attachmentAdded{"name":"a.pdf"}',
    ]);
    expect(describeEvent(event({ action: 'item.checklist_added', detail: 'Yayın' }), t)).toEqual([
      'activity.checklistAdded{"name":"Yayın"}',
    ]);
  });
});
