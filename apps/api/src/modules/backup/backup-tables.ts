/**
 * Yedeğe giren tablolar ve aralarındaki bağlar (Faz 8.5, ADR-105). Yedek, Prisma satırlarının
 * olduğu gibi JSON'a dökümüdür; geri yüklemede her `id` yenilenir ve `refs` ile `users` alanları
 * yeni kimliklere çevrilir. Böylece yeni bir alan eklendiğinde yedek kendiliğinden onu da taşır.
 */
export interface TableSpec {
  /** data.json anahtarı ve kimlik haritasındaki tür adı. */
  name: string;
  /** Prisma istemcisindeki delegate adı. */
  delegate: string;
  /** Alan → hedef tablonun `name` değeri. Aynı yedekteki kayıtlara işaret eder. */
  refs: Record<string, string>;
  /** Kullanıcıya işaret eden alanlar; e-posta ile eşlenir, bulunamazsa null. */
  users: string[];
  /** Eşlenemezse satırın atlanacağı zorunlu kullanıcı alanları. */
  requiredUsers?: string[];
  /** Null olabilen Json alanları (Prisma.DbNull gerekir). */
  nullableJson?: string[];
  /** Birleşik anahtarlı tabloların `id` alanı yoktur. */
  noId?: boolean;
}

/** Geri yükleme sırası: bir tablo yalnızca kendinden öncekilere işaret eder. */
export const TABLES: readonly TableSpec[] = [
  { name: 'status', delegate: 'status', refs: { spaceId: 'space' }, users: [] },
  { name: 'folder', delegate: 'folder', refs: { spaceId: 'space' }, users: ['deletedById'] },
  {
    name: 'list',
    delegate: 'list',
    refs: { spaceId: 'space', folderId: 'folder' },
    users: ['deletedById'],
  },
  { name: 'label', delegate: 'label', refs: { spaceId: 'space' }, users: [] },
  { name: 'customField', delegate: 'customField', refs: { spaceId: 'space' }, users: [] },
  { name: 'sprint', delegate: 'sprint', refs: { spaceId: 'space' }, users: ['createdById'] },
  {
    name: 'workItem',
    delegate: 'workItem',
    refs: {
      spaceId: 'space',
      listId: 'list',
      parentId: 'workItem',
      statusId: 'status',
      sprintId: 'sprint',
    },
    users: ['reporterId', 'deletedById'],
    nullableJson: ['description', 'recurrence'],
  },
  {
    name: 'workItemAssignee',
    delegate: 'workItemAssignee',
    refs: { workItemId: 'workItem' },
    users: ['userId'],
    requiredUsers: ['userId'],
    noId: true,
  },
  {
    name: 'workItemLabel',
    delegate: 'workItemLabel',
    refs: { workItemId: 'workItem', labelId: 'label' },
    users: [],
    noId: true,
  },
  { name: 'checklist', delegate: 'checklist', refs: { workItemId: 'workItem' }, users: [] },
  {
    name: 'checklistItem',
    delegate: 'checklistItem',
    refs: { checklistId: 'checklist' },
    users: [],
  },
  {
    name: 'workItemLink',
    delegate: 'workItemLink',
    refs: { fromId: 'workItem', toId: 'workItem' },
    users: ['createdById'],
  },
  {
    name: 'doc',
    delegate: 'doc',
    refs: { spaceId: 'space', parentId: 'doc' },
    users: ['createdById', 'updatedById'],
    nullableJson: ['content'],
  },
  {
    name: 'docVersion',
    delegate: 'docVersion',
    refs: { docId: 'doc' },
    users: ['authorId'],
    nullableJson: ['content'],
  },
  {
    name: 'comment',
    delegate: 'comment',
    refs: { workItemId: 'workItem', docId: 'doc' },
    users: ['authorId'],
  },
  {
    name: 'attachment',
    delegate: 'attachment',
    refs: { workItemId: 'workItem', docId: 'doc' },
    users: ['uploaderId'],
  },
  {
    name: 'sprintItemEvent',
    delegate: 'sprintItemEvent',
    refs: { sprintId: 'sprint', workItemId: 'workItem' },
    users: ['actorId'],
  },
];

/** Space geri yüklemede atlanmayan; sprint geri yüklemede yalnız bunlar yazılır. */
export const SPRINT_TABLES: ReadonlySet<string> = new Set([
  'sprint',
  'workItem',
  'workItemAssignee',
  'workItemLabel',
  'checklist',
  'checklistItem',
  'workItemLink',
  'comment',
  'attachment',
  'sprintItemEvent',
]);

export const BACKUP_FORMAT = 'egebis-seyir-backup';
export const BACKUP_VERSION = 1;
