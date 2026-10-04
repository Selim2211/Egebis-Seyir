import { Download, FileUp, FolderInput } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useErrorMessage } from '@/lib/use-error-message';
import { ImportDialog } from './import-dialog';
import { useExportList } from './queries';

/** List başlığında "Veri" menüsü: CSV dışa aktar / içe aktar (brief §5.14, ADR-085). */
export function DataMenu({
  listId,
  spaceId,
  listName,
  canImport,
}: {
  listId: string;
  spaceId: string;
  listName: string;
  canImport: boolean;
}) {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const exporter = useExportList(listId);
  const [importing, setImporting] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="h-8">
            <FolderInput />
            {t('importExport.menu')}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem
            disabled={exporter.isPending}
            onSelect={() =>
              exporter.mutate(`${listName.replace(/[^\p{L}\p{N}]+/gu, '-')}.csv`, {
                onSuccess: (count) => toast.success(t('importExport.exported', { count })),
                onError: (error) => toast.error(errorMessage(error)),
              })
            }
          >
            <Download /> {t('importExport.export')}
          </DropdownMenuItem>
          {canImport && (
            <DropdownMenuItem onSelect={() => setImporting(true)}>
              <FileUp /> {t('importExport.import')}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {importing && (
        <ImportDialog listId={listId} spaceId={spaceId} onClose={() => setImporting(false)} />
      )}
    </>
  );
}
