'use client';

import * as React from 'react';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { AdminSidebar } from '@/components/admin-layout/sidebar';
import { AdminTopbar } from '@/components/admin-layout/topbar';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Lock } from 'lucide-react';
import { getCurrentAdmin, getStats, adminLogin, adminLogout } from '@/lib/api';
import type { AdminCurrentUser, AdminStats } from '@/types/admin';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<AdminCurrentUser | null>(null);
  const [stats, setStats] = React.useState<
    Pick<AdminStats, 'openReports' | 'pendingRegistrations'> | undefined
  >(undefined);
  const [loading, setLoading] = React.useState(true);
  const pathname = usePathname();

  const checkAuth = React.useCallback(async () => {
    setLoading(true);
    try {
      const u = await getCurrentAdmin();
      if (u) {
        setUser(u);
      }
    } catch {
      // 未认证
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshStats = React.useCallback(() => {
    getStats()
      .then((s) => setStats(s))
      .catch(() => {});
  }, []);

  React.useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  // 每次路由变更后重算 sidebar 角标，确保 admin 操作完跳页面立刻反映
  React.useEffect(() => {
    if (user) refreshStats();
  }, [user, pathname, refreshStats]);

  async function handleLogout() {
    await adminLogout().catch(() => {});
    setUser(null);
    setStats(undefined);
  }

  // ===== 登录表单 =====
  if (!loading && !user) {
    return <LoginForm onLoggedIn={checkAuth} />;
  }

  // ===== 加载中 =====
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // ===== 管理员后台 =====
  return (
    <div className="flex h-screen overflow-hidden">
      <AdminSidebar stats={stats} />
      <div className="flex min-w-0 flex-1 flex-col">
        <AdminTopbar user={user!} onLogout={handleLogout} />
        <main className="min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-7xl p-4 sm:p-6 lg:p-8">{children}</div>
        </main>
      </div>
    </div>
  );
}

function LoginForm({ onLoggedIn }: { onLoggedIn: () => void }) {
  const [username, setUsername] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [totpCode, setTotpCode] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim() || !password.trim()) return;
    setSubmitting(true);
    setError('');
    try {
      await adminLogin(username.trim(), password, totpCode.trim() || undefined);
      onLoggedIn();
    } catch (err) {
      setError((err as Error).message || '登录失败');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-stretch bg-background">
      {/* 左侧品牌/安全提示面板 — 桌面端可见 */}
      <div className="relative hidden w-1/2 shrink-0 overflow-hidden bg-gradient-to-br from-primary/15 via-background to-background lg:block">
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              'radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)',
            backgroundSize: '22px 22px',
          }}
        />
        <div className="relative z-10 flex h-full flex-col justify-between p-10 xl:p-14">
          <div className="flex items-center gap-2">
            <Image
              src="/logo.webp"
              alt="浙工商树洞"
              width={36}
              height={36}
              priority
              className="size-9 shrink-0 select-none"
            />
            <div className="leading-tight">
              <p className="text-base font-semibold">浙工商树洞</p>
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                Admin Console
              </p>
            </div>
          </div>

          <div className="space-y-5">
            <h1 className="max-w-md text-3xl font-bold leading-tight tracking-tight xl:text-4xl">
              管理控制台
            </h1>
            <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
              这里是浙工商树洞的运营中枢。所有操作都会被完整写入审计日志，请谨慎使用每一项权限。
            </p>
            <ul className="space-y-2.5 text-sm">
              {[
                '所有管理动作永久可追溯',
                '敏感操作需二次验证',
                '逆匿名溯源仅限违规处置',
              ].map((tip) => (
                <li key={tip} className="flex items-center gap-2.5 text-muted-foreground">
                  <span className="flex size-5 items-center justify-center rounded-full bg-primary/15">
                    <Lock className="size-3 text-primary" />
                  </span>
                  {tip}
                </li>
              ))}
            </ul>
          </div>

          <p className="text-xs text-muted-foreground">
            © 2026 浙工商树洞 · 仅授权人员可访问
          </p>
        </div>
      </div>

      {/* 右侧登录表单 */}
      <div className="relative flex w-full items-center justify-center px-4 py-12 lg:w-1/2">
        <div className="w-full max-w-sm animate-in fade-in slide-in-from-bottom-2 duration-500">
          {/* 移动端 logo */}
          <div className="mb-6 flex items-center justify-center gap-2 lg:hidden">
            <Image
              src="/logo.webp"
              alt="浙工商树洞"
              width={36}
              height={36}
              priority
              className="size-9 select-none"
            />
            <div className="leading-tight">
              <p className="text-base font-semibold">浙工商树洞</p>
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                Admin Console
              </p>
            </div>
          </div>

          <Card className="border-border/60 shadow-card">
            <CardHeader className="space-y-2 text-center">
              <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-primary/10">
                <Lock className="size-6 text-primary" />
              </div>
              <CardTitle className="text-xl tracking-tight">管理员登录</CardTitle>
              <CardDescription>输入管理员账号密码与二次验证码</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="admin-username">账号</Label>
                  <Input
                    id="admin-username"
                    value={username}
                    onChange={(e) => {
                      setUsername(e.target.value);
                      setError('');
                    }}
                    placeholder="管理员账号"
                    autoFocus
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="admin-password">密码</Label>
                  <Input
                    id="admin-password"
                    type="password"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      setError('');
                    }}
                    placeholder="管理员密码"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="admin-totp">二次验证码</Label>
                  <Input
                    id="admin-totp"
                    value={totpCode}
                    onChange={(e) => {
                      setTotpCode(e.target.value);
                      setError('');
                    }}
                    placeholder="6 位动态验证码（TOTP）"
                    inputMode="numeric"
                    maxLength={6}
                    className="tracking-[0.3em]"
                  />
                </div>
                {error && (
                  <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                    {error}
                  </div>
                )}
                <Button type="submit" className="w-full" disabled={submitting}>
                  {submitting && <Loader2 className="mr-2 size-4 animate-spin" />}
                  {submitting ? '登录中…' : '登录'}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
