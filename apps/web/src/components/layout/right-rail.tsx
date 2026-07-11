import Image from 'next/image';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { ArrowRight, BadgeCheck, Flame, ShieldCheck } from 'lucide-react';
import { formatScore } from '@/lib/format';
import type { Post } from '@/types/api';

interface RightRailProps {
  trendingPosts: Post[];
}

export function RightRail({ trendingPosts }: RightRailProps) {
  return (
    <aside
      aria-label="社区信息"
      className="sticky top-16 hidden h-[calc(100vh-4rem)] w-[19rem] shrink-0 overflow-y-auto py-6 pr-6 xl:block"
    >
      <div className="space-y-5">
        <CommunityCard />
        <TrendingCard posts={trendingPosts} />
        <RulesCard />
      </div>
    </aside>
  );
}

function CommunityCard() {
  return (
    <Card className="overflow-hidden">
      <div className="relative h-20 overflow-hidden bg-gradient-to-br from-primary via-[#287fd4] to-[#5aa9e6]">
        <div className="absolute -right-8 -top-10 size-28 rounded-full border border-white/20 bg-white/10" />
        <div className="absolute bottom-2 right-12 size-10 rounded-full border border-white/20" />
      </div>
      <CardContent className="-mt-7 space-y-3.5 px-5 pb-5 pt-0">
        <div className="flex size-14 items-center justify-center overflow-hidden rounded-2xl bg-card p-0.5 shadow-md ring-4 ring-card">
          <Image
            src="/logo.webp"
            alt="浙工商树洞"
            width={52}
            height={52}
            className="size-[3.25rem] select-none"
          />
        </div>
        <div>
          <div className="flex items-center gap-1.5">
            <h2 className="font-semibold tracking-tight">浙工商树洞</h2>
            <BadgeCheck className="size-4 text-primary" aria-label="校园身份认证社区" />
          </div>
          <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">
            浙江工商大学学生专属的匿名校园社区
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-xl bg-primary/[0.07] px-3 py-2 text-xs text-muted-foreground">
          <ShieldCheck className="size-4 shrink-0 text-primary" />
          校园邮箱认证 · 匿名身份保护
        </div>
        <Button className="w-full rounded-xl" size="sm" asChild>
          <Link href="/submit">发布帖子</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function TrendingCard({ posts }: { posts: Post[] }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-2 px-5 pb-3 pt-5">
        <span className="flex size-8 items-center justify-center rounded-lg bg-orange-500/10">
          <Flame className="size-4 text-orange-600 dark:text-orange-400" />
        </span>
        <div>
          <CardTitle className="text-sm font-semibold">今日热议</CardTitle>
          <p className="mt-0.5 text-[11px] text-muted-foreground">看看同学们正在聊什么</p>
        </div>
      </CardHeader>
      <CardContent className="space-y-1 px-3 pb-4 pt-0">
        {posts.length === 0 ? (
          <p className="px-2 py-6 text-center text-sm text-muted-foreground">暂无热议帖子</p>
        ) : (
          posts.slice(0, 5).map((p, idx) => (
            <Link
              key={p.id}
              href={`/p/${p.id}`}
              className="group flex gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-accent/70"
            >
              <span
                className={`flex size-6 shrink-0 items-center justify-center rounded-lg text-xs font-bold tabular-nums ${
                  idx < 3 ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
                }`}
              >
                {idx + 1}
              </span>
              <div className="min-w-0 flex-1 space-y-1">
                <p className="line-clamp-2 text-sm font-medium leading-snug group-hover:text-primary">
                  {p.title}
                </p>
                <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <span className="truncate">{p.board ? `#${p.board.name}` : '树洞'}</span>
                  <span aria-hidden>·</span>
                  <span className="shrink-0">{formatScore(p.commentCount)} 评论</span>
                </p>
              </div>
            </Link>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function RulesCard() {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-2 px-5 pb-3 pt-5">
        <span className="flex size-8 items-center justify-center rounded-lg bg-emerald-500/10">
          <ShieldCheck className="size-4 text-emerald-600 dark:text-emerald-400" />
        </span>
        <CardTitle className="text-sm">友善社区准则</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 px-5 pb-5 pt-0 text-xs text-muted-foreground">
        <RuleItem n={1}>遵守法律法规与学校规定</RuleItem>
        <Separator />
        <RuleItem n={2}>禁止人身攻击、地图炮、性骚扰</RuleItem>
        <Separator />
        <RuleItem n={3}>禁止商业广告与虚假信息</RuleItem>
        <Separator />
        <RuleItem n={4}>匿名标签同帖昵称稳定 · 跨帖独立</RuleItem>
        <Separator />
        <RuleItem n={5}>违规内容请使用举报功能</RuleItem>
        <Button asChild variant="ghost" size="sm" className="mt-2 w-full justify-between px-2">
          <Link href="/rules">
            查看完整规则 <ArrowRight className="size-3.5" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function RuleItem({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <span className="font-medium">{n}.</span>
      <span className="leading-relaxed">{children}</span>
    </div>
  );
}
