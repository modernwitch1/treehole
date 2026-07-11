import { Suspense } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  Hash,
  MessageSquare,
  Plus,
  Search as SearchIcon,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { SortTabs } from '@/components/sort-tabs';
import { PostListInfinite } from '@/components/post-list-infinite';
import { BoardGrid } from '@/components/board-grid';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { getCurrentUser, listPosts, listBoards } from '@/lib/api';
import type { SortType } from '@/types/api';

interface HomePageProps {
  searchParams: Promise<{ sort?: SortType; tag?: string; q?: string }>;
}

export default async function HomePage({ searchParams }: HomePageProps) {
  const params = await searchParams;
  const sort = params.sort ?? 'hot';
  const tag = params.tag;
  const q = params.q;
  const [page, user, boards] = await Promise.all([
    listPosts({ sort, tag, q }),
    getCurrentUser(),
    listBoards(),
  ]);

  const isHome = !q && !tag;
  const greeting = getGreeting();
  const hour = new Date().getHours();

  return (
    <div className="space-y-5">
      {isHome ? (
        <>
          <section
            aria-labelledby="home-hero-title"
            className="relative isolate overflow-hidden rounded-[1.25rem] border border-primary/15 bg-card p-5 shadow-card sm:p-7"
          >
            <div
              aria-hidden="true"
              className="absolute -right-20 -top-24 -z-10 size-72 rounded-full bg-primary/10 blur-2xl"
            />
            <div
              aria-hidden="true"
              className="absolute -bottom-28 left-1/3 -z-10 size-56 rounded-full bg-cyan-400/[0.08] blur-3xl"
            />
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-primary">
                    {greeting}，{user ? user.username : '浙小商'}
                  </p>
                  <span className="inline-flex items-center gap-1 rounded-full border border-primary/15 bg-primary/[0.08] px-2 py-1 text-[11px] font-medium text-primary">
                    <ShieldCheck className="size-3" /> 校园身份认证
                  </span>
                </div>
                <h1 id="home-hero-title" className="text-pretty text-2xl font-bold tracking-[-0.03em] sm:text-3xl">
                  欢迎来到浙工商树洞
                </h1>
                <p className="text-sm font-medium text-foreground/75">{timeOfDayHint(hour)}</p>
                <p className="text-pretty max-w-xl text-sm leading-6 text-muted-foreground">
                  说想说的话、问想问的事、找到同校伙伴。匿名身份隔离，让每一次真实表达都更安心。
                </p>
              </div>
              <div className="flex shrink-0 flex-col gap-2 min-[420px]:flex-row sm:flex-col">
                <Button asChild size="lg" className="w-full rounded-xl sm:w-auto">
                  <Link href="/submit">
                    <Plus className="size-4" />
                    立即发帖
                  </Link>
                </Button>
                <Button asChild variant="outline" className="w-full rounded-xl sm:w-auto">
                  <Link href="/popular">
                    浏览热门
                    <ArrowRight className="size-4" />
                  </Link>
                </Button>
              </div>
            </div>
          </section>

          <section aria-labelledby="boards-heading" className="space-y-3">
            <div className="flex items-end justify-between gap-4">
              <div>
                <h2 id="boards-heading" className="text-lg font-semibold tracking-tight">
                  板块广场
                </h2>
                <p className="mt-0.5 text-xs text-muted-foreground">按兴趣找到你的校园同好</p>
              </div>
              <Button asChild variant="ghost" size="sm" className="gap-1.5 text-muted-foreground">
                <Link href="/apply-board">
                  <Sparkles className="size-3.5" />
                  申请开吧
                </Link>
              </Button>
            </div>
            <BoardGrid boards={boards} />
          </section>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">全站动态</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">发现同学们的新鲜讨论</p>
            </div>
            <Suspense fallback={<Skeleton className="h-9 w-64 rounded-lg" />}>
              <SortTabs defaultValue={sort} />
            </Suspense>
          </div>
        </>
      ) : (
        <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-2">
            {q ? (
              <>
                <SearchIcon className="size-5 shrink-0 text-muted-foreground" />
                <h1 className="truncate text-2xl font-bold tracking-tight">搜索：{q}</h1>
              </>
            ) : (
              <>
                <Hash className="size-5 shrink-0 text-primary" />
                <h1 className="truncate text-2xl font-bold tracking-tight">#{tag}</h1>
              </>
            )}
          </div>
          <Suspense fallback={<Skeleton className="h-9 w-64 rounded-lg" />}>
            <SortTabs defaultValue={sort} />
          </Suspense>
        </header>
      )}

      <Separator />

      {page.items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-card/70 px-5 py-16 text-center shadow-card">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-muted ring-1 ring-border/60">
            {q ? (
              <SearchIcon className="size-6 text-muted-foreground" />
            ) : (
              <MessageSquare className="size-6 text-muted-foreground" />
            )}
          </div>
          <div className="space-y-1">
            <p className="font-medium">{q ? '没有找到相关帖子' : '这里还没有帖子'}</p>
            <p className="text-sm text-muted-foreground">
              {q ? '换个关键词试试，或者浏览其他板块' : '成为第一个发声的浙小商吧'}
            </p>
          </div>
          {isHome && (
            <Button asChild size="sm" className="mt-1 rounded-full">
              <Link href="/submit">
                <Plus className="size-4" /> 发布第一帖
              </Link>
            </Button>
          )}
        </div>
      ) : (
        <PostListInfinite
          initialPosts={page.items}
          initialNextCursor={page.nextCursor}
          sort={sort}
          tag={tag}
          q={q}
          currentUserRole={user?.role}
          isLoggedIn={!!user}
        />
      )}
    </div>
  );
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 6) return '夜深了';
  if (h < 11) return '早上好';
  if (h < 14) return '中午好';
  if (h < 18) return '下午好';
  return '晚上好';
}

function timeOfDayHint(hour: number) {
  if (hour < 6) return '注意休息，别熬太晚';
  if (hour < 11) return '元气满满的一天';
  if (hour < 14) return '吃饱了才有力气逛树洞';
  if (hour < 18) return '课间刷一刷树洞';
  return '今晚有什么想说的吗';
}
