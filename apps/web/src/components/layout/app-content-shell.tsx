'use client';

import { usePathname } from 'next/navigation';
import { Sidebar } from '@/components/layout/sidebar';
import { RightRail } from '@/components/layout/right-rail';

export function AppContentShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const immersive = pathname.startsWith('/explore');

  return (
    <div className="flex flex-1">
      {!immersive && <Sidebar />}
      <main id="main-content" tabIndex={-1} className="min-w-0 flex-1 outline-none">
        <div
          className={
            immersive
              ? 'mx-auto w-full max-w-5xl px-3 py-5 sm:px-6 sm:py-7'
              : 'mx-auto flex w-full max-w-[104rem] justify-center gap-6 px-3 sm:px-5 lg:px-6 xl:pr-0'
          }
        >
          <div className={immersive ? 'w-full' : 'min-w-0 w-full max-w-3xl py-5 sm:py-6'}>{children}</div>
          {!immersive && <RightRail />}
        </div>
      </main>
    </div>
  );
}
