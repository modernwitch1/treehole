'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowRight, Flame, MessagesSquare, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatScore } from '@/lib/format';
import { listPosts } from '@/lib/api';
import type { Post } from '@/types/api';

export function RightRail() {
  const [trendingPosts, setTrendingPosts] = React.useState<Post[]>([]);
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    listPosts({ sort: 'hot', limit: 4 })
      .then((page) => {
        setTrendingPosts(page.items);
        setError('');
      })
      .catch(() => setError('热议内容暂时无法加载'));
  }, []);
  return (
    <aside
      aria-label="社区信息"
      className="sticky top-16 hidden h-[calc(100vh-4rem)] w-[18rem] shrink-0 overflow-y-auto py-6 pr-6 xl:block"
    >
      <div className="space-y-4">
        <section className="rounded-2xl border border-primary/15 bg-gradient-to-br from-primary/[0.08] via-card to-card p-4">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
              <MessagesSquare className="size-5" />
            </span>
            <div>
              <h2 className="font-semibold tracking-tight">浙工商树洞</h2>
              <p className="text-xs text-muted-foreground">学生自发运营 · 非官方平台</p>
            </div>
          </div>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            匿名表达，关注内容本身。公开身份统一为“浙小商”。
          </p>
          <div className="mt-3 flex items-center gap-2 rounded-xl bg-background/70 px-3 py-2 text-xs text-muted-foreground">
            <ShieldCheck className="size-4 text-primary" /> 校园邮箱认证 · UID 仅后台可见
          </div>
        </section>

        <section className="rounded-2xl border border-border/70 bg-card p-3">
          <div className="flex items-center justify-between px-1 pb-2">
            <div className="flex items-center gap-2">
              <Flame className="size-4 text-orange-500" />
              <h2 className="text-sm font-semibold">正在热议</h2>
            </div>
            <Link href="/popular" className="text-xs text-muted-foreground hover:text-primary">
              更多
            </Link>
          </div>
          <div className="space-y-0.5">
            {error ? (
              <p className="px-2 py-4 text-xs leading-5 text-muted-foreground">{error}</p>
            ) : (
              trendingPosts.slice(0, 4).map((post, index) => (
                <Link
                  key={post.id}
                  href={`/p/${post.id}`}
                  className="group flex gap-2.5 rounded-xl px-2 py-2.5 hover:bg-muted/70"
                >
                  <span className="mt-0.5 text-xs font-bold tabular-nums text-primary/70">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-2 text-sm font-medium leading-5 group-hover:text-primary">
                      {post.title}
                    </span>
                    <span className="mt-1 block text-[11px] text-muted-foreground">
                      {post.board.name} · {formatScore(post.upvotes)} 赞
                    </span>
                  </span>
                </Link>
              ))
            )}
          </div>
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="mt-1 w-full text-xs text-muted-foreground"
          >
            <Link href="/explore">
              浏览全部帖子 <ArrowRight className="size-3.5" />
            </Link>
          </Button>
        </section>
      </div>
    </aside>
  );
}
