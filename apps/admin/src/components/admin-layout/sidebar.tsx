'use client';

import * as React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Users,
  Flag,
  FileText,
  ScrollText,
  Filter,
  Settings,
  UserPlus,
  ChevronLeft,
  ExternalLink,
  MessageSquare,
  Megaphone,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { WEB_APP_URL } from '@/lib/site-urls';
import { Badge } from '@/components/ui/badge';
import type { AdminStats } from '@/types/admin';

interface SidebarProps {
  stats?: Pick<AdminStats, 'openReports' | 'pendingRegistrations'>;
}

interface NavItemDef {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badgeKey?: 'openReports' | 'pendingRegistrations';
}

interface NavGroupDef {
  label: string;
  items: NavItemDef[];
}

const NAV_GROUPS: NavGroupDef[] = [
  {
    label: '总览',
    items: [{ href: '/', label: '仪表盘', icon: LayoutDashboard }],
  },
  {
    label: '审核工作台',
    items: [
      { href: '/registrations', label: '注册审批', icon: UserPlus, badgeKey: 'pendingRegistrations' },
      { href: '/reports', label: '举报队列', icon: Flag, badgeKey: 'openReports' },
      { href: '/content', label: '内容管理', icon: FileText },
      { href: '/chatrooms', label: '聊天房监控', icon: MessageSquare },
    ],
  },
  {
    label: '用户与规则',
    items: [
      { href: '/users', label: '用户管理', icon: Users },
      { href: '/sensitive-words', label: '敏感词库', icon: Filter },
    ],
  },
  {
    label: '系统',
    items: [
      { href: '/settings', label: '通知与设置', icon: Settings },
      { href: '/audit-logs', label: '审计日志', icon: ScrollText },
    ],
  },
];

export function AdminSidebar({ stats }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside className="hidden h-screen w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar md:flex">
      {/* Brand */}
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-sidebar-border px-4">
        <Image
          src="/logo.webp"
          alt="浙工商树洞"
          width={28}
          height={28}
          priority
          className="size-7 shrink-0 select-none"
        />
        <div className="flex flex-col leading-tight">
          <span className="text-sm font-semibold">浙工商树洞</span>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Admin Console
          </span>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-4 overflow-y-auto p-2">
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className="space-y-0.5">
            <div className="px-3 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
              {group.label}
            </div>
            {group.items.map(({ href, label, icon: Icon, badgeKey }) => {
              const active = pathname === href || (href !== '/' && pathname.startsWith(href));
              const badge = badgeKey ? stats?.[badgeKey] : undefined;
              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    'group flex h-9 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors',
                    active
                      ? 'bg-primary/15 text-primary'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                  )}
                >
                  <Icon className={cn('size-4 shrink-0', active && 'text-primary')} />
                  <span className="flex-1">{label}</span>
                  {badge !== undefined && badge > 0 && (
                    <Badge
                      variant={active ? 'default' : 'destructive'}
                      className="h-5 min-w-5 justify-center px-1.5"
                    >
                      {badge > 99 ? '99+' : badge}
                    </Badge>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="space-y-1 border-t border-sidebar-border p-2">
        <Link
          href="/settings"
          className="group flex h-9 items-center gap-3 rounded-md px-3 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          <Megaphone className="size-4" />
          <span className="flex-1">发布全站通知</span>
        </Link>
        <Link
          href={WEB_APP_URL}
          target="_blank"
          rel="noopener"
          className="group flex h-9 items-center gap-3 rounded-md px-3 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          <ChevronLeft className="size-4" />
          <span className="flex-1">返回论坛</span>
          <ExternalLink className="size-3 opacity-60" />
        </Link>
      </div>
    </aside>
  );
}
