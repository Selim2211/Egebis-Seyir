import { CircleAlert } from 'lucide-react';
import { type ComponentProps, type ReactNode, useId } from 'react';
import type { FieldError } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { isApiError } from '@/lib/api';
import { cn } from '@/lib/utils';

/** Zod doğrulama hatalarını (shared şemalar) çevrilmiş mesaja eşler. */
function useFieldErrorMessage(error: FieldError | undefined, kind?: 'email'): string | undefined {
  const { t } = useTranslation();
  if (!error) return undefined;
  switch (error.type) {
    case 'too_small':
      return t('validation.required');
    case 'too_big':
      return t('validation.tooLong');
    case 'invalid_format':
      return kind === 'email' ? t('validation.email') : t('validation.invalid');
    default:
      return t('validation.invalid');
  }
}

type FieldProps = ComponentProps<typeof Input> & {
  label: string;
  hint?: ReactNode;
  error?: FieldError;
  /** Etiketin sağında gösterilecek bağlantı vb. */
  aside?: ReactNode;
};

/** Etiket + girdi + ipucu/hata; erişilebilirlik bağlantıları (aria-describedby) hazır. */
export function Field({ label, hint, error, aside, className, type, ...input }: FieldProps) {
  const id = useId();
  const message = useFieldErrorMessage(error, type === 'email' ? 'email' : undefined);
  const describedBy = message ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <div className="flex items-baseline">
        <Label htmlFor={id}>{label}</Label>
        {aside && <span className="ml-auto text-sm">{aside}</span>}
      </div>
      <Input
        id={id}
        type={type}
        aria-invalid={message ? true : undefined}
        aria-describedby={describedBy}
        {...input}
      />
      {message ? (
        <p id={`${id}-error`} className="text-destructive text-xs">
          {message}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-muted-foreground text-xs">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** Seçim kutusu (rol, dil vb.); yerel <select> erişilebilir ve hızlı. */
export function SelectField({
  label,
  children,
  className,
  ...select
}: ComponentProps<'select'> & { label: string }) {
  const id = useId();
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <Label htmlFor={id}>{label}</Label>
      <NativeSelect id={id} {...select}>
        {children}
      </NativeSelect>
    </div>
  );
}

export function NativeSelect({ className, ...props }: ComponentProps<'select'>) {
  return (
    <select
      className={cn(
        'border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-9 rounded-md border px-2.5 text-sm shadow-xs outline-none focus-visible:ring-[3px] disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}

/** API hatasını çevrilmiş metinle gösterir (ADR-007). */
export function FormError({ error }: { error: unknown }) {
  const { t } = useTranslation();
  if (!error) return null;
  const code = isApiError(error) ? error.code : 'INTERNAL';
  return (
    <div
      role="alert"
      className="border-destructive/30 bg-destructive/5 text-destructive flex items-start gap-2 rounded-md border px-3 py-2 text-sm"
    >
      <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>{t(`errors.${code}`, { defaultValue: t('errors.INTERNAL') })}</span>
    </div>
  );
}
