import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { type FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Field, FormError } from '@/components/form';
import { RestoreSpaceSection } from '@/features/backup/backup';
import { AppUrlSection } from '@/features/mail/app-url';
import { MailTestSection } from '@/features/mail/mail-test';
import { PageHeading } from '@/components/layout/page-heading';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { LoadingState } from '@/features/spaces/container-header';
import { useUpdateWorkspaceSettings, workspaceSettingsQuery } from '@/features/spaces/queries';
import { useCurrentWorkspace } from '@/features/workspace/queries';
import { AI_ESTIMATE_MIN_SENTENCES, type WorkspaceSettings } from '@scrum/shared';

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
      <div className="mt-5">
        <AppUrlSection />
      </div>
      <div className="mt-5">
        <MailTestSection />
      </div>
      <div className="mt-5">
        <RestoreSpaceSection />
      </div>
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
  const [aiEnabled, setAiEnabled] = useState(initial.aiEstimateEnabled);
  const [aiMin, setAiMin] = useState(String(initial.aiEstimateMinSentences));
  const aiMinValue = Number(aiMin);
  const aiMinInvalid =
    !Number.isInteger(aiMinValue) ||
    aiMinValue < AI_ESTIMATE_MIN_SENTENCES.min ||
    aiMinValue > AI_ESTIMATE_MIN_SENTENCES.max;
  const invalid = name.trim().length === 0 || aiMinInvalid;
  const dirty =
    name.trim() !== initial.name ||
    membersCanCreateSpaces !== initial.membersCanCreateSpaces ||
    aiEnabled !== initial.aiEstimateEnabled ||
    aiMinValue !== initial.aiEstimateMinSentences;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (invalid) return;
    update.mutate(
      {
        name: name.trim(),
        membersCanCreateSpaces,
        aiEstimateEnabled: aiEnabled,
        aiEstimateMinSentences: aiMinValue,
      },
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
      <fieldset className="flex flex-col gap-3 border-t pt-4">
        <legend className="mb-2 text-sm font-semibold">{t('generalSettings.aiEstimate')}</legend>
        <div className="flex items-start gap-3">
          <Switch
            id="ai-estimate"
            checked={aiEnabled}
            onCheckedChange={setAiEnabled}
            aria-describedby="ai-estimate-help"
            className="mt-0.5"
          />
          <div>
            <Label htmlFor="ai-estimate">{t('generalSettings.aiEstimateEnabled')}</Label>
            <p id="ai-estimate-help" className="text-muted-foreground mt-0.5 text-xs">
              {t('generalSettings.aiEstimateHelp')}
            </p>
          </div>
        </div>
        <div className="flex max-w-md flex-col gap-1">
          <Label htmlFor="ai-estimate-min">{t('generalSettings.aiEstimateMin')}</Label>
          <Input
            id="ai-estimate-min"
            type="number"
            inputMode="numeric"
            min={AI_ESTIMATE_MIN_SENTENCES.min}
            max={AI_ESTIMATE_MIN_SENTENCES.max}
            className="w-28"
            disabled={!aiEnabled}
            value={aiMin}
            aria-invalid={aiMinInvalid || undefined}
            onChange={(e) => setAiMin(e.target.value)}
          />
          <p className="text-muted-foreground text-xs">
            {t('generalSettings.aiEstimateMinHelp', {
              min: AI_ESTIMATE_MIN_SENTENCES.min,
              max: AI_ESTIMATE_MIN_SENTENCES.max,
            })}
          </p>
        </div>
      </fieldset>
      {update.error && <FormError error={update.error} />}
      <div>
        <Button type="submit" disabled={!dirty || invalid || update.isPending}>
          {update.isPending ? t('common.saving') : t('common.save')}
        </Button>
      </div>
    </form>
  );
}
