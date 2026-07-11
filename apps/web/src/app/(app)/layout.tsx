import { Header } from '@/components/layout/header';
import { Sidebar } from '@/components/layout/sidebar';
import { RightRail } from '@/components/layout/right-rail';
import { getCurrentUser, listPosts } from '@/lib/api';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function AppGroupLayout({ children }: { children: React.ReactNode }) {
  const [user, trendingPage] = await Promise.all([
    getCurrentUser(),
    listPosts({ sort: 'hot', limit: 5 }),
  ]);

  if (!user) {
    redirect('/login');
  }

  return (
    <div className="app-shell flex min-h-screen flex-col">
      <a className="skip-link" href="#main-content">
        跳到主要内容
      </a>
      <Header currentUser={user} />
      <div className="flex flex-1">
        <Sidebar />
        <main id="main-content" tabIndex={-1} className="min-w-0 flex-1 outline-none">
          <div className="mx-auto flex w-full max-w-[104rem] justify-center gap-6 px-3 sm:px-5 lg:px-6 xl:pr-0">
            <div className="min-w-0 w-full max-w-3xl py-5 sm:py-6">{children}</div>
            <RightRail trendingPosts={trendingPage.items} />
          </div>
        </main>
      </div>
    </div>
  );
}
