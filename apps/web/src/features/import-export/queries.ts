import {
  ExportResponseSchema,
  ImportPreviewSchema,
  ImportResultSchema,
  type ImportMapping,
} from '@scrum/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCurrentWorkspace } from '@/features/workspace/queries';
import { apiRequest } from '@/lib/api';
import { downloadCsv } from '@/lib/download';

const base = (workspaceId: string, listId: string) => `/workspaces/${workspaceId}/lists/${listId}`;

/** List'in tüm işlerini (üst/alt, özel alanlar dahil) CSV olarak indirtir. */
export function useExportList(listId: string) {
  const { id } = useCurrentWorkspace();
  return useMutation({
    mutationFn: async (filename: string) => {
      const { rows } = await apiRequest(`${base(id, listId)}/export`, ExportResponseSchema);
      downloadCsv(filename, rows);
      return rows.length - 1;
    },
  });
}

export function usePreviewImport(listId: string) {
  const { id } = useCurrentWorkspace();
  return useMutation({
    mutationFn: (input: { csv: string; mapping?: ImportMapping }) =>
      apiRequest(`${base(id, listId)}/import/preview`, ImportPreviewSchema, {
        method: 'POST',
        body: input,
      }),
  });
}

export function useImportCsv(listId: string) {
  const qc = useQueryClient();
  const { id } = useCurrentWorkspace();
  return useMutation({
    mutationFn: (input: { csv: string; mapping: ImportMapping }) =>
      apiRequest(`${base(id, listId)}/import`, ImportResultSchema, {
        method: 'POST',
        body: input,
      }),
    onSettled: () => qc.invalidateQueries({ queryKey: ['workspaces', id] }),
  });
}
