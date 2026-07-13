'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Plus,
  TrendingUp,
  Layers3,
  Home,
  Compass,
  MessageSquare,
  Inbox,
  Settings,
  Info,
  MessagesSquare,
  Utensils,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="sticky top-[4.25rem] hidden h-[calc(100vh-4.25rem)] w-60 shrink-0 border-r border-border/60 bg-transparent lg:flex lg:flex-col [&_svg]:stroke-[1.8]">
      <div className="p-4 pb-2">
        <Button asChild className="w-full justify-center rounded-lg shadow-sm">
          <Link href="/submit">
            <Plus className="size-4" />
            发布帖子
          </Link>
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <nav aria-label="侧边导航" className="flex flex-col gap-1 p-3 pt-2">
          <SectionLabel>浏览</SectionLabel>
          <NavItem href="/" icon={<Home className="size-4" />} active={pathname === '/'}>
            首页
          </NavItem>
          <NavItem
            href="/explore"
            icon={<Layers3 className="size-4" />}
            active={pathname.startsWith('/explore')}
          >
            全部帖子
          </NavItem>
          <NavItem
            href="/popular"
            icon={<TrendingUp className="size-4" />}
            active={pathname === '/popular'}
          >
            热门
          </NavItem>

          <Separator className="my-2" />

          <SectionLabel>校园服务</SectionLabel>
          <NavItem
            href="/compass"
            icon={<Compass className="size-4" />}
            active={pathname.startsWith('/compass')}
          >
            选课指南针
          </NavItem>
          <NavItem
            href="/chatrooms"
            icon={<MessageSquare className="size-4" />}
            active={pathname.startsWith('/chatrooms')}
          >
            在线聊天房
          </NavItem>
          <NavItem
            href="/food"
            icon={<Utensils className="size-4" />}
            active={pathname.startsWith('/food')}
          >
            美食模块
          </NavItem>

          <Separator className="my-2" />

          <SectionLabel>个人</SectionLabel>
          <NavItem
            href="/messages"
            icon={<Inbox className="size-4" />}
            active={pathname.startsWith('/messages')}
          >
            我的私信
          </NavItem>
          <NavItem
            href="/settings"
            icon={<Settings className="size-4" />}
            active={pathname === '/settings'}
          >
            设置
          </NavItem>
        </nav>
      </ScrollArea>

      <Separator />

      <FooterLinks />
    </aside>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-3 pb-1 pt-2 text-[11px] font-semibold tracking-[0.12em] text-muted-foreground/75">
      {children}
    </div>
  );
}

function NavItem({
  href,
  icon,
  active,
  children,
}: {
  href: string;
  icon: React.ReactNode;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'relative flex min-h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors [&_svg]:stroke-[1.8]',
        active
          ? 'bg-accent/75 text-primary before:absolute before:left-0 before:h-5 before:w-0.5 before:rounded-full before:bg-primary'
          : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
      )}
    >
      {icon}
      <span>{children}</span>
    </Link>
  );
}

function FooterLinks() {
  return (
    <div className="space-y-2.5 border-t border-border/60 p-4 text-xs text-muted-foreground">
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        <Link href="/about" className="inline-flex items-center gap-1 hover:text-foreground">
          <Info className="size-3" /> 关于
        </Link>
        <Link href="/rules" className="hover:text-foreground">
          规则
        </Link>
        <Link href="/help" className="hover:text-foreground">
          帮助
        </Link>
        <Link href="/privacy" className="hover:text-foreground">
          隐私
        </Link>
        <Link href="/contact" className="hover:text-foreground">
          联系
        </Link>
      </div>
      <p className="pt-1 leading-relaxed">
        <span className="inline-flex items-center gap-1 text-foreground/70">
          <MessagesSquare className="size-3 text-primary" /> 浙工商树洞
        </span>
        <br />© 2026 · 仅面向 @pop.zjgsu.edu.cn 学生
      </p>
    </div>
  );
}
