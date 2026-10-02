import type { Session } from '@scrum/shared';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { Monitor, Smartphone } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { FormError } from '@/components/form';
import { PageHeading } from '@/components/layout/page-heading';
import { Button } from '@/components/ui/button';
import { sessionsQuery, useRevokeSession } from '@/features/auth/queries';
import { relativeTime } from '@/lib/format';
import { useErrorMessage } from '@/lib/use-error-message';

export const Route = createFileRoute('/_app/settings/sessions')({
  component: SessionsPage,
});

/** Kaba cihaz özeti: "Chrome · Windows". Ayrıntılı ayrıştırma gerekmiyor. */
function describeDevice(userAgent: string | null): { label: string | null; mobile: boolean } {
  if (!userAgent) return { label: null, mobile: false };
  const browser = /Edg\//.test(userAgent)
    ? 'Edge'
    : /Firefox\//.test(userAgent)
      ? 'Firefox'
      : /Chrome\//.test(userAgent)
        ? 'Chrome'
        : /Safari\//.test(userAgent)
          ? 'Safari'
          : null;
  const os = /Windows/.test(userAgent)
    ? 'Windows'
    : /Android/.test(userAgent)
      ? 'Android'
      : /iPhone|iPad/.test(userAgent)
        ? 'iOS'
        : /Mac OS X/.test(userAgent)
          ? 'macOS'
          : /Linux/.test(userAgent)
            ? 'Linux'
            : null;
  const label = [browser, os].filter(Boolean).join(' · ') || null;
  return { label, mobile: /Mobile|Android|iPhone/.test(userAgent) };
}

function SessionsPage() {
  const { t } = useTranslation();
  const { data, error } = useQuery(sessionsQuery);

  return (
    <>
      <PageHeading title={t('sessions.title')} subtitle={t('sessions.subtitle')} />
      <FormError error={error} />
      <ul className="bg-card max-w-2xl divide-y rounded-lg border">
        {data?.sessions.map((s) => (
          <SessionRow key={s.id} session={s} />
        ))}
      </ul>
    </>
  );
}

function SessionRow({ session }: { session: Session }) {
  const { t } = useTranslation();
  const revoke = useRevokeSession();
  const errorMessage = useErrorMessage();
  const device = describeDevice(session.userAgent);
  const Icon = device.mobile ? Smartphone : Monitor;

  return (
    <li className="flex items-center gap-3 px-4 py-3 text-sm">
      <Icon className="text-muted-foreground size-5 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 font-medium">
          {device.label ?? t('sessions.unknownDevice')}
          {session.current && (
            <span className="bg-status-done/10 text-status-done rounded px-1.5 text-[11px] font-semibold">
              {t('sessions.current')}
            </span>
          )}
        </p>
        <p className="text-muted-foreground text-xs">
          {t('sessions.lastSeen', { time: relativeTime(session.lastSeenAt) })} ·{' '}
          {t('sessions.started', { time: relativeTime(session.createdAt) })}
          {session.ip ? ` · ${session.ip}` : ''}
        </p>
      </div>
      {!session.current && (
        <Button
          variant="outline"
          size="sm"
          disabled={revoke.isPending}
          onClick={() =>
            revoke.mutate(session.id, {
              onSuccess: () => toast.success(t('sessions.revoked')),
              onError: (e) => toast.error(errorMessage(e)),
            })
          }
        >
          {t('sessions.revoke')}
        </Button>
      )}
    </li>
  );
}
