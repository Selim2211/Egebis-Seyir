/**
 * İzin anahtarları (ADR-011). Rol = izin seti. API guard'ları ve web arayüzü
 * aynı anahtarları kullanır. Yeni izin eklerken varsayılan rol matrisini de güncelle.
 */
export const WORKSPACE_PERMISSIONS = {
  /** Workspace'i silme (brief §7.1; faturalama kapsam dışı). */
  WORKSPACE_DELETE: 'workspace.delete',
  /** Üye listesini görme (Guest göremez, ADR-035). */
  MEMBERS_VIEW: 'workspace.members.view',
  /** Kullanıcı davet/çıkarma, rol atama. */
  MEMBERS_MANAGE: 'workspace.members.manage',
  /** Workspace ayarları. */
  WORKSPACE_SETTINGS: 'workspace.settings',
  /** Denetim günlüğünü görme. */
  AUDIT_VIEW: 'workspace.audit.view',
  /** Space oluşturma. Member için workspace ayarıyla açılıp kapatılabilir. */
  SPACE_CREATE: 'space.create',
} as const;
export type WorkspacePermission =
  (typeof WORKSPACE_PERMISSIONS)[keyof typeof WORKSPACE_PERMISSIONS];

export const SPACE_PERMISSIONS = {
  /** Space ve içeriğini görüntüleme. */
  SPACE_VIEW: 'space.view',
  /** Space ayarları (ad, anahtar, görünürlük, üyeler), DoD/DoR, durum akışı; Space'i arşivleme/silme. */
  SPACE_SETTINGS: 'space.settings',
  /** Folder/List oluşturma, yeniden adlandırma, sıralama, taşıma, arşivleme, silme (ADR-040). */
  LIST_MANAGE: 'space.lists.manage',
  /** Product Backlog sıralama/önceliklendirme. */
  BACKLOG_RANK: 'backlog.rank',
  /** Epic/Story/Task/Sub-task/Bug oluşturma ve düzenleme. */
  WORK_ITEM_WRITE: 'workItem.write',
  /** Kendine atanmış görevin durumunu değiştirme. */
  WORK_ITEM_STATUS_OWN: 'workItem.status.own',
  /** Story point / tahmin girme. */
  ESTIMATE_WRITE: 'estimate.write',
  /** Sprint oluşturma ve planlama (sprint backlog'unu değiştirme). */
  SPRINT_PLAN: 'sprint.plan',
  /** Sprint başlatma. */
  SPRINT_START: 'sprint.start',
  /** Sprint tamamlama. */
  SPRINT_COMPLETE: 'sprint.complete',
  /** Sprint iptal etme (brief §6.1.6: yalnızca PO ve workspace Admin). */
  SPRINT_CANCEL: 'sprint.cancel',
  /** Yorum yapma. */
  COMMENT_WRITE: 'comment.write',
  /** Raporları görme. */
  REPORT_VIEW: 'report.view',
  /** Dokümanları görüntüleme. */
  DOC_VIEW: 'doc.view',
  /** Doküman oluşturma/düzenleme. */
  DOC_WRITE: 'doc.write',
} as const;
export type SpacePermission = (typeof SPACE_PERMISSIONS)[keyof typeof SPACE_PERMISSIONS];

export type Permission = WorkspacePermission | SpacePermission;
