import {
  SPACE_PERMISSIONS as S,
  SPACE_ROLES,
  type SpaceDetail,
  type SpaceRole,
} from '@scrum/shared';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { Archive, ArrowLeft, Plus, Trash2, UserMinus } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { FormError, NativeSelect } from '@/components/form';
import { Button } from '@/components/ui/button';
import { UserAvatar } from '@/components/user-avatar';
import { useStructureActions } from '@/features/spaces/actions-context';
import { LoadingState, NotFoundState } from '@/features/spaces/container-header';
import {
  spaceQuery,
  usePutSpaceMember,
  useRemoveSpaceMember,
  useSpaceMembers,
  useUpdateSpace,
} from '@/features/spaces/queries';
import { SpaceAvatar } from '@/features/spaces/space-avatar';
import { ReadinessFields } from '@/features/spaces/readiness-fields';
import { AutomationsSection } from '@/features/automations/automations-section';
import { FormsSection } from '@/features/forms/forms-section';
import { WebhooksSection } from '@/features/webhooks/webhooks-section';
import { CustomFieldsSection } from '@/features/custom-fields/custom-fields-editor';
import { StatusesSection } from '@/features/spaces/statuses-editor';
import { TemplatesSection } from '@/features/templates/templates-section';
import { SpaceFields } from '@/features/spaces/space-form';
import {
  type SpaceFormErrors,
  type SpaceFormValues,
  toSpaceBody,
  validateSpace,
} from '@/features/spaces/space-form-model';
import { useCurrentWorkspace, useMembers } from '@/features/workspace/queries';
import { useErrorMessage } from '@/lib/use-error-message';

export const Route = createFileRoute('/_app/spaces/$spaceId/settings')({
  component: SpaceSettingsPage,
});

/** Space ayarları (brief §10 madde 17): genel, üyeler ve Scrum rolleri, durumlar. */
function SpaceSettingsPage() {
  const { t } = useTranslation();
  const { spaceId } = Route.useParams();
  const { id: workspaceId } = useCurrentWorkspace();
  const { data: space, isPending, isError } = useQuery(spaceQuery(workspaceId, spaceId));

  if (isPending) return <LoadingState />;
  if (isError) return <NotFoundState />;
  const canEdit = space.permissions.includes(S.SPACE_SETTINGS);

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
      <Link
        to="/spaces/$spaceId"
        params={{ spaceId }}
        className="text-muted-foreground hover:text-foreground mb-3 inline-flex items-center gap-1.5 text-sm"
      >
        <ArrowLeft className="size-4" aria-hidden />
        {space.name}
      </Link>
      <div className="mb-6 flex items-center gap-3">
        <SpaceAvatar space={space} size={36} />
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight">{t('spaceSettings.title')}</h1>
          {!canEdit && (
            <p className="text-muted-foreground text-sm">{t('spaceSettings.readOnly')}</p>
          )}
        </div>
      </div>

      {canEdit ? <GeneralForm space={space} /> : <GeneralSummary space={space} />}
      <MembersSection spaceId={spaceId} canEdit={canEdit} />
      <StatusesSection space={space} canEdit={canEdit} />
      <CustomFieldsSection spaceId={spaceId} canEdit={canEdit} />
      <TemplatesSection space={space} canEdit={canEdit} />
      {canEdit && <AutomationsSection space={space} />}
      {canEdit && <FormsSection spaceId={spaceId} />}
      {canEdit && <WebhooksSection spaceId={spaceId} />}
      {canEdit && <DangerZone space={space} />}
    </div>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-card mb-5 rounded-lg border">
      <div className="border-b px-4 py-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        {description && <p className="text-muted-foreground mt-0.5 text-xs">{description}</p>}
      </div>
      <div className="flex flex-col gap-4 p-4">{children}</div>
    </section>
  );
}

function GeneralForm({ space }: { space: SpaceDetail }) {
  const { t } = useTranslation();
  const update = useUpdateSpace();
  const initial: SpaceFormValues = {
    name: space.name,
    key: space.key,
    color: space.color,
    icon: space.icon,
    description: space.description ?? '',
    isPrivate: space.isPrivate,
    scrumEnabled: space.scrumEnabled,
    sprintLengthWeeks: space.sprintLengthWeeks,
    sprintGoalRequired: space.sprintGoalRequired,
    dodItems: space.dodItems,
    dorItems: space.dorItems,
    dodEnforced: space.dodEnforced,
    estimationScale: space.estimationScale,
  };
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<SpaceFormErrors>({});
  const dirty = JSON.stringify(values) !== JSON.stringify(initial);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const found = validateSpace(values);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    update.mutate(
      { spaceId: space.id, body: toSpaceBody(values) },
      { onSuccess: () => toast.success(t('spaceSettings.saved')) },
    );
  };

  return (
    <form onSubmit={submit} noValidate>
      <Section title={t('spaceSettings.general')}>
        <SpaceFields
          values={values}
          errors={errors}
          onChange={(patch) => setValues((v) => ({ ...v, ...patch }))}
        />
        {values.scrumEnabled && (
          <ReadinessFields
            values={values}
            onChange={(patch) => setValues((v) => ({ ...v, ...patch }))}
          />
        )}
        {values.key !== space.key && !errors.key && (
          <p className="text-muted-foreground text-xs">{t('spaceSettings.keyChangeNote')}</p>
        )}
        {update.error && <FormError error={update.error} />}
        <div className="flex justify-end">
          <Button type="submit" disabled={!dirty || update.isPending}>
            {update.isPending ? t('common.saving') : t('common.save')}
          </Button>
        </div>
      </Section>
    </form>
  );
}

