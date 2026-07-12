import Link from 'next/link';
import { ArrowRight, Plus, ShieldCheck, Sparkles } from 'lucide-react';
import { PostCard } from '@/components/post-card';
import { BoardGrid } from '@/components/board-grid';
import { Button } from '@/components/ui/button';
import { getCurrentUser, listPosts, listBoards } from '@/lib/api';

export default async function HomePage() {
  const [page, user, boards] = await Promise.all([
    listPosts({ sort: 'hot', limit: 6 }),
    getCurrentUser(),
    listBoards(),
  ]);

  const greeting = getGreeting();
  const hour = new Date().getHours();

  return (
    <div className="space-y-8 pb-6">
      <section
        aria-labelledby="home-hero-title"
        className="relative isolate overflow-hidden rounded-[1.5rem] border border-primary/15 bg-card px-5 py-6 shadow-card sm:px-7 sm:py-8"
      >
        <div aria-hidden className="absolute -right-16 -top-24 -z-10 size-72 rounded-full bg-primary/12 blur-3xl" />
        <div aria-hidden className="absolute -bottom-32 left-1/4 -z-10 size-64 rounded-full bg-orange-300/10 blur-3xl" />
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-2xl space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-semibold text-primary">{greeting}，{user ? user.username : '浙小商'}</span>
              <span className="inline-flex items-center gap-1 rounded-full border border-primary/15 bg-primary/[0.08] px-2.5 py-1 text-[11px] font-medium text-primary">
                <ShieldCheck className="size-3" /> 校园身份认证
              </span>
            </div>
            <h1 id="home-hero-title" className="text-pretty text-3xl font-bold tracking-[-0.035em] sm:text-4xl">
              今天，校园里有什么新鲜事？
            </h1>
            <p className="text-sm font-medium text-foreground/75">{timeOfDayHint(hour)}</p>
            <p className="max-w-xl text-pretty text-sm leading-6 text-muted-foreground sm:text-base">
              匿名表达、真实讨论。所有公开身份都是“浙小商”，你只需要关注内容本身。
            </p>
          </div>
          <Button asChild size="lg" className="w-full rounded-xl sm:w-auto">
            <Link href="/submit"><Plus className="size-4" /> 发布新话题</Link>
          </Button>
        </div>
      </section>

      <section aria-labelledby="channels-heading" className="space-y-4 rounded-2xl border border-border/70 bg-card/60 p-4 sm:p-5">
        <div>
          <h2 id="channels-heading" className="text-lg font-semibold tracking-tight">按主题逛逛</h2>
          <p className="mt-1 text-xs text-muted-foreground">从频道进入感兴趣的校园话题</p>
        </div>
        <BoardGrid boards={boards} />
      </section>

      <section aria-labelledby="featured-heading" className="space-y-4">
        <div className="flex items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles className="size-5 text-primary" />
              <h2 id="featured-heading" className="text-xl font-bold tracking-tight">全站精选</h2>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">首页只展示部分值得关注的新鲜讨论</p>
          </div>
          <Button asChild variant="ghost" size="sm" className="hidden gap-1 sm:inline-flex">
            <Link href="/explore">全部帖子 <ArrowRight className="size-4" /></Link>
          </Button>
        </div>

        {page.items.length > 0 ? (
          <div className="space-y-3">
            {page.items.map((post) => (
              <PostCard key={post.id} post={post} currentUserRole={user?.role} isLoggedIn={Boolean(user)} />
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed bg-card px-5 py-14 text-center text-sm text-muted-foreground">
            暂时还没有帖子，来发布今天的第一条话题吧。
          </div>
        )}
      </section>

      <Button asChild size="lg" variant="outline" className="h-12 w-full rounded-xl text-sm font-semibold">
        <Link href="/explore">查看更多全站帖子 <ArrowRight className="size-4" /></Link>
      </Button>
    </div>
  );
}

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 6) return '夜深了';
  if (hour < 11) return '早上好';
  if (hour < 14) return '中午好';
  if (hour < 18) return '下午好';
  return '晚上好';
}

function timeOfDayHint(hour: number) {
  if (hour < 6) return '注意休息，也可以把睡不着的心事留在这里';
  if (hour < 11) return '看看同学们从清晨开始的新鲜讨论';
  if (hour < 14) return '午间歇一会儿，逛逛校园里的新话题';
  if (hour < 18) return '课程和生活中的问题，也许有人正好懂你';
  return '一天快结束了，来说说今天发生的事';
}
