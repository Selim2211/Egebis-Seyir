import { DOMAIN_PATTERN, type TicketCompany, type TicketRule } from '@scrum/shared';
import { ArrowDown, ArrowUp, Building2, Pencil, Plus, Trash2 } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Field, FormError, NativeSelect, SelectField } from '@/components/form';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useHierarchy } from '@/features/spaces/queries';
import { useErrorMessage } from '@/lib/use-error-message';
import {
  useDeleteCompany,
  useDeleteRule,
  useMoveRule,
  useSaveCompany,
  useSaveRule,
  useTicketCompanies,
  useTicketRules,
} from './queries';

const parseDomains = (raw: string) => [
  ...new Set(
    raw
      .split(/[\s,;]+/)
      .map((d) => d.trim().toLowerCase().replace(/^@/, ''))
      .filter(Boolean),
  ),
];

function CompanyDialog({
  company,
  companies,
  open,
  onOpenChange,
}: {
  company: TicketCompany | null;
  companies: TicketCompany[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const save = useSaveCompany();
  const spaces = useHierarchy().data?.spaces ?? [];
  const [name, setName] = useState(company?.name ?? '');
  const [parentId, setParentId] = useState(company?.parentId ?? '');
  const [spaceId, setSpaceId] = useState(company?.defaultSpaceId ?? '');
  const [domains, setDomains] = useState((company?.domains ?? []).join('\n'));
  const [notes, setNotes] = useState(company?.notes ?? '');
  const list = parseDomains(domains);
  const badDomain = list.find((d) => !DOMAIN_PATTERN.test(d));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim() || badDomain) return;
    save.mutate(
      {
        companyId: company?.id,
        body: {
          name: name.trim(),
          parentId: parentId || null,
          defaultSpaceId: spaceId || null,
          notes: notes.trim() || null,
          domains: list,
        },
      },
      {
        onSuccess: () => {
          toast.success(t('emailSettings.company.saved'));
          onOpenChange(false);
        },
        onError: (error) => toast.error(errorMessage(error)),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" closeLabel={t('common.close')}>
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>
              {t(company ? 'emailSettings.company.editTitle' : 'emailSettings.company.addTitle')}
            </DialogTitle>
          </DialogHeader>
          <DialogBody className="gap-4">
            <Field
              label={t('emailSettings.company.name')}
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              required
            />
            <SelectField
              label={t('emailSettings.company.parent')}
              value={parentId}
              onChange={(e) => setParentId(e.target.value)}
            >
              <option value="">{t('emailSettings.company.noParent')}</option>
              {companies
                .filter((c) => c.id !== company?.id)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </SelectField>
            <p className="text-muted-foreground -mt-2 text-xs">
              {t('emailSettings.company.parentHint')}
            </p>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="company-domains">{t('emailSettings.company.domains')}</Label>
              <Textarea
                id="company-domains"
                rows={3}
                value={domains}
                onChange={(e) => setDomains(e.target.value)}
                placeholder={'firma.com\nalt-firma.com.tr'}
              />
              <p className="text-muted-foreground text-xs">
                {t('emailSettings.company.domainsHint')}
              </p>
              {badDomain && (
                <p role="alert" className="text-destructive text-xs">
                  {t('emailSettings.company.badDomain', { domain: badDomain })}
                </p>
              )}
            </div>
            <SelectField
              label={t('emailSettings.company.project')}
              value={spaceId}
              onChange={(e) => setSpaceId(e.target.value)}
            >
              <option value="">{t('emailSettings.company.noProject')}</option>
              {spaces.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </SelectField>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="company-notes">{t('emailSettings.company.notes')}</Label>
              <Textarea
                id="company-notes"
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
            <FormError error={save.error} />
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={save.isPending || !name.trim() || !!badDomain}>
              {t('common.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Firmalar: alan adları, üst firma ve varsayılan proje (ADR-140). */
export function CompaniesSection() {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const companies = useTicketCompanies().data?.companies ?? [];
  const remove = useDeleteCompany();
  const [editing, setEditing] = useState<TicketCompany | 'new' | null>(null);

  return (
    <section className="bg-card mb-5 rounded-lg border" data-testid="companies-section">
      <header className="flex items-center gap-2 border-b px-4 py-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold">{t('emailSettings.companies')}</h2>
          <p className="text-muted-foreground mt-0.5 text-xs">{t('emailSettings.companiesHint')}</p>
        </div>
        <Button size="sm" onClick={() => setEditing('new')} data-testid="add-company">
          <Plus />
          {t('emailSettings.company.add')}
        </Button>
      </header>
      {companies.length === 0 ? (
        <p className="text-muted-foreground flex items-center justify-center gap-2 px-4 py-8 text-sm">
          <Building2 className="size-4" aria-hidden />
          {t('emailSettings.company.none')}
        </p>
      ) : (
        <ul className="divide-y">
          {companies.map((c) => (
            <li
              key={c.id}
              className="flex flex-wrap items-start gap-3 px-4 py-3"
              data-testid="company-row"
            >
              <div className="min-w-0 flex-1">
                <p className="font-medium">
                  {c.name}
                  {c.parentName && (
                    <span className="text-muted-foreground ml-2 text-xs font-normal">
                      {t('emailSettings.company.childOf', { name: c.parentName })}
                    </span>
                  )}
                </p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {c.domains.map((d) => (
                    <code key={d} className="bg-muted rounded px-1.5 py-0.5 font-mono text-xs">
                      @{d}
                    </code>
                  ))}
                  {c.domains.length === 0 && (
                    <span className="text-muted-foreground text-xs">
                      {t('emailSettings.company.noDomains')}
                    </span>
                  )}
                </div>
                <p className="text-muted-foreground mt-1 text-xs">
                  {c.defaultSpaceName
                    ? t('emailSettings.company.goesTo', { project: c.defaultSpaceName })
                    : t('emailSettings.company.noProject')}
                  {c.childCount > 0 &&
                    ` · ${t('emailSettings.company.children', { count: c.childCount })}`}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                aria-label={t('emailSettings.company.edit', { name: c.name })}
                onClick={() => setEditing(c)}
              >
                <Pencil />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                aria-label={t('emailSettings.company.remove', { name: c.name })}
                onClick={() => {
                  if (!window.confirm(t('emailSettings.company.confirmRemove', { name: c.name })))
                    return;
                  remove.mutate(c.id, { onError: (error) => toast.error(errorMessage(error)) });
                }}
              >
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      )}
      {editing && (
        <CompanyDialog
          key={editing === 'new' ? 'new' : editing.id}
          company={editing === 'new' ? null : editing}
          companies={companies}
          open
          onOpenChange={(open) => !open && setEditing(null)}
        />
      )}
    </section>
  );
}

/** Yönlendirme kuralları: konu/metinde anahtar kelime geçerse Bug seçilen projeye gider (üstten alta ilk eşleşen). */
export function RulesSection() {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const rules = useTicketRules().data?.rules ?? [];
  const companies = useTicketCompanies().data?.companies ?? [];
  const spaces = useHierarchy().data?.spaces ?? [];
  const save = useSaveRule();
  const remove = useDeleteRule();
  const move = useMoveRule();
  const [companyId, setCompanyId] = useState('');
  const [keyword, setKeyword] = useState('');
  const [spaceId, setSpaceId] = useState('');
  const onError = (error: unknown) => toast.error(errorMessage(error));

  const add = (e: FormEvent) => {
    e.preventDefault();
    if (keyword.trim().length < 2 || !spaceId) return;
    save.mutate(
      { body: { companyId: companyId || null, keyword: keyword.trim(), spaceId, enabled: true } },
      {
        onSuccess: () => {
          setKeyword('');
          toast.success(t('emailSettings.rule.added'));
        },
        onError,
      },
    );
  };
  const toggle = (rule: TicketRule, enabled: boolean) =>
    save.mutate(
      {
        ruleId: rule.id,
        body: { companyId: rule.companyId, keyword: rule.keyword, spaceId: rule.spaceId, enabled },
      },
      { onError },
    );

  return (
    <section className="bg-card mb-5 rounded-lg border" data-testid="rules-section">
      <header className="border-b px-4 py-3">
        <h2 className="text-sm font-semibold">{t('emailSettings.rules')}</h2>
        <p className="text-muted-foreground mt-0.5 text-xs">{t('emailSettings.rulesHint')}</p>
      </header>
      {rules.length > 0 && (
        <ol className="divide-y">
          {rules.map((rule, index) => (
            <li
              key={rule.id}
              className="flex flex-wrap items-center gap-3 px-4 py-2.5"
              data-testid="rule-row"
            >
              <span className="text-muted-foreground w-5 text-right text-xs tabular-nums">
                {index + 1}
              </span>
              <p className="min-w-0 flex-1 text-sm">
                {t('emailSettings.rule.summary', {
                  company: rule.companyName ?? t('emailSettings.rule.anyCompany'),
                  keyword: rule.keyword,
                  project: rule.spaceName,
                })}
              </p>
              <Switch
                checked={rule.enabled}
                onCheckedChange={(enabled) => toggle(rule, enabled)}
                aria-label={t('emailSettings.rule.enabled', { keyword: rule.keyword })}
              />
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                disabled={index === 0}
                aria-label={t('emailSettings.rule.up', { keyword: rule.keyword })}
                onClick={() => move.mutate({ ruleId: rule.id, direction: 'up' }, { onError })}
              >
                <ArrowUp />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                disabled={index === rules.length - 1}
                aria-label={t('emailSettings.rule.down', { keyword: rule.keyword })}
                onClick={() => move.mutate({ ruleId: rule.id, direction: 'down' }, { onError })}
              >
                <ArrowDown />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                aria-label={t('emailSettings.rule.remove', { keyword: rule.keyword })}
                onClick={() => remove.mutate(rule.id, { onError })}
              >
                <Trash2 />
              </Button>
            </li>
          ))}
        </ol>
      )}
      <form onSubmit={add} className="flex flex-wrap items-end gap-2 border-t p-4">
        <div className="flex flex-col gap-1.5">
          <Label>{t('emailSettings.rule.company')}</Label>
          <NativeSelect
            value={companyId}
            onChange={(e) => setCompanyId(e.target.value)}
            aria-label={t('emailSettings.rule.company')}
            className="min-w-44"
          >
            <option value="">{t('emailSettings.rule.anyCompany')}</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </NativeSelect>
        </div>
        <Field
          label={t('emailSettings.rule.keyword')}
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder={t('emailSettings.rule.keywordPlaceholder')}
          className="min-w-44 flex-1"
        />
        <div className="flex flex-col gap-1.5">
          <Label>{t('emailSettings.rule.project')}</Label>
          <NativeSelect
            value={spaceId}
            onChange={(e) => setSpaceId(e.target.value)}
            aria-label={t('emailSettings.rule.project')}
            className="min-w-44"
          >
            <option value="">{t('emailSettings.rule.chooseProject')}</option>
            {spaces.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </NativeSelect>
        </div>
        <Button
          type="submit"
          disabled={save.isPending || keyword.trim().length < 2 || !spaceId}
          data-testid="add-rule"
        >
          <Plus />
          {t('emailSettings.rule.add')}
        </Button>
      </form>
    </section>
  );
}
