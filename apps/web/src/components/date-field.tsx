import { type ComponentProps, useState } from 'react';

/** Tam ve makul bir tarih mi? Yıl yazılırken tarayıcı "0002-…", "0020-…" gibi ara değerler üretir. */
const isComplete = (value: string) => {
  const year = Number(value.slice(0, 4));
  return value.length >= 10 && year >= 1900 && year <= 2999;
};

/**
 * Tarih alanı (gün/ay/yıl ya da tarih+saat). Değer yazılırken her tuşta kaydedilmez: yalnızca tarih
 * tamamlanınca (yıl 4 hane), takvimden seçilince ya da alandan çıkınca bildirilir. Her tuşta kaydedilen
 * alanlarda yarım yıl ("0002") kaydedilip geri yazılıyor, gün ve ay siliniyordu.
 */
export function DateField({
  value,
  onCommit,
  type = 'date',
  ...props
}: Omit<ComponentProps<'input'>, 'value' | 'onChange' | 'type' | 'defaultValue'> & {
  value: string | null;
  onCommit: (value: string | null) => void;
  type?: 'date' | 'datetime-local';
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? value ?? '';
  const commit = (next: string) => {
    if ((next || null) !== (value || null)) onCommit(next || null);
  };
  return (
    <input
      {...props}
      type={type}
      value={shown}
      onChange={(e) => {
        const next = e.target.value;
        setDraft(next);
        if (next !== '' && isComplete(next)) commit(next);
      }}
      onBlur={(e) => {
        const next = e.target.value;
        // Yarım kalan tarih kaydedilmez; boşaltılan alan "tarih yok" olarak kaydedilir.
        if (next === '' || isComplete(next)) commit(next);
        setDraft(null);
        props.onBlur?.(e);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        props.onKeyDown?.(e);
      }}
    />
  );
}
