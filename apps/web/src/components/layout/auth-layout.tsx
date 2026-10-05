import { Link } from '@tanstack/react-router';
import { Globe } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { NativeSelect } from '@/components/form';
import { BrandMark } from '@/components/logo';
import { type Language, useUiStore } from '@/lib/ui-store';

/** Oturumsuz sayfaların düzeni: ortalanmış dar sütun + dil seçimi (taslak: Giriş, Davetle kayıt). */
export function AuthLayout({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { language, setLanguage } = useUiStore();
  return (
    <div className="bg-background flex min-h-dvh flex-col">
      <main className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm">
          <BrandMark size={40} />
          {children}
        </div>
      </main>
      <footer className="text-muted-foreground flex h-13 items-center justify-center gap-2 text-xs">
        <Globe className="size-3.5" aria-hidden />
        <NativeSelect
          aria-label={t('userMenu.language')}
          value={language}
          onChange={(e) => setLanguage(e.target.value as Language)}
          className="h-7 border-none bg-transparent px-1 text-xs shadow-none"
        >
          <option value="tr">{t('language.tr')}</option>
          <option value="en">{t('language.en')}</option>
        </NativeSelect>
      </footer>
    </div>
  );
}

export function AuthHeading({ title, subtitle }: { title: string; subtitle?: ReactNode }) {
  return (
    <>
      <h1 className="mt-5 text-[22px] font-semibold tracking-tight">{title}</h1>
      {subtitle && <p className="text-muted-foreground mt-1.5 text-sm">{subtitle}</p>}
    </>
  );
}

export function BackToLogin() {
  const { t } = useTranslation();
  return (
    <p className="mt-6 text-sm">
      <Link to="/login" className="text-primary hover:underline">
        {t('auth.backToLogin')}
      </Link>
    </p>
  );
}
