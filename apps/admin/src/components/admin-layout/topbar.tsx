'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Search, LogOut, User as UserIcon, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { ThemeToggle } from '@/components/theme-toggle';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { WEB_APP_URL } from '@/lib/site-urls';
import type { AdminCurrentUser } from '@/types/admin';

interface TopbarProps {
  user: AdminCurrentUser;
  title?: string;
  onLogout?: () => void;
}

const PAGE_TITLES: Record<string, string> = {
  '/': '仪表盘',
  '/users': '用户管理',
  '/registrations': '注册审批',
  '/reports': '举报队列',
  '/content': '内容管理',
  '/chatrooms': '聊天房监控',
  '/audit-logs': '审计日志',
  '/sensitive-words': '敏感词库',
  '/settings': '通知与设置',
  '/moderation': '统一审核案件',
  '/uploads': '图片待审',
  '/appeals': '处罚申诉',
  '/boards': '板块申请',
  '/trace': '私信溯源中心',
};

const ROLE_LABEL: Record<AdminCurrentUser['role'], string> = {
  superadmin: '超级管理员',
  admin: '管理员',
  moderator: '版主',
};

function resolveTitle(pathname: string): string {
  if (PAGE_TITLES[pathname]) return PAGE_TITLES[pathname];
  // 兜底：取第一段做匹配
  const seg = '/' + (pathname.split('/')[1] ?? '');
  return PAGE_TITLES[seg] ?? '管理后台';
}

export function AdminTopbar({ user, title, onLogout }: TopbarProps) {
  const pathname = usePathname();
  const pageTitle = title ?? resolveTitle(pathname);

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur-lg lg:px-6">
      {/* 面包屑 */}
      <div className="flex min-w-0 items-center gap-2 text-sm">
        <span className="hidden text-muted-foreground sm:inline">后台</span>
        <ChevronRight className="hidden size-3.5 shrink-0 text-muted-foreground/60 sm:inline" />
        <h1 className="truncate text-base font-semibold tracking-tight">{pageTitle}</h1>
      </div>

      {/* 搜索 — 占位提示用户在对应页面使用页内筛选 */}
      <div className="relative ml-auto hidden w-64 max-w-md md:block">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input type="search" placeholder="在各页面使用页内筛选搜索…" className="h-9 pl-8" disabled />
      </div>

      <div className="ml-auto flex items-center gap-1 md:ml-0">
        <Badge variant="warning" className="hidden sm:inline-flex">
          {ROLE_LABEL[user.role]}
        </Badge>
        <ThemeToggle />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-9 gap-2 px-2">
              <Avatar className="size-7">
                <AvatarImage src={user.avatarUrl} alt={user.username} />
                <AvatarFallback>{user.username[0]}</AvatarFallback>
              </Avatar>
              <span className="hidden text-sm font-medium md:inline">{user.username}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <div className="flex flex-col">
                <span className="text-sm font-medium">{user.username}</span>
                <span className="truncate text-xs text-muted-foreground">{user.email}</span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href={WEB_APP_URL} target="_blank">
                <UserIcon /> 我的论坛主页
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => onLogout?.()}
            >
              <LogOut /> 退出登录
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
