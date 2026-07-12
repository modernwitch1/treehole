import { Suspense } from 'react';
import { Layers3, Search } from 'lucide-react';
import { PostListInfinite } from '@/components/post-list-infinite';
import { SortTabs } from '@/components/sort-tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { getCurrentUser, listPosts } from '@/lib/api';
import type { SortType } from '@/types/api';

interface ExplorePageProps {
  searchParams: Promise<{ sort?: SortType; q?: string }>;
}

export default async function ExplorePage({ searchParams }: ExplorePageProps) {
  const params = await searchParams;
  const sort = params.sort ?? 'hot';
  const q = params.q;
  const [page, user] = await Promise.all([listPosts({ sort, q }), getCurrentUser()]);

  return (
    <div className="space-y-5 pb-8">
      <header className="rounded-2xl border border-border/70 bg-card px-5 py-5 sm:px-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              {q ? <Search className="size-5 text-primary" /> : <Layers3 className="size-5 text-primary" />}
              <h1 className="text-2xl font-bold tracking-tight">{q ? `搜索：${q}` : '全部帖子'}</h1>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {q ? '查看所有相关讨论' : '持续浏览全站话题，滚动加载更多内容'}
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
        sort={sort}
        q={q}
        currentUserRole={user?.role}
        isLoggedIn={Boolean(user)}
        layout="grid"
      />
    </div>
  );
}
