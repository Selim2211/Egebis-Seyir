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
  onArchive: (item: WorkItemSummary) => void;
  onDelete: (item: WorkItemSummary) => void;
  /** Alt öğe hızlı oluşturma satırının açık olduğu öğe. */
  addingUnder: string | null;
  renderAddChild: (item: WorkItemSummary) => React.ReactNode;
}
