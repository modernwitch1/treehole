import { Suspense } from 'react';
import { TrendingUp } from 'lucide-react';
import { SortTabs } from '@/components/sort-tabs';
import { PostListInfinite } from '@/components/post-list-infinite';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { getCurrentUser, listPosts } from '@/lib/api';
import type { SortType } from '@/types/api';

interface PopularPageProps {
  searchParams: Promise<{ sort?: SortType; tag?: string; q?: string }>;
}

export default async function PopularPage({ searchParams }: PopularPageProps) {
  const params = await searchParams;
  // 热门页面默认按 top 排序（最高评分）
  const sort = params.sort ?? 'top';
  const tag = params.tag;
  const q = params.q;
  const [page, user] = await Promise.all([listPosts({ sort, tag, q }), getCurrentUser()]);

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <TrendingUp className="size-5" />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">全站热门</h1>
            <p className="mt-0.5 text-xs text-muted-foreground">汇集校园里最受关注的讨论</p>
          </div>
        </div>
        <Suspense fallback={<Skeleton className="h-9 w-64 rounded-lg" />}>
          <SortTabs defaultValue={sort} />
        </Suspense>
      </header>
      <Separator />
      <PostListInfinite
        initialPosts={page.items}
        initialNextCursor={page.nextCursor}
        sort={sort}
        tag={tag}
        q={q}
        currentUserRole={user?.role}
        isLoggedIn={!!user}
      />
    </div>
  );
}
