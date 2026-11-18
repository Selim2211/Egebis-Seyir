import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { Download, MessageSquarePlus, Paperclip, Send, Trash2, X } from 'lucide-react';
import { MESSAGE_MAX_ATTACHMENT_BYTES, MESSAGE_MAX_ATTACHMENTS } from '@scrum/shared';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { NativeSelect } from '@/components/form';
import { PageHeading } from '@/components/layout/page-heading';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { UserAvatar } from '@/components/user-avatar';
import { useMe } from '@/features/auth/queries';
import { useCurrentWorkspace, useMembers } from '@/features/workspace/queries';
import { relativeTime } from '@/lib/format';
import { useErrorMessage } from '@/lib/use-error-message';
import { cn } from '@/lib/utils';
import {
  threadQuery,
  useConversations,
  useDeleteMessage,
  useMarkRead,
  messageAttachmentUrl,
  useOpenConversation,
  useSendMessage,
} from './queries';

const formatBytes = (bytes: number): string =>
  bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

/** Birebir mesajlar (Faz 7.8, ADR-098): sol konuşma listesi, sağ yazışma. `?c=` açık konuşma. */
export function MessagesPage({ conversationId }: { conversationId: string | null }) {
  const { t } = useTranslation();
  const { data } = useConversations();
  const conversations = data?.conversations ?? [];

  return (
    <div className="mx-auto flex h-full max-w-5xl flex-col px-4 py-6 sm:px-6">
      <PageHeading title={t('messages.title')} subtitle={t('messages.subtitle')} />
      <div className="grid min-h-0 flex-1 gap-4 md:grid-cols-[18rem_minmax(0,1fr)]">
        <aside className="flex min-h-0 flex-col gap-2" aria-label={t('messages.conversations')}>
          <NewConversation />
          {conversations.length === 0 ? (
            <p className="text-muted-foreground px-1 py-4 text-sm">{t('messages.empty')}</p>
          ) : (
            <ul className="flex flex-col gap-0.5 overflow-y-auto">
              {conversations.map((c) => (
                <li key={c.id}>
                  <Link
                    to="/messages"
                    search={{ c: c.id }}
                    className={cn(
                      'hover:bg-accent flex items-center gap-2.5 rounded-md px-2 py-2 text-sm outline-none focus-visible:ring-[3px]',
                      conversationId === c.id && 'bg-accent',
                    )}
                  >
                    <UserAvatar {...c.with} size={32} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className={cn('truncate', c.unreadCount > 0 && 'font-semibold')}>
                          {c.with.name}
                        </span>
                        {c.lastMessage && (
                          <span className="text-muted-foreground ml-auto shrink-0 text-xs">
                            {relativeTime(c.lastMessage.at)}
                          </span>
                        )}
                      </span>
                      <span className="text-muted-foreground block truncate text-xs">
                        {c.lastMessage &&
                          `${c.lastMessage.mine ? t('messages.you') : ''}${c.lastMessage.body}`}
                      </span>
                    </span>
                    {c.unreadCount > 0 && (
                      <span
                        className="bg-primary text-primary-foreground min-w-5 rounded-full px-1.5 text-center text-xs"
                        aria-label={t('messages.unread', { count: c.unreadCount })}
                      >
                        {c.unreadCount}
                      </span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </aside>
        <section className="bg-card flex min-h-[24rem] min-w-0 flex-col rounded-lg border">
          {conversationId ? (
            <Thread key={conversationId} conversationId={conversationId} />
          ) : (
            <p className="text-muted-foreground m-auto px-4 text-sm">{t('messages.pick')}</p>
          )}
        </section>
      </div>
    </div>
  );
}

function NewConversation() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useMe();
  const members = (useMembers().data?.members ?? []).filter(
    (m) => m.userId !== user.id && m.role !== 'GUEST' && m.role !== 'VIEWER',
  );
  const open = useOpenConversation();
  const errorMessage = useErrorMessage();
  const [picking, setPicking] = useState(false);

  if (!picking) {
    return (
      <Button variant="secondary" onClick={() => setPicking(true)}>
        <MessageSquarePlus />
        {t('messages.new')}
      </Button>
    );
  }
  return (
    <NativeSelect
      aria-label={t('messages.pickPerson')}
      value=""
      autoFocus
      onChange={(e) => {
        if (!e.target.value) return;
        open.mutate(e.target.value, {
          onSuccess: (created) => {
            setPicking(false);
            void navigate({ to: '/messages', search: { c: created.id } });
          },
          onError: (error) => toast.error(errorMessage(error)),
        });
      }}
      onBlur={() => setPicking(false)}
    >
      <option value="">{t('messages.pickPerson')}</option>
      {members.map((m) => (
        <option key={m.userId} value={m.userId}>
          {m.name}
        </option>
      ))}
    </NativeSelect>
  );
}

function Thread({ conversationId }: { conversationId: string }) {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const { id: workspaceId } = useCurrentWorkspace();
  const { data } = useQuery(threadQuery(workspaceId, conversationId));
  const send = useSendMessage();
  const markRead = useMarkRead();
  const remove = useDeleteMessage();
  const [body, setBody] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const picker = useRef<HTMLInputElement>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const lastId = data?.messages.at(-1)?.id;
  const lastMine = data?.messages.at(-1)?.mine ?? true;

  // Yeni mesaj gelince en alta kaydır; karşıdan gelen mesaj görününce okundu işaretle.
  useEffect(() => {
    bottom.current?.scrollIntoView?.({ block: 'end' });
    if (lastId && !lastMine) markRead.mutate(conversationId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastId]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const text = body.trim();
    if (!text && files.length === 0) return;
    send.mutate(
      { conversationId, body: text, files },
      {
        onSuccess: () => {
          setBody('');
          setFiles([]);
        },
        onError: (error) => toast.error(errorMessage(error)),
      },
    );
  };

  /** Seçilen dosyalar mevcut listeye eklenir; 5 dosya ve 16 MB sınırı burada da denetlenir. */
  const addFiles = (picked: FileList | null) => {
    if (!picked) return;
    const next = [...files, ...picked];
    if (next.length > MESSAGE_MAX_ATTACHMENTS) {
      toast.error(t('messages.attachmentsTooMany'));
      return;
    }
    if (next.reduce((sum, f) => sum + f.size, 0) > MESSAGE_MAX_ATTACHMENT_BYTES) {
      toast.error(t('messages.attachmentsTooBig'));
      return;
    }
    setFiles(next);
  };

  return (
    <>
      <header className="flex items-center gap-2.5 border-b px-4 py-3">
        {data && <UserAvatar {...data.with} size={28} />}
        <h2 className="font-semibold">{data?.with.name ?? '…'}</h2>
      </header>
      <ul
        className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-4 py-3"
        aria-label={t('messages.thread')}
        aria-live="polite"
      >
        {data?.hasMore && (
          <li className="text-muted-foreground text-center text-xs">{t('messages.hasMore')}</li>
        )}
        {data?.messages.map((m) => (
          <li key={m.id} className={cn('group flex', m.mine ? 'justify-end' : 'justify-start')}>
            <div
              className={cn(
                'max-w-[80%] rounded-lg px-3 py-1.5 text-sm break-words whitespace-pre-wrap',
                m.mine ? 'bg-primary text-primary-foreground' : 'bg-muted',
                m.deleted && 'italic opacity-60',
              )}
            >
              {m.deleted ? t('messages.deleted') : m.body}
              {!m.deleted && m.attachments.length > 0 && (
                <span className="mt-1 flex flex-col gap-1" data-testid="message-attachments">
                  {m.attachments.map((a) => (
                    <a
                      key={a.id}
                      href={messageAttachmentUrl(workspaceId, conversationId, m.id, a.id)}
                      download={a.fileName}
                      aria-label={t('messages.download', { name: a.fileName })}
                      className="bg-background/20 flex items-center gap-1.5 rounded px-2 py-1 text-xs underline-offset-2 hover:underline"
                    >
                      <Download className="size-3.5 shrink-0" aria-hidden />
                      <span className="truncate">{a.fileName}</span>
                      <span className="shrink-0 opacity-70">{formatBytes(a.size)}</span>
                    </a>
                  ))}
                </span>
              )}
              <span className="mt-0.5 block text-[10px] opacity-70">{relativeTime(m.at)}</span>
            </div>
            {m.mine && !m.deleted && (
              <Button
                variant="ghost"
                size="icon"
                className="ml-1 size-6 self-center opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                aria-label={t('messages.delete')}
                onClick={() =>
                  remove.mutate(
                    { conversationId, messageId: m.id },
                    { onError: (error) => toast.error(errorMessage(error)) },
                  )
                }
              >
                <Trash2 />
              </Button>
            )}
          </li>
        ))}
        <div ref={bottom} />
      </ul>
      <form onSubmit={submit} className="flex flex-col gap-2 border-t p-3">
        {files.length > 0 && (
          <ul className="flex flex-wrap gap-1.5" aria-label={t('messages.attach')}>
            {files.map((f, i) => (
              <li
                key={`${f.name}-${i}`}
                className="bg-muted flex items-center gap-1 rounded-md px-2 py-1 text-xs"
              >
                <Paperclip className="size-3" aria-hidden />
                <span className="max-w-40 truncate">{f.name}</span>
                <span className="text-muted-foreground">{formatBytes(f.size)}</span>
                <button
                  type="button"
                  aria-label={t('messages.removeFile', { name: f.name })}
                  className="hover:text-destructive"
                  onClick={() => setFiles(files.filter((_, j) => j !== i))}
                >
                  <X className="size-3" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex items-end gap-2">
          <input
            ref={picker}
            type="file"
            multiple
            hidden
            data-testid="message-file-input"
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = '';
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            title={`${t('messages.attach')} · ${t('messages.attachHint')}`}
            aria-label={t('messages.attach')}
            onClick={() => picker.current?.click()}
          >
            <Paperclip />
          </Button>
          <Textarea
            value={body}
            rows={2}
            maxLength={4000}
            aria-label={t('messages.write')}
            placeholder={t('messages.placeholder')}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submit(e);
              }
            }}
          />
          <Button
            type="submit"
            disabled={send.isPending || (body.trim() === '' && files.length === 0)}
          >
            <Send />
            {t('messages.send')}
          </Button>
        </div>
      </form>
    </>
  );
}
