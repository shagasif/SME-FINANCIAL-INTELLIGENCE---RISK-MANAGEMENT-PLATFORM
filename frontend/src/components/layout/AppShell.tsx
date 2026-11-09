import type { ReactNode } from 'react';
import type { ThemeMode } from '../../hooks/useTheme';
import { Footer } from './Footer';
import { Header } from './Header';

interface AppShellProps {
  theme: ThemeMode;
  onToggleTheme: () => void;
  children: ReactNode;
}

export function AppShell({ theme, onToggleTheme, children }: AppShellProps) {
  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-black focus:shadow-lg"
      >
        Skip to main content
      </a>
      <Header theme={theme} onToggleTheme={onToggleTheme} />
      <main id="main-content" className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">
        {children}
      </main>
      <Footer />
    </div>
  );
}
