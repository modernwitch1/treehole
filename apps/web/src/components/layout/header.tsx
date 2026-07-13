'use client';

import * as React from 'react';
import Link from 'next/link';
import { BrandMark } from '@/components/brand-mark';
import {
  Bell,
  CheckCheck,
  Loader2,
  MessageSquarePlus,
  Menu,
  Search,
  LogOut,
  Settings,
  Inbox,
  Home,
  Layers3,
  TrendingUp,
  Compass,
  MessageSquare,
  Utensils,
  X,
} from 'lucide-react';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useRouter, usePathname } from 'next/navigation';
import { mockLogout } from '@/lib/auth-mock';
import {
  listNotifications,
  logout,
  markAllNotificationsRead,
  markNotificationRead,
} from '@/lib/api';
import { relativeTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { CurrentUser, NotificationItem } from '@/types/api';
import { toast } from 'sonner';

interface HeaderProps {
  currentUser: CurrentUser | null;
}

const MOBILE_NAV = [
  { href: '/', label: '首页', icon: Home },
  { href: '/explore', label: '全部帖子', icon: Layers3 },
  { href: '/popular', label: '热门', icon: TrendingUp },
  { href: '/compass', label: '选课指南针', icon: Compass },
  { href: '/chatrooms', label: '在线聊天房', icon: MessageSquare },
  { href: '/food', label: '美食模块', icon: Utensils },
  { href: '/messages', label: '我的私信', icon: Inbox },
  { href: '/settings', label: '设置', icon: Settings },
];

export function Header({ currentUser }: HeaderProps) {
  const [mobileNavOpen, setMobileNavOpen] = React.useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = React.useState(false);
  const pathname = usePathname();

  // 路由切换时自动关闭移动端抽屉
  React.useEffect(() => {
    setMobileNavOpen(false);
    setMobileSearchOpen(false);
  }, [pathname]);

  return (
    <Dialog open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
      <header className="sticky top-0 z-40 h-[4.25rem] border-b border-border/80 bg-background/95 shadow-[0_1px_12px_rgba(25,50,45,0.05)] [&_svg]:stroke-[1.8]">
        <div className="flex h-full w-full items-center gap-1 px-2 sm:gap-2 sm:px-4 lg:px-6">
          <DialogTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0 lg:hidden"
              aria-label="打开主导航"
            >
              <Menu className="size-5" />
            </Button>
          </DialogTrigger>

          <Link
            href="/"
            className="flex shrink-0 items-center gap-2 rounded-xl px-1.5 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="浙工商树洞首页"
          >
            <BrandMark className="size-9" />
            <span className="hidden text-lg font-bold tracking-[-0.025em] sm:inline-block">
              浙工商树洞
            </span>
          </Link>

          <div className="mx-2 hidden flex-1 md:mx-6 md:flex md:max-w-2xl">
            <SearchBar />
          </div>

          <Button
            variant="ghost"
            size="icon"
            className="ml-auto shrink-0 md:hidden"
            onClick={() => setMobileSearchOpen((open) => !open)}
            aria-label={mobileSearchOpen ? '关闭搜索' : '打开搜索'}
            aria-expanded={mobileSearchOpen}
            aria-controls="mobile-site-search"
          >
            <Search className="size-5" />
          </Button>

          <div className="flex shrink-0 items-center gap-0.5 md:ml-auto sm:gap-1">
            {currentUser ? (
              <>
                <>
                  <Button
                    asChild
                    variant="ghost"
                    size="sm"
                    className="hidden rounded-full sm:inline-flex lg:hidden"
                  >
                    <Link href="/submit">
                      <MessageSquarePlus className="size-4" />
                      <span className="hidden lg:inline">发帖</span>
                    </Link>
                  </Button>

                  <Button
                    asChild
                    variant="ghost"
                    size="icon"
                    className="sm:hidden"
                    aria-label="发帖"
                  >
                    <Link href="/submit">
                      <MessageSquarePlus className="size-5" />
                    </Link>
                  </Button>

                  <Button
                    variant="ghost"
                    size="icon"
                    className="relative"
                    asChild
                    aria-label={
                      currentUser.unreadConversations > 0
                        ? `私信，${currentUser.unreadConversations} 条未读`
                        : '私信'
                    }
                  >
                    <Link href="/messages">
                      <Inbox className="size-[1.1rem]" />
                      {currentUser.unreadConversations > 0 && (
                        <Badge
                          variant="default"
                          className="absolute -right-0.5 -top-0.5 h-4 min-w-4 px-1 py-0 text-[10px] leading-none"
                        >
                          {currentUser.unreadConversations > 9
                            ? '9+'
                            : currentUser.unreadConversations}
                        </Badge>
                      )}
                    </Link>
                  </Button>

                  <NotificationBell initialUnreadCount={currentUser.unreadNotifications} />
                </>

                <span className="hidden sm:block">
                  <ThemeToggle />
                </span>

                <UserMenu user={currentUser} />
              </>
            ) : (
              <>
                <span className="hidden sm:block">
                  <ThemeToggle />
                </span>
                <Button asChild variant="ghost" size="sm">
                  <Link href="/login">登录</Link>
                </Button>
                <Button asChild size="sm">
                  <Link href="/register">注册</Link>
                </Button>
              </>
            )}
          </div>
        </div>

        {mobileSearchOpen && (
          <div
            id="mobile-site-search"
            className="absolute inset-x-0 top-full border-b border-border/80 bg-background p-3 shadow-lg md:hidden"
          >
            <div className="mx-auto flex max-w-lg items-center gap-2">
              <SearchBar autoFocus onSubmitted={() => setMobileSearchOpen(false)} />
              <Button
                variant="ghost"
                size="icon"
                className="shrink-0"
                onClick={() => setMobileSearchOpen(false)}
                aria-label="关闭搜索"
              >
                <X className="size-5" />
              </Button>
            </div>
          </div>
        )}
      </header>

      <DialogContent className="left-0 top-0 flex h-[100dvh] max-h-none w-[min(20rem,88vw)] max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-y-0 border-l-0 p-0 lg:hidden">
        <DialogHeader className="border-b border-border/80 px-4 py-4 text-left">
          <DialogTitle className="flex items-center gap-2.5 text-base">
            <BrandMark className="size-9" />
            浙工商树洞
          </DialogTitle>
          <DialogDescription className="sr-only">移动端主导航</DialogDescription>
        </DialogHeader>
        <nav aria-label="主导航" className="flex flex-1 flex-col gap-1 overflow-y-auto p-3">
          <Button asChild className="mb-3 w-full justify-center rounded-xl">
            <Link href="/submit">
              <MessageSquarePlus className="size-4" />
              发布帖子
            </Link>
          </Button>
          {MOBILE_NAV.map(({ href, label, icon: Icon }) => {
            const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors [&_svg]:stroke-[1.8]',
                  active
                    ? 'bg-primary/10 text-primary shadow-sm ring-1 ring-primary/10'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                )}
              >
                <Icon className="size-[1.125rem]" />
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-border/80 bg-muted/30 p-4">
          <div className="mb-3 flex items-center justify-between text-sm">
            <span className="text-muted-foreground">显示模式</span>
            <ThemeToggle />
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            © 2026 浙工商树洞
            <br />
            仅面向 @pop.zjgsu.edu.cn 学生
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function NotificationBell({ initialUnreadCount }: { initialUnreadCount: number }) {
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [items, setItems] = React.useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = React.useState(initialUnreadCount);
  const loadedRef = React.useRef(false);

  async function load() {
    setLoading(true);
    try {
      const page = await listNotifications();
      setItems(page.items);
      setUnreadCount(page.unreadCount);
      loadedRef.current = true;
    } catch (error) {
      toast.error((error as Error).message || '通知加载失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  }

  async function markRead(id: string) {
    const previousItems = items;
    const target = previousItems.find((item) => item.id === id);
    if (!target || target.readAt) return;
    const now = new Date().toISOString();
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, readAt: now } : item)),
    );
    setUnreadCount((count) => Math.max(0, count - 1));
    try {
      await markNotificationRead(id);
    } catch (error) {
      setItems(previousItems);
      setUnreadCount((count) => count + 1);
      toast.error((error as Error).message || '通知状态更新失败');
    }
  }

  async function markAllRead() {
    if (unreadCount === 0) return;
    const previousItems = items;
    const previousUnreadCount = unreadCount;
    const now = new Date().toISOString();
    setItems((current) => current.map((item) => ({ ...item, readAt: item.readAt ?? now })));
    setUnreadCount(0);
    try {
      await markAllNotificationsRead();
    } catch (error) {
      setItems(previousItems);
      setUnreadCount(previousUnreadCount);
      toast.error((error as Error).message || '通知状态更新失败');
    }
  }

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next && !loadedRef.current) void load();
      }}
    >
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={unreadCount > 0 ? `通知，${unreadCount} 条未读` : '通知'}
        >
          <Bell className="size-[1.1rem]" />
          {unreadCount > 0 && (
            <Badge
              variant="default"
              className="absolute -right-0.5 -top-0.5 h-4 min-w-4 px-1 py-0 text-[10px] leading-none"
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-[min(22rem,calc(100vw-1rem))] rounded-xl border-border/80 p-1.5 shadow-xl [&_svg]:stroke-[1.8]"
      >
        <div className="flex items-center justify-between px-2 py-1.5">
          <DropdownMenuLabel className="p-0">通知</DropdownMenuLabel>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2"
            onClick={() => void markAllRead()}
            disabled={unreadCount === 0}
          >
            <CheckCheck className="size-3.5" /> 全部已读
          </Button>
        </div>
        <DropdownMenuSeparator />
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> 加载中…
          </div>
        ) : items.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">暂无通知</div>
        ) : (
          <div className="max-h-[420px] overflow-y-auto py-1">
            {items.map((item) => (
              <DropdownMenuItem key={item.id} asChild className="cursor-pointer p-0">
                <a
                  href={item.linkUrl ?? '#'}
                  onClick={(event) => {
                    if (!item.linkUrl) event.preventDefault();
                    void markRead(item.id);
                  }}
                  className="block w-full px-3 py-2.5"
                >
                  <div className="flex items-start gap-2">
                    <span
                      className={cn(
                        'mt-1 size-2 shrink-0 rounded-full',
                        item.readAt ? 'bg-transparent' : 'bg-primary',
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-1 text-sm font-medium">{item.title}</p>
                      <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                        {item.body}
                      </p>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {relativeTime(item.createdAt)}
                      </p>
                    </div>
                  </div>
                </a>
              </DropdownMenuItem>
            ))}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SearchBar({ autoFocus, onSubmitted }: { autoFocus?: boolean; onSubmitted?: () => void }) {
  const router = useRouter();
  const [value, setValue] = React.useState('');

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const q = value.trim();
    router.push(q ? `/explore?q=${encodeURIComponent(q)}` : '/explore');
    onSubmitted?.();
  }

  return (
    <form onSubmit={submit} role="search" className="relative flex-1">
      <label htmlFor={autoFocus ? 'mobile-search-input' : 'site-search-input'} className="sr-only">
        搜索帖子
      </label>
      <Search className="pointer-events-none absolute left-3.5 top-1/2 size-[1.1rem] -translate-y-1/2 text-primary/80 stroke-[1.8]" />
      <Input
        id={autoFocus ? 'mobile-search-input' : 'site-search-input'}
        type="search"
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="搜索帖子、话题或板块…"
        className="h-11 rounded-xl border-border/80 bg-card pl-10 pr-4 shadow-sm ring-1 ring-primary/10 transition-[border-color,box-shadow] duration-150 hover:border-primary/30 focus-visible:border-primary focus-visible:bg-card focus-visible:ring-2 focus-visible:ring-primary/20"
      />
    </form>
  );
}

function UserMenu({ user }: { user: CurrentUser }) {
  const router = useRouter();

  async function handleLogout() {
    mockLogout();
    await logout().catch(() => {});
    router.push('/login');
    router.refresh();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="rounded-full"
          aria-label={`打开 ${user.username} 的账户菜单`}
        >
          <Avatar className="size-8 ring-2 ring-background shadow-sm">
            <AvatarImage src={user.avatarUrl} alt={user.username} />
            <AvatarFallback>{user.username[0]}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-medium">{user.username}</span>
            <span className="truncate text-xs text-muted-foreground">{user.email}</span>
            <span className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">
              仅本人可见 · 在论坛中完全匿名
            </span>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/messages">
            <Inbox /> 我的私信
            {user.unreadConversations > 0 && (
              <Badge variant="default" className="ml-auto h-4 px-1.5 text-[10px]">
                {user.unreadConversations}
              </Badge>
            )}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/settings">
            <Settings /> 设置
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-destructive focus:text-destructive"
          onClick={handleLogout}
        >
          <LogOut /> 退出登录
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