function GeneralSummary({ space }: { space: SpaceDetail }) {
  const { t } = useTranslation();
  const rows: Array<[string, string]> = [
    [t('spaceForm.name'), space.name],
    [t('spaceForm.key'), space.key],
    [t('spaceForm.visibility'), t(space.isPrivate ? 'spaceForm.private' : 'spaceForm.public')],
    [t('spaceForm.mode'), t(space.scrumEnabled ? 'spaceForm.modeScrum' : 'spaceForm.modeSimple')],
  ];
  if (space.scrumEnabled) {
    rows.push(
      [t('spaceForm.sprintLength'), t('spaceForm.weeks', { count: space.sprintLengthWeeks })],
      [t('spaceForm.estimationScale'), t(`estimationScale.${space.estimationScale}`)],
    );
  }
  return (
    <Section title={t('spaceSettings.general')}>
      <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[10rem_1fr]">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-muted-foreground">{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </Section>
  );
}

function MembersSection({ spaceId, canEdit }: { spaceId: string; canEdit: boolean }) {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const { data } = useSpaceMembers(spaceId);
  const workspaceMembers = useMembers(canEdit).data?.members ?? [];
  const put = usePutSpaceMember();
  const remove = useRemoveSpaceMember();
  const [adding, setAdding] = useState('');
  const members = data?.members ?? [];
  const candidates = workspaceMembers.filter((m) => !members.some((x) => x.userId === m.userId));
  const onError = (error: unknown) => toast.error(errorMessage(error));

  const add = () => {
    const person = workspaceMembers.find((m) => m.userId === adding);
    if (!person) return;
    put.mutate(
      {
        spaceId,
        userId: person.userId,
        role: person.role === 'GUEST' ? 'STAKEHOLDER' : 'DEVELOPER',
      },
      { onSuccess: () => setAdding(''), onError },
    );
  };

  return (
    <Section title={t('spaceForm.members')} description={t('spaceSettings.membersHelp')}>
      <ul className="divide-y">
        {members.map((m) => (
          <li key={m.userId} className="flex items-center gap-2.5 py-2">
            <UserAvatar id={m.userId} name={m.name} size={28} avatarVersion={m.avatarVersion} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{m.name}</span>
              <span className="text-muted-foreground block text-xs">
                {t(`roles.${m.workspaceRole}`)}
              </span>
            </span>
            {canEdit ? (
              <>
                <NativeSelect
                  aria-label={t('spaceForm.roleFor', { name: m.name })}
                  value={m.role}
                  className="h-8"
                  onChange={(e) =>
                    put.mutate(
                      { spaceId, userId: m.userId, role: e.target.value as SpaceRole },
                      { onError },
                    )
                  }
                >
                  {SPACE_ROLES.filter(
                    (r) => m.workspaceRole !== 'GUEST' || r === 'STAKEHOLDER',
                  ).map((r) => (
                    <option key={r} value={r}>
                      {t(`spaceRoles.${r}`)}
                    </option>
                  ))}
                </NativeSelect>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  aria-label={t('spaceForm.removeMember', { name: m.name })}
                  onClick={() => remove.mutate({ spaceId, userId: m.userId }, { onError })}
                >
                  <UserMinus />
                </Button>
              </>
            ) : (
              <span className="text-muted-foreground text-sm">{t(`spaceRoles.${m.role}`)}</span>
            )}
          </li>
        ))}
        {members.length === 0 && (
          <li className="text-muted-foreground py-2 text-sm">{t('spaceSettings.noMembers')}</li>
        )}
      </ul>
      {canEdit && candidates.length > 0 && (
        <div className="flex gap-2">
          <NativeSelect
            aria-label={t('spaceForm.addMember')}
            value={adding}
            className="h-8 min-w-0 flex-1"
            onChange={(e) => setAdding(e.target.value)}
          >
            <option value="">{t('spaceForm.chooseMember')}</option>
            {candidates.map((c) => (
              <option key={c.userId} value={c.userId}>
                {c.name} · {t(`roles.${c.role}`)}
              </option>
            ))}
          </NativeSelect>
          <Button size="sm" variant="secondary" disabled={!adding || put.isPending} onClick={add}>
            <Plus />
            {t('spaceForm.addMember')}
          </Button>
        </div>
      )}
    </Section>
  );
}

function DangerZone({ space }: { space: SpaceDetail }) {
  const { t } = useTranslation();
  const actions = useStructureActions();
  return (
    <Section title={t('spaceSettings.danger')}>
      <div className="flex flex-wrap gap-2">
        {space.archived ? (
          <Button variant="outline" onClick={() => actions.unarchive('SPACE', space.id)}>
            <Archive />
            {t('structure.unarchive')}
          </Button>
        ) : (
          <Button variant="outline" onClick={() => actions.archive('SPACE', space.id, space.name)}>
            <Archive />
            {t('spaceSettings.archiveSpace')}
          </Button>
        )}
        <Button
          variant="destructive"
          onClick={() =>
            actions.open({ kind: 'delete', type: 'SPACE', id: space.id, name: space.name })
          }
        >
          <Trash2 />
          {t('spaceSettings.deleteSpace')}
        </Button>
      </div>
    </Section>
  );
}
