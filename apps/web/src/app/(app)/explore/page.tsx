import { Suspense } from 'react';
import { Layers3, Search } from 'lucide-react';
import { PostListInfinite } from '@/components/post-list-infinite';
import { SortTabs } from '@/components/sort-tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { getCurrentUser, listPosts } from '@/lib/api';
import type { SortType } from '@/types/api';

const EXPLORE_PAGE_SIZE = 30;

interface ExplorePageProps {
  searchParams: Promise<{ sort?: SortType; q?: string }>;
}

export default async function ExplorePage({ searchParams }: ExplorePageProps) {
  const params = await searchParams;
  const sort = params.sort ?? 'hot';
  const q = params.q;
  const [page, user] = await Promise.all([
    listPosts({ sort, q, limit: EXPLORE_PAGE_SIZE }),
    getCurrentUser(),
  ]);

  return (
    <div className="space-y-4 pb-8">
      <header className="relative overflow-hidden rounded-2xl border border-border/70 bg-gradient-to-br from-card via-card to-primary/[0.04] px-4 py-4 shadow-sm sm:px-5 sm:py-5">
        <div className="pointer-events-none absolute -right-16 -top-20 size-48 rounded-full bg-primary/[0.06] blur-3xl" />
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="relative">
            <div className="flex items-center gap-2">
              {q ? (
                <Search className="size-5 text-primary" />
              ) : (
                <Layers3 className="size-5 text-primary" />
              )}
              <h1 className="text-2xl font-bold tracking-tight">{q ? `搜索：${q}` : '全部帖子'}</h1>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {q ? '查看所有相关讨论' : '按兴趣浏览全站话题，向下滚动自动加载更多'}
            </p>
          </div>
          <Suspense fallback={<Skeleton className="h-9 w-64 rounded-lg" />}>
            <SortTabs defaultValue={sort} />
          </Suspense>
        </div>
      </header>

      <PostListInfinite
        initialPosts={page.items}
        initialNextCursor={page.nextCursor}
        limit={EXPLORE_PAGE_SIZE}
        sort={sort}
        q={q}
        currentUserRole={user?.role}
        isLoggedIn={Boolean(user)}
        layout="grid"
      />
    </div>
  );
}
