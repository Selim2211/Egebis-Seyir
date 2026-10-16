import type { Label, WorkItemSummary } from '@scrum/shared';
import type { CellContext } from './cells';
import type { ViewRow } from './view-state';

/** List ve Table görünümlerinin ortak girdileri ve geri çağrıları. */
export interface ViewProps {
  rows: ViewRow[];
  cells: CellContext;
  labels: ReadonlyMap<string, Label>;
  selected: ReadonlySet<string>;
  onSelect: (itemId: string, selected: boolean) => void;
  onSelectAll: (selected: boolean) => void;
  allSelected: boolean;
  collapsedItems: ReadonlySet<string>;
  onToggleItem: (itemId: string) => void;
  onToggleGroup: (groupId: string) => void;
  canAddChild: (item: WorkItemSummary) => boolean;
  onAddChild: (itemId: string) => void;
  onCopy: (itemId: string) => void;
  /** Task'ı Epic'e dönüştürme (yalnızca Scrum Space'inde Task için). */
  canPromote: (item: WorkItemSummary) => boolean;
  onPromote: (item: WorkItemSummary) => void;
  onArchive: (item: WorkItemSummary) => void;
  onDelete: (item: WorkItemSummary) => void;
  /** Alt öğe hızlı oluşturma satırının açık olduğu öğe. */
  addingUnder: string | null;
  renderAddChild: (item: WorkItemSummary) => React.ReactNode;
  /** Sürükle-bırak (ADR-116): Task/Sub-Task sürüklenebilir; Task'ın üstüne bırakınca alt görev olur. */
  canDrag?: (item: WorkItemSummary) => boolean;
  canDropOn?: (dragged: WorkItemSummary, target: WorkItemSummary) => boolean;
  onNest?: (dragged: WorkItemSummary, target: WorkItemSummary) => void;
  /** "Ayır" alanına bırakılan alt öğe üst öğesinden ayrılır. */
  onUnnest?: (dragged: WorkItemSummary) => void;
}
