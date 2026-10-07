import * as React from 'react';
import { cn } from '@/lib/utils';

function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'border-input placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-primary/15 hover:border-primary/40 aria-invalid:border-destructive flex min-h-16 w-full rounded-md border bg-card transition-[color,box-shadow,border-color] duration-150 px-3 py-2 text-sm shadow-xs outline-none focus-visible:ring-4 disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
