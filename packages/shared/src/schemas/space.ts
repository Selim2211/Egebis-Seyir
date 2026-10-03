import { z } from 'zod';
import { ESTIMATION_SCALES, SPRINT_LENGTH_WEEKS } from '../constants/estimation';
import { SPACE_ICONS, SPACE_KEY_PATTERN } from '../constants/space';
import { STATUS_CATEGORIES } from '../constants/work-item';
import { SPACE_ROLES, WORKSPACE_ROLES } from '../permissions/roles';

/** Space, Folder ve List adları. */
export const ContainerNameSchema = z.string().trim().min(1).max(80);

export const SpaceKeySchema = z.string().trim().toUpperCase().regex(SPACE_KEY_PATTERN);

export const ColorSchema = z.string().regex(/^#[0-9A-Fa-f]{6}$/);

const spaceFields = {
  name: ContainerNameSchema,
  key: SpaceKeySchema,
  color: ColorSchema,
  icon: z.enum(SPACE_ICONS).nullable(),
  description: z.string().trim().max(500).nullable(),
  isPrivate: z.boolean(),
  scrumEnabled: z.boolean(),
  sprintLengthWeeks: z.int().min(SPRINT_LENGTH_WEEKS.min).max(SPRINT_LENGTH_WEEKS.max),
  sprintGoalRequired: z.boolean(),
  estimationScale: z.enum(ESTIMATION_SCALES),
};

export const SpaceMemberInputSchema = z.object({
  userId: z.uuid(),
  role: z.enum(SPACE_ROLES),
});
export type SpaceMemberInput = z.infer<typeof SpaceMemberInputSchema>;

/** POST /api/workspaces/:workspaceId/spaces — oluşturan, listede yoksa Product Owner eklenir. */
export const CreateSpaceRequestSchema = z.object({
  ...spaceFields,
  icon: spaceFields.icon.default(null),
  description: spaceFields.description.default(null),
  isPrivate: spaceFields.isPrivate.default(false),
  scrumEnabled: spaceFields.scrumEnabled.default(true),
  sprintLengthWeeks: spaceFields.sprintLengthWeeks.default(SPRINT_LENGTH_WEEKS.default),
  sprintGoalRequired: spaceFields.sprintGoalRequired.default(true),
  estimationScale: spaceFields.estimationScale.default('FIBONACCI'),
  members: z.array(SpaceMemberInputSchema).max(500).default([]),
});
export type CreateSpaceRequest = z.input<typeof CreateSpaceRequestSchema>;
/** Varsayılanlar uygulanmış hali (API tarafı). */
export type CreateSpaceData = z.output<typeof CreateSpaceRequestSchema>;

/** PATCH /api/workspaces/:workspaceId/spaces/:spaceId */
export const UpdateSpaceRequestSchema = z.object(spaceFields).partial();
export type UpdateSpaceRequest = z.infer<typeof UpdateSpaceRequestSchema>;

export const StatusSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  color: z.string(),
  category: z.enum(STATUS_CATEGORIES),
});
export type Status = z.infer<typeof StatusSchema>;

const spaceSummary = {
  id: z.uuid(),
  name: z.string(),
  key: z.string(),
  color: z.string(),
  icon: z.enum(SPACE_ICONS).nullable(),
  isPrivate: z.boolean(),
  scrumEnabled: z.boolean(),
  /** Kullanıcının bu Space'teki etkin izinleri (ADR-039). */
  permissions: z.array(z.string()),
};

/** GET /api/workspaces/:workspaceId/spaces/:spaceId */
export const SpaceDetailSchema = z.object({
  ...spaceSummary,
  description: z.string().nullable(),
  sprintLengthWeeks: z.int(),
  sprintGoalRequired: z.boolean(),
  estimationScale: z.enum(ESTIMATION_SCALES),
  archived: z.boolean(),
  myRole: z.enum(SPACE_ROLES).nullable(),
  statuses: z.array(StatusSchema),
  createdAt: z.iso.datetime(),
});
export type SpaceDetail = z.infer<typeof SpaceDetailSchema>;

// ---------- Kenar çubuğu ağacı ----------

export const TreeListSchema = z.object({ id: z.uuid(), name: z.string() });
export type TreeList = z.infer<typeof TreeListSchema>;

export const TreeFolderSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  lists: z.array(TreeListSchema),
});
export type TreeFolder = z.infer<typeof TreeFolderSchema>;

export const TreeSpaceSchema = z.object({
  ...spaceSummary,
  folders: z.array(TreeFolderSchema),
  /** Klasörsüz listeler (Folder'lardan sonra gösterilir). */
  lists: z.array(TreeListSchema),
});
export type TreeSpace = z.infer<typeof TreeSpaceSchema>;

export const FAVORITE_TYPES = ['SPACE', 'FOLDER', 'LIST'] as const;
export type FavoriteType = (typeof FAVORITE_TYPES)[number];

export const FavoriteSchema = z.object({
  type: z.enum(FAVORITE_TYPES),
  id: z.uuid(),
  name: z.string(),
  spaceId: z.uuid(),
});
export type Favorite = z.infer<typeof FavoriteSchema>;

