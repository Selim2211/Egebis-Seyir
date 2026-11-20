import type { SpaceDetail } from '@scrum/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ImageUp, Trash2 } from 'lucide-react';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { useCurrentWorkspace } from '@/features/workspace/queries';
import { apiRequest, NoContent } from '@/lib/api';
import { squareAvatar } from '@/lib/avatar-image';
import { useErrorMessage } from '@/lib/use-error-message';
import { SpaceAvatar } from './space-avatar';

const VersionSchema = z.object({ version: z.string() });

/**
 * Proje ikonu olarak PNG/JPG yükleme (yönetici 5. tur, ADR-176). Resim tarayıcıda ortadan kare
 * kırpılıp 128 px'e küçültülür; yüklü resim hazır ikonun yerine geçer, kaldırılınca hazır ikon döner.
 */
export function SpaceIconUpload({ space }: { space: SpaceDetail }) {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const qc = useQueryClient();
  const { id: workspaceId } = useCurrentWorkspace();
  const input = useRef<HTMLInputElement>(null);
  const path = `/workspaces/${workspaceId}/spaces/${space.id}/icon`;
  const onSettled = () => qc.invalidateQueries({ queryKey: ['workspaces', workspaceId] });
  const onError = (error: unknown) => toast.error(errorMessage(error));
  const upload = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append('file', await squareAvatar(file, 128), 'icon');
      return apiRequest(path, VersionSchema, { method: 'POST', body: form });
    },
    onSuccess: () => toast.success(t('spaceIcon.saved')),
    onError,
    onSettled,
  });
  const remove = useMutation({
    mutationFn: () => apiRequest(path, NoContent, { method: 'DELETE' }),
    onSuccess: () => toast.success(t('spaceIcon.removed')),
    onError,
    onSettled,
  });

  return (
    <div className="flex flex-wrap items-center gap-3">
      <SpaceAvatar space={space} size={40} />
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg"
        hidden
        data-testid="space-icon-file"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) upload.mutate(file);
        }}
      />
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={upload.isPending}
        onClick={() => input.current?.click()}
      >
        <ImageUp />
        {space.iconImage ? t('spaceIcon.change') : t('spaceIcon.upload')}
      </Button>
      {space.iconImage && (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={remove.isPending}
          onClick={() => remove.mutate()}
        >
          <Trash2 />
          {t('spaceIcon.remove')}
        </Button>
      )}
      <p className="text-muted-foreground w-full text-xs">{t('spaceIcon.help')}</p>
    </div>
  );
}
