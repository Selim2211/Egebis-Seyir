import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { type FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Field, FormError } from '@/components/form';
import { PageHeading } from '@/components/layout/page-heading';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { LoadingState } from '@/features/spaces/container-header';
import { useUpdateWorkspaceSettings, workspaceSettingsQuery } from '@/features/spaces/queries';
import { useCurrentWorkspace } from '@/features/workspace/queries';
import type { WorkspaceSettings } from '@scrum/shared';

export const Route = createFileRoute('/_app/settings/general')({
  component: GeneralSettingsPage,
});

/** Workspace genel ayarları (brief §5.20, ADR-042). */
function GeneralSettingsPage() {
  const { t } = useTranslation();
  const { id } = useCurrentWorkspace();
  const { data } = useQuery(workspaceSettingsQuery(id));
  return (
    <>
      <PageHeading title={t('generalSettings.title')} subtitle={t('generalSettings.subtitle')} />
      {data ? <SettingsForm initial={data} /> : <LoadingState />}
    </>
  );
}

function SettingsForm({ initial }: { initial: WorkspaceSettings }) {
  const { t } = useTranslation();
  const update = useUpdateWorkspaceSettings();
  const [name, setName] = useState(initial.name);
  const [membersCanCreateSpaces, setMembersCanCreateSpaces] = useState(
    initial.membersCanCreateSpaces,
  );
  const invalid = name.trim().length === 0;
  const dirty =
    name.trim() !== initial.name || membersCanCreateSpaces !== initial.membersCanCreateSpaces;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (invalid) return;
    update.mutate(
      { name: name.trim(), membersCanCreateSpaces },
      { onSuccess: () => toast.success(t('generalSettings.saved')) },
    );
  };

  return (
    <form
      onSubmit={submit}
      noValidate
      className="bg-card flex flex-col gap-5 rounded-lg border p-4"
    >
      <Field
        label={t('generalSettings.name')}
        value={name}
        maxLength={80}
        error={invalid ? { type: 'too_small' } : undefined}
        onChange={(e) => setName(e.target.value)}
        className="max-w-md"
      />
      <div className="flex items-start gap-3">
        <Switch
          id="members-create-spaces"
          checked={membersCanCreateSpaces}
          onCheckedChange={setMembersCanCreateSpaces}
          aria-describedby="members-create-spaces-help"
          className="mt-0.5"
        />
        <div>
          <Label htmlFor="members-create-spaces">
            {t('generalSettings.membersCanCreateSpaces')}
          </Label>
          <p id="members-create-spaces-help" className="text-muted-foreground mt-0.5 text-xs">
            {t('generalSettings.membersCanCreateSpacesHelp')}
          </p>
        </div>
      </div>
      {update.error && <FormError error={update.error} />}
      <div>
        <Button type="submit" disabled={!dirty || invalid || update.isPending}>
          {update.isPending ? t('common.saving') : t('common.save')}
        </Button>
      </div>
    </form>
  );
}
