import {
  SPACE_PERMISSIONS as S,
  WORKSPACE_PERMISSIONS as W,
  type SpacePermission,
  type WorkspacePermission,
} from './permissions';

/**
 * GUEST = "Dış kaynak" (Projeyi yöneten Proje Yöneticisi ekler, 90 gün); VIEWER = "Guest"
 * (yalnızca Super Admin ekler, yalnızca okur, 30 gün, uzatılamaz) — ADR-169.
 */
export const WORKSPACE_ROLES = ['OWNER', 'ADMIN', 'MEMBER', 'GUEST', 'VIEWER'] as const;
export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];

/**
 * Proje (Space) sistem rolleri (ADR-152, ADR-176). Arayüzdeki adları: PROJECT_MANAGER = Scrum Master,
 * PRODUCT_OWNER = Product Owner, PROJECT_MEMBER = Team Member. Bir Projede en çok bir Scrum Master ve
 * bir Product Owner olur; anahtarlar geriye uyum için korunur. Super Admin bir workspace katmanıdır
 * (OWNER/ADMIN) ve her Projede tüm izinlere sahiptir.
 */
export const SPACE_ROLES = ['PROJECT_MANAGER', 'PRODUCT_OWNER', 'PROJECT_MEMBER'] as const;
export type SpaceRole = (typeof SPACE_ROLES)[number];

/**
 * Varsayılan workspace rol matrisi (brief §7.1). DB'ye seed edilir;
 * F2 özel rolleri bu setlerden türetilebilir.
 */
export const DEFAULT_WORKSPACE_ROLE_PERMISSIONS: Record<
  WorkspaceRole,
  readonly WorkspacePermission[]
> = {
  OWNER: [
    W.WORKSPACE_DELETE,
    W.MEMBERS_VIEW,
    W.MEMBERS_MANAGE,
    W.WORKSPACE_SETTINGS,
    W.AUDIT_VIEW,
    W.SPACE_CREATE,
  ],
  ADMIN: [W.MEMBERS_VIEW, W.MEMBERS_MANAGE, W.WORKSPACE_SETTINGS, W.AUDIT_VIEW, W.SPACE_CREATE],
  MEMBER: [W.MEMBERS_VIEW],
  GUEST: [],
  VIEWER: [],
};

const CONTENT = [
  S.DOC_VIEW,
  S.DOC_CREATE,
  S.DOC_EDIT,
  S.DOC_DELETE,
  S.VIDEO_VIEW,
  S.VIDEO_CREATE,
  S.VIDEO_EDIT,
  S.VIDEO_DELETE,
] as const;
const TEAM_WORK = [
  S.SPACE_VIEW,
  S.COMMENT_WRITE,
  S.REPORT_VIEW,
  S.BUG_REPORT,
  S.WORK_ITEM_WRITE,
  S.WORK_ITEM_STATUS_OWN,
  S.ESTIMATE_WRITE,
  S.LIST_MANAGE,
  ...CONTENT,
] as const;
/** Yalnızca Proje Yöneticisi (ve Super Admin) işleri; dış kaynak bunları hiçbir rolle alamaz. */
export const PROJECT_LEAD_PERMISSIONS: readonly SpacePermission[] = [
  S.SPACE_SETTINGS,
  S.BACKLOG_RANK,
  S.SPRINT_PLAN,
  S.SPRINT_START,
  S.SPRINT_COMPLETE,
  S.SPRINT_CANCEL,
  S.WORK_ITEM_ACCESS,
  S.BUG_ASSIGN,
  S.ESTIMATE_OVERRIDE,
];
/** Doküman ve video izinleri (dış kaynak için Super Admin izniyle açılır, ADR-152). */
export const CONTENT_PERMISSIONS: readonly SpacePermission[] = CONTENT;
export const CONTENT_VIEW_PERMISSIONS: readonly SpacePermission[] = [S.DOC_VIEW, S.VIDEO_VIEW];

/**
 * Varsayılan Proje rol matrisi (ADR-152). Roller DB'de tutulur; Super Admin Ayarlar → Roller'den
 * değiştirebilir (ör. üyelerin doküman silmesini kapatmak).
 */
export const DEFAULT_SPACE_ROLE_PERMISSIONS: Record<SpaceRole, readonly SpacePermission[]> = {
  PROJECT_MANAGER: [...TEAM_WORK, ...PROJECT_LEAD_PERMISSIONS],
  // Product Owner Backlog önceliğini yönetir; sprint'i ve atamayı Scrum Master yürütür (ADR-176).
  PRODUCT_OWNER: [...TEAM_WORK, S.BACKLOG_RANK],
  PROJECT_MEMBER: [...TEAM_WORK],
};