/** GET /api/workspaces/:workspaceId/hierarchy — görünür, arşivlenmemiş ve silinmemiş yapı. */
export const HierarchyResponseSchema = z.object({
  spaces: z.array(TreeSpaceSchema),
  favorites: z.array(FavoriteSchema),
});
export type HierarchyResponse = z.infer<typeof HierarchyResponseSchema>;

// ---------- Folder / List ----------

/** POST .../spaces/:spaceId/folders, PATCH .../folders/:folderId, PATCH .../lists/:listId */
export const NameRequestSchema = z.object({ name: ContainerNameSchema });
export type NameRequest = z.infer<typeof NameRequestSchema>;

/** POST .../spaces/:spaceId/lists */
export const CreateListRequestSchema = z.object({
  name: ContainerNameSchema,
  folderId: z.uuid().nullable().default(null),
});
export type CreateListRequest = z.input<typeof CreateListRequestSchema>;

/** POST .../spaces/:spaceId/move, .../folders/:folderId/move — `afterId: null` = en başa. */
export const MoveRequestSchema = z.object({ afterId: z.uuid().nullable() });
export type MoveRequest = z.infer<typeof MoveRequestSchema>;

/** POST .../lists/:listId/move — aynı Space içinde Folder'lar ve kök arasında. */
export const MoveListRequestSchema = z.object({
  folderId: z.uuid().nullable(),
  afterId: z.uuid().nullable(),
});
export type MoveListRequest = z.infer<typeof MoveListRequestSchema>;

/** Oluşturma yanıtı (yeni kaydın id'si; ağaç ayrıca yeniden yüklenir). */
export const CreatedSchema = z.object({ id: z.uuid() });
export type Created = z.infer<typeof CreatedSchema>;

const crumbSpace = z.object({
  id: z.uuid(),
  name: z.string(),
  color: z.string(),
  icon: z.enum(SPACE_ICONS).nullable(),
});

/** GET .../folders/:folderId */
export const FolderDetailSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  archived: z.boolean(),
  space: crumbSpace,
  lists: z.array(TreeListSchema),
});
export type FolderDetail = z.infer<typeof FolderDetailSchema>;

/** GET .../lists/:listId */
export const ListDetailSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  /** List veya ebeveynlerinden biri arşivde. */
  archived: z.boolean(),
  space: crumbSpace,
  folder: z.object({ id: z.uuid(), name: z.string() }).nullable(),
});
export type ListDetail = z.infer<typeof ListDetailSchema>;

// ---------- Favoriler ----------

/** PUT/DELETE /api/workspaces/:workspaceId/favorites/:type/:id */
export const FavoriteTypeParamSchema = z.enum(FAVORITE_TYPES);

// ---------- Space üyeleri ----------

export const SpaceMemberSchema = z.object({
  userId: z.uuid(),
  name: z.string(),
  title: z.string().nullable(),
  avatarVersion: z.string().nullable(),
  role: z.enum(SPACE_ROLES),
  workspaceRole: z.enum(WORKSPACE_ROLES),
});
export type SpaceMember = z.infer<typeof SpaceMemberSchema>;

/** GET .../spaces/:spaceId/members */
export const SpaceMembersResponseSchema = z.object({ members: z.array(SpaceMemberSchema) });
export type SpaceMembersResponse = z.infer<typeof SpaceMembersResponseSchema>;

/** PUT .../spaces/:spaceId/members/:userId — ekler veya rolünü değiştirir. */
export const PutSpaceMemberRequestSchema = z.object({ role: z.enum(SPACE_ROLES) });
export type PutSpaceMemberRequest = z.infer<typeof PutSpaceMemberRequestSchema>;

// ---------- Arşiv ve çöp kutusu (ADR-041) ----------

/** Arşiv ve çöp kutusunda listelenen öğe türleri. */
export const ARCHIVE_TYPES = [...FAVORITE_TYPES, 'ITEM'] as const;
export type ArchiveType = (typeof ARCHIVE_TYPES)[number];

export const ArchiveEntrySchema = z.object({
  type: z.enum(ARCHIVE_TYPES),
  id: z.uuid(),
  name: z.string(),
  /** Bulunduğu yer: "Space" veya "Space › Folder"; Space'in kendisi için null. */
  location: z.string().nullable(),
  /** Arşivlenme veya silinme zamanı. */
  at: z.iso.datetime(),
  /** Çöp kutusu: silen kişi. */
  by: z.string().nullable(),
});
export type ArchiveEntry = z.infer<typeof ArchiveEntrySchema>;

/** GET /api/workspaces/:workspaceId/archive — kullanıcının geri getirebildiği öğeler. */
export const ArchiveResponseSchema = z.object({
  archived: z.array(ArchiveEntrySchema),
  trash: z.array(ArchiveEntrySchema),
  retentionDays: z.int(),
});
export type ArchiveResponse = z.infer<typeof ArchiveResponseSchema>;

// ---------- Workspace ayarları (ADR-042) ----------

/** GET/PATCH /api/workspaces/:workspaceId/settings */
export const WorkspaceSettingsSchema = z.object({
  name: ContainerNameSchema,
  membersCanCreateSpaces: z.boolean(),
});
export type WorkspaceSettings = z.infer<typeof WorkspaceSettingsSchema>;

export const UpdateWorkspaceSettingsRequestSchema = WorkspaceSettingsSchema.partial();
export type UpdateWorkspaceSettingsRequest = z.infer<typeof UpdateWorkspaceSettingsRequestSchema>;
