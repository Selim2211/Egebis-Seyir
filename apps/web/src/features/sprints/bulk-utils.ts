/** Toplu işlemlerde ihtiyaç duyulan en az alan (satır ya da alt öğe). */
export interface BulkItem {
  id: string;
  key: string;
  title: string;
  type: string;
  parentId: string | null;
  childCount: number;
  listId: string;
}

/** Alt görevi olmayan Task ya da Sub-Task başka bir Task'ın Sub-Task'ı olabilir (ADR-116). */
export const canBecomeSubtask = (item: BulkItem) =>
  item.type === 'SUBTASK' || (item.type === 'TASK' && item.childCount === 0);