/**
 * Proje ayarlarında Proje bazında açılıp kapatılabilen izinler (ADR-161). Görüntüleme ve Proje
 * ayarları rolün kendisinden gelir; bunlar Proje bazında değiştirilemez.
 */
export const PROJECT_CONFIGURABLE_PERMISSIONS: readonly SpacePermission[] = [
  S.WORK_ITEM_WRITE,
  S.WORK_ITEM_STATUS_OWN,
  S.ESTIMATE_WRITE,
  S.ESTIMATE_OVERRIDE,
  S.COMMENT_WRITE,
  S.WORK_ITEM_ACCESS,
  S.BUG_REPORT,
  S.BUG_ASSIGN,
  S.LIST_MANAGE,
  S.BACKLOG_RANK,
  S.SPRINT_PLAN,
  S.SPRINT_START,
  S.SPRINT_COMPLETE,
  S.SPRINT_CANCEL,
  S.DOC_CREATE,
  S.DOC_EDIT,
  S.DOC_DELETE,
  S.VIDEO_CREATE,
  S.VIDEO_EDIT,
  S.VIDEO_DELETE,
];

/** Projenin rol ayarı: rol anahtarı → açık olan ayarlanabilir izinler. Olmayan rol varsayılanı kullanır. */
export type ProjectRoleOverrides = Partial<Record<SpaceRole, readonly string[]>>;

/**
 * Proje üyesinin etkin rol izinleri: ayarlanabilir izinler Projenin ayarından (varsa), diğerleri
 * Workspace'teki rolden gelir (ADR-161).
 */
export function projectRolePermissions(
  roleKey: string,
  rolePermissions: readonly string[],
  overrides: ProjectRoleOverrides | null | undefined,
): readonly string[] {
  const override = overrides?.[roleKey as SpaceRole];
  if (!override) return rolePermissions;
  const configurable = PROJECT_CONFIGURABLE_PERMISSIONS as readonly string[];
  return [
    ...rolePermissions.filter((p) => !configurable.includes(p)),
    ...override.filter((p) => configurable.includes(p)),
  ];
}

/** Workspace Owner/Admin her Space'te tüm Space izinlerine sahiptir (ADR-038). */
export const ALL_SPACE_PERMISSIONS: readonly SpacePermission[] = Object.values(S);

/** Süreli hesaplar (ADR-169): Dış kaynak 90 gün (Super Admin +90 gün uzatır), Guest 30 gün (uzatılamaz). */
export const OUTSOURCE_TERM_DAYS = 90;
export const OUTSOURCE_EXTEND_DAYS = 90;
export const VIEWER_TERM_DAYS = 30;

/** Katmanın standart hesap süresi (gün); süresiz katmanlarda null. */
export function accountTermDays(tier: WorkspaceRole): number | null {
  if (tier === 'GUEST') return OUTSOURCE_TERM_DAYS;
  if (tier === 'VIEWER') return VIEWER_TERM_DAYS;
  return null;
}

/**
 * Scrum metodolojisinde Scrum Master = Proje Yöneticisi'dir (ADR-170). Projenin Scrum Master'ı,
 * Proje rolü ne olursa olsun, Backlog'daki işleri sprint'e alabilir (sprint planlama) ve atama yapabilir.
 */
export const SCRUM_MASTER_EXTRA_PERMISSIONS: readonly SpacePermission[] = [
  S.SPRINT_PLAN,
  S.BUG_ASSIGN,
];

/** Projede tek kişiye verilen roller (ADR-176). */
export const SINGLE_HOLDER_SPACE_ROLES = ['PROJECT_MANAGER', 'PRODUCT_OWNER'] as const;

/**
 * Üye listesinde en çok bir Scrum Master ve bir Product Owner bırakır (listedeki ilk sahip kalır),
 * fazlası Team Member olur. Projenin scrumMasterId / productOwnerId alanları buradan türetilir.
 */
export function normalizeScrumRoles<T extends { userId: string; role: string }>(
  members: readonly T[],
): { members: T[]; scrumMasterId: string | null; productOwnerId: string | null } {
  let scrumMasterId: string | null = null;
  let productOwnerId: string | null = null;
  const out = members.map((m) => {
    if (m.role === 'PROJECT_MANAGER') {
      if (scrumMasterId === null) scrumMasterId = m.userId;
      else return { ...m, role: 'PROJECT_MEMBER' };
    } else if (m.role === 'PRODUCT_OWNER') {
      if (productOwnerId === null) productOwnerId = m.userId;
      else return { ...m, role: 'PROJECT_MEMBER' };
    }
    return m;
  });
  return { members: out, scrumMasterId, productOwnerId };
}
