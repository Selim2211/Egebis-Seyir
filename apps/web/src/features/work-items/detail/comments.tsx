import { REACTION_EMOJIS, type Comment, type ReactionEmoji } from '@scrum/shared';
import { useQuery } from '@tanstack/react-query';
import { MoreHorizontal, Pencil, SmilePlus, Trash2 } from 'lucide-react';
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
import { UserAvatar } from '@/components/user-avatar';
import { useCurrentWorkspace } from '@/features/workspace/queries';
import { relativeTime } from '@/lib/format';
import { useErrorMessage } from '@/lib/use-error-message';
import { cn } from '@/lib/utils';
import { commentsQuery, useComment } from '../queries';
import { CommentEditor } from './comment-editor';
import { RichTextView } from './rich-text-view';

/** Yorumlar (brief §5.13, ADR-055): yaz, düzenle, sil, tepki ver, @mention. */
export function Comments({ itemId, canComment }: { itemId: string; canComment: boolean }) {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const { id: workspaceId } = useCurrentWorkspace();
  const { data } = useQuery(commentsQuery(workspaceId, itemId));
  const mutation = useComment();
  const [editing, setEditing] = useState<string | null>(null);
  const comments = data?.comments ?? [];

  const onError = (error: unknown) => toast.error(errorMessage(error));

  return (
    <section aria-labelledby="comments-title">
      <h3 id="comments-title" className="mb-2 text-sm font-semibold">
        {t('comments.title')}{' '}
        <span className="text-muted-foreground font-normal">{comments.length}</span>
      </h3>

      {comments.length === 0 && (
        <p className="text-muted-foreground mb-3 text-sm">{t('comments.empty')}</p>
      )}
      <ul className="mb-3 flex flex-col gap-4">
        {comments.map((comment) => (
          <li key={comment.id} className="flex gap-2.5">
            <UserAvatar
              id={comment.author.id}
              name={comment.author.name}
              size={28}
              avatarVersion={comment.author.avatarVersion}
              className="mt-0.5"
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-sm">
                <span className="font-medium">{comment.author.name}</span>
                <time
                  className="text-muted-foreground text-xs"
                  dateTime={comment.createdAt}
                  title={new Date(comment.createdAt).toLocaleString()}
                >
                  {relativeTime(comment.createdAt)}
                </time>
                {comment.editedAt && (
                  <span className="text-muted-foreground text-xs">({t('comments.edited')})</span>
                )}
                {(comment.canEdit || comment.canDelete) && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="ml-auto size-7"
                        aria-label={t('comments.actions', { name: comment.author.name })}
                      >
                        <MoreHorizontal />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {comment.canEdit && (
                        <DropdownMenuItem onSelect={() => setEditing(comment.id)}>
                          <Pencil />
                          {t('comments.edit')}
                        </DropdownMenuItem>
                      )}
                      {comment.canDelete && (
                        <DropdownMenuItem
                          variant="destructive"
                          onSelect={() =>
                            mutation.mutate(
                              { itemId, op: 'delete', commentId: comment.id },
                              { onError },
                            )
                          }
                        >
                          <Trash2 />
                          {t('comments.delete')}
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>

              {editing === comment.id ? (
                <div className="mt-1">
                  <CommentEditor
                    itemId={itemId}
                    initial={comment.body}
                    autoFocus
                    submitLabel={t('common.save')}
                    placeholder={t('comments.placeholder')}
                    pending={mutation.isPending}
                    onCancel={() => setEditing(null)}
                    onSubmit={(body) =>
                      mutation.mutate(
                        { itemId, op: 'edit', commentId: comment.id, body },
                        { onSuccess: () => setEditing(null), onError },
                      )
                    }
                  />
                </div>
              ) : (
                <RichTextView doc={comment.body} />
              )}

              <Reactions
                comment={comment}
                canReact={canComment}
                onReact={(emoji) =>
                  mutation.mutate(
                    { itemId, op: 'react', commentId: comment.id, emoji },
                    { onError },
                  )
                }
              />
            </div>
          </li>
        ))}
      </ul>

      {canComment ? (
        <CommentEditor
          itemId={itemId}
          submitLabel={t('comments.submit')}
          placeholder={t('comments.placeholder')}
          pending={mutation.isPending}
          onSubmit={(body) => mutation.mutate({ itemId, op: 'create', body }, { onError })}
        />
      ) : (
        <p className="text-muted-foreground text-sm">{t('comments.readOnly')}</p>
      )}
    </section>
  );
}

function Reactions({
  comment,
  canReact,
  onReact,
}: {
  comment: Comment;
  canReact: boolean;
  onReact: (emoji: ReactionEmoji) => void;
}) {
  const { t } = useTranslation();
  if (comment.reactions.length === 0 && !canReact) return null;
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1">
      {comment.reactions.map((reaction) => (
        <button
          key={reaction.emoji}
          type="button"
          disabled={!canReact}
          aria-pressed={reaction.mine}
          title={reaction.names.join(', ')}
          aria-label={t('comments.reaction', { emoji: reaction.emoji, count: reaction.count })}
          onClick={() => onReact(reaction.emoji)}
          className={cn(
            'hover:bg-accent flex h-6 items-center gap-1 rounded-full border px-2 text-xs',
            reaction.mine && 'border-primary bg-primary/10',
          )}
        >
          <span aria-hidden>{reaction.emoji}</span>
          {reaction.count}
        </button>
      ))}
      {canReact && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-6"
              aria-label={t('comments.addReaction')}
            >
              <SmilePlus />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="flex min-w-0 gap-0.5 p-1">
            {REACTION_EMOJIS.map((emoji) => (
              <DropdownMenuItem
                key={emoji}
                aria-label={emoji}
                className="px-2 text-base"
                onSelect={() => onReact(emoji)}
              >
                {emoji}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
