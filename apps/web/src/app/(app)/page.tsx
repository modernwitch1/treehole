import Link from 'next/link';
import { ArrowRight, Plus, ShieldCheck } from 'lucide-react';
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
    <div className="space-y-11 pb-10 [&_svg]:stroke-[1.8]">
      <section
        aria-labelledby="home-hero-title"
        className="relative isolate overflow-hidden rounded-[1.25rem] border border-[color:var(--hero-border)]/70 bg-[var(--hero-background)] px-6 py-7 text-white shadow-sm sm:px-9 sm:py-9"
      >
        <div
          aria-hidden
          className="absolute -right-20 -top-28 -z-10 size-80 rounded-full bg-[color:var(--hero-decoration)]/20 blur-3xl"
        />
        <div
          aria-hidden
          className="absolute -bottom-36 left-1/3 -z-10 size-72 rounded-full bg-[color:var(--hero-accent)]/10 blur-3xl"
        />
        <div className="relative flex flex-col gap-9 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold tracking-[0.16em] text-white/65">
              <span className="size-1.5 rounded-full bg-[var(--hero-accent)]" aria-hidden />
              <span>浙工商树洞 / CAMPUS COMMUNITY</span>
            </div>
            <p className="mt-6 text-sm font-medium text-white/70">
              {greeting}，{user ? user.username : '浙小商'}
            </p>
            <h1
              id="home-hero-title"
              className="mt-2 max-w-xl text-pretty text-[clamp(2rem,5vw,3.25rem)] font-bold leading-[1.14] tracking-[-0.055em]"
            >
              今天，校园里有什么新鲜事？
            </h1>
            <p className="mt-4 text-sm font-medium text-white/75">{timeOfDayHint(hour)}</p>
            <p className="mt-2 max-w-xl text-pretty text-sm leading-6 text-white/60 sm:text-[15px]">
              匿名表达，真实讨论。这里关注内容本身，也欢迎每一条认真、友善的分享。
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Button
                asChild
                size="lg"
                className="rounded-lg bg-[var(--hero-accent)] text-[var(--hero-background)] shadow-none hover:brightness-105"
              >
                <Link href="/submit">
                  <Plus className="size-4" /> 发布新话题
                </Link>
              </Button>
              <Link
                href="/explore"
                className="inline-flex h-11 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold text-white/75 transition-colors hover:bg-white/10 hover:text-white"
              >
                浏览全部帖子 <ArrowRight className="size-4" />
              </Link>
            </div>
          </div>

          <div className="hidden w-48 shrink-0 border-l border-white/15 pl-6 lg:block">
            <p className="text-[10px] font-semibold tracking-[0.18em] text-white/50">
              A QUIET PLACE
            </p>
            <p className="mt-4 text-2xl font-semibold leading-tight tracking-[-0.04em]">
              关注内容，
              <br />
              不追逐身份。
            </p>
            <div className="mt-7 flex items-center gap-2 text-xs text-white/55">
              <ShieldCheck className="size-3.5 text-[var(--hero-accent)]" />
              校园身份认证
            </div>
          </div>
        </div>
      </section>

      <section aria-labelledby="channels-heading" className="space-y-5">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-[10px] font-semibold tracking-[0.18em] text-primary/80">
              01 / EXPLORE
            </p>
            <h2 id="channels-heading" className="mt-2 text-2xl font-semibold tracking-[-0.035em]">
              从校园开始
            </h2>
            <p className="mt-1.5 text-sm text-muted-foreground">从主题进入你真正关心的校园话题</p>
          </div>
          <Link
            href="/explore"
            className="hidden items-center gap-1 text-sm font-semibold text-muted-foreground transition-colors hover:text-primary sm:inline-flex"
          >
            发现更多 <ArrowRight className="size-4" />
          </Link>
        </div>
        <BoardGrid boards={boards} />
      </section>

      <section aria-labelledby="featured-heading" className="space-y-5">
        <div className="flex items-end justify-between gap-4 border-b border-border/80 pb-4">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-primary text-[10px] font-bold text-primary-foreground">
              02
            </span>
            <div>
              <p className="text-[10px] font-semibold tracking-[0.18em] text-primary/80">
                THE FEED
              </p>
              <h2 id="featured-heading" className="mt-2 text-2xl font-semibold tracking-[-0.035em]">
                正在发生
              </h2>
              <p className="mt-1.5 text-sm text-muted-foreground">首页精选值得关注的新鲜讨论</p>
            </div>
          </div>
          <Link
            href="/explore"
            className="hidden items-center gap-1 text-sm font-semibold text-muted-foreground transition-colors hover:text-primary sm:inline-flex"
          >
            全部帖子 <ArrowRight className="size-4" />
          </Link>
        </div>

        {page.items.length > 0 ? (
          <div className="space-y-3">
            {page.items.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                currentUserRole={user?.role}
                isLoggedIn={Boolean(user)}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed bg-card px-5 py-14 text-center text-sm text-muted-foreground">
            暂时还没有帖子，来发布今天的第一条话题吧。
          </div>
        )}
      </section>
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
