'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { merchantLogin } from '@/lib/api';

export default function MerchantLoginPage() {
  const router = useRouter();
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [error, setError] = React.useState('');
  const [loading, setLoading] = React.useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      await merchantLogin(email.trim(), password);
      router.replace('/');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <section className="w-full max-w-md rounded-3xl border bg-card p-7 shadow-xl shadow-amber-950/5">
        <div className="mb-8">
          <p className="text-sm font-semibold text-primary">浙工商树洞 · 商家后台</p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight">欢迎回来</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            这里是食堂商家运营入口。食堂员工使用邀请账号登录，平台超级管理员也可使用论坛用户名或邮箱登录。
          </p>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <label className="block space-y-1.5 text-sm font-medium">
            工作邮箱或超级管理员用户名
            <input
              type="text"
              required
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="h-11 w-full rounded-xl border bg-background px-3 outline-none focus:ring-2 focus:ring-primary/30"
              placeholder="staff@example.com 或 hezhong233"
            />
          </label>
          <label className="block space-y-1.5 text-sm font-medium">
            密码
            <input
              type="password"
              required
              minLength={8}
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="h-11 w-full rounded-xl border bg-background px-3 outline-none focus:ring-2 focus:ring-primary/30"
            />
          </label>
          {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="h-11 w-full rounded-xl bg-primary font-semibold text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? '登录中…' : '登录商家后台'}
          </button>
        </form>
        <p className="mt-6 text-center text-xs leading-5 text-muted-foreground">
          普通商家账号需要由平台管理员邀请创建。商家后台不会显示论坛帖子、私信或聊天内容。
        </p>
      </section>
    </main>
  );
}
