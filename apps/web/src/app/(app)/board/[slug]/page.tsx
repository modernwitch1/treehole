import { Suspense } from 'react';
import Link from 'next/link';
import { ArrowLeft, Plus } from 'lucide-react';
import { SortTabs } from '@/components/sort-tabs';
import { PostListInfinite } from '@/components/post-list-infinite';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { getCurrentUser, listPosts, getBoard } from '@/lib/api';
import type { SortType } from '@/types/api';

interface BoardPageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ sort?: SortType }>;
}

export async function generateMetadata({ params }: BoardPageProps) {
  const { slug } = await params;
  try {
    const board = await getBoard(slug);
    return {
      title: `${board.name} - 浙工商树洞`,
      description: board.description,
    };
  } catch {
    return { title: '板块不存在 - 浙工商树洞' };
  }
}

export default async function BoardPage({ params, searchParams }: BoardPageProps) {
  const { slug } = await params;
  const { sort = 'hot' } = await searchParams;

  let board;
  try {
    board = await getBoard(slug);
  } catch {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-lg font-medium">板块不存在</p>
        <p className="mt-1 text-sm text-muted-foreground">该板块可能已被删除或不存在</p>
        <Button asChild variant="link" className="mt-4">
          <Link href="/">返回首页</Link>
        </Button>
      </div>
    );
  }

  const [page, user] = await Promise.all([
    listPosts({ sort, tag: slug }),
    getCurrentUser(),
  ]);

  return (
    <div className="space-y-4">
      {/* 板块头部 */}
      <section className="overflow-hidden rounded-2xl border border-border/60 bg-card p-5 shadow-card sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <Link
              href="/"
              className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="size-3.5" />
              返回首页
            </Link>
            <div className="flex items-center gap-3">
              <span className="text-3xl">{board.icon ?? '📋'}</span>
              <div>
                <h1 className="text-2xl font-bold tracking-tight">{board.name}</h1>
                {board.description && (
                  <p className="mt-1 text-sm text-muted-foreground">{board.description}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span>{board.postCount} 帖子</span>
              <span>{board.subscriberCount} 关注者</span>
            </div>
          </div>
          <Button asChild size="sm" className="shrink-0 rounded-full">
            <Link href={`/submit?board=${slug}`}>
              <Plus className="size-4" />
              发帖
            </Link>
          </Button>
        </div>

        {/* 板块规则 */}
        {board.rules && (
          <div className="mt-4 rounded-lg border bg-muted/50 p-3">
            <p className="text-xs font-medium text-muted-foreground">板块规则</p>
            <p className="mt-1 text-sm">{board.rules}</p>
          </div>
        )}
      </section>

      {/* 排序和帖子列表 */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold tracking-tight">帖子</h2>
        <Suspense fallback={<Skeleton className="h-9 w-64 rounded-lg" />}>
          <SortTabs defaultValue={sort} />
        </Suspense>
      </div>

      <Separator />

      {page.items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border/80 bg-card/50 py-16 text-center">
          <p className="font-medium">这个板块还没有帖子</p>
          <p className="text-sm text-muted-foreground">成为第一个发帖的人吧</p>
          <Button asChild size="sm" className="mt-1 rounded-full">
            <Link href={`/submit?board=${slug}`}>
              <Plus className="size-4" /> 发布第一帖
            </Link>
          </Button>
        </div>
      ) : (
        <PostListInfinite
          initialPosts={page.items}
          initialNextCursor={page.nextCursor}
          sort={sort}
          tag={slug}
          currentUserRole={user?.role}
          isLoggedIn={!!user}
        />
      )}
    </div>
  );
}
