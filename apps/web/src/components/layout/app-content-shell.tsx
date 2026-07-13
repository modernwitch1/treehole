'use client';

import { usePathname } from 'next/navigation';
import { Sidebar } from '@/components/layout/sidebar';
import { RightRail } from '@/components/layout/right-rail';

export function AppContentShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const immersive = pathname.startsWith('/explore');
  const home = pathname === '/';
  const showRightRail = !immersive && !home;

  const contentWidth = immersive
    ? 'w-full'
    : home
      ? 'min-w-0 w-full max-w-5xl py-7 sm:py-9'
      : 'min-w-0 w-full max-w-3xl py-5 sm:py-6';

  return (
    <div className="flex flex-1">
      {!immersive && <Sidebar />}
      <main id="main-content" tabIndex={-1} className="min-w-0 flex-1 outline-none">
        <div
          className={
            immersive
              ? 'mx-auto w-full max-w-7xl px-3 py-4 sm:px-6 sm:py-6 xl:px-8'
              : 'mx-auto flex w-full max-w-[104rem] justify-center gap-8 px-3 sm:px-5 lg:px-6 xl:pr-0'
          }
        >
          <div className={contentWidth}>{children}</div>
          {showRightRail && <RightRail />}
        </div>
      </main>
    </div>
  );
}
