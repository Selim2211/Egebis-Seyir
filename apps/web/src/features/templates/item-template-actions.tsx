import { BookmarkPlus, FileStack } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { useErrorMessage } from '@/lib/use-error-message';
import { useApplyTemplate, useSaveTemplate, useTemplates } from './queries';

/** İş detayında "Şablon olarak kaydet": öğe ve bir seviye alt öğeleri şablon olur. */
export function SaveItemTemplate({
  spaceId,
  itemId,
  title,
}: {
  spaceId: string;
  itemId: string;
  title: string;
}) {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const save = useSaveTemplate();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(title);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    save.mutate(
      { spaceId, body: { kind: 'ITEM', name: name.trim(), sourceId: itemId } },
      {
        onSuccess: () => {
          toast.success(t('templates.saved'));
          setOpen(false);
        },
        onError: (error) => toast.error(errorMessage(error)),
      },
    );
  };

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="mt-2"
        onClick={() => {
          setName(title);
          setOpen(true);
        }}
      >
        <BookmarkPlus />
        {t('templates.saveItem')}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <form onSubmit={submit}>
            <DialogHeader>
              <DialogTitle>{t('templates.saveItem')}</DialogTitle>
            </DialogHeader>
            <DialogBody className="flex flex-col gap-2">
              <label htmlFor="item-template-name" className="text-sm font-medium">
                {t('templates.newName')}
              </label>
              <Input
                id="item-template-name"
                value={name}
                maxLength={80}
                autoFocus
                onChange={(e) => setName(e.target.value)}
              />
              <p className="text-muted-foreground text-xs">{t('templates.saveItemHint')}</p>
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" disabled={!name.trim() || save.isPending}>
                {t('common.save')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** List sayfasında "Şablondan ekle": seçilen iş şablonundan yeni iş oluşturur. */
export function ApplyItemTemplate({ spaceId, listId }: { spaceId: string; listId: string }) {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const { data } = useTemplates(spaceId);
  const apply = useApplyTemplate();
  const items = (data?.templates ?? []).filter((template) => template.kind === 'ITEM');
  if (items.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-8">
          <FileStack />
          {t('templates.fromTemplate')}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>{t('templates.fromTemplate')}</DropdownMenuLabel>
        {items.map((template) => (
          <DropdownMenuItem
            key={template.id}
            onSelect={() =>
              apply.mutate(
                { spaceId, templateId: template.id, body: { listId } },
                {
                  onSuccess: () =>
                    toast.success(t('templates.itemCreated', { name: template.name })),
                  onError: (error) => toast.error(errorMessage(error)),
                },
              )
            }
          >
            {template.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
