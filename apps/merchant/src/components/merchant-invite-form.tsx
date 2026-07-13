'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { acceptMerchantInvitation } from '@/lib/api';

export function MerchantInviteForm({ token }: { token: string }) {
  const router = useRouter();
  const [displayName, setDisplayName] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [accepted, setAccepted] = React.useState(false);
  const [message, setMessage] = React.useState('');
  const [loading, setLoading] = React.useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) {
      setMessage('邀请链接缺少邀请码');
      return;
    }
    setLoading(true);
    setMessage('');
    try {
      await acceptMerchantInvitation({ token, displayName, password, acceptTerms: accepted });
      router.replace('/');
      router.refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '邀请处理失败');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <form
        onSubmit={submit}
        className="w-full max-w-md space-y-5 rounded-3xl border bg-card p-7 shadow-xl shadow-amber-950/5"
      >
        <div>
          <p className="text-sm font-semibold text-primary">食堂商家后台</p>
          <h1 className="mt-2 text-2xl font-bold">接受商家邀请</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            设置后台显示名称和密码。此账号只用于商家后台，不会创建论坛账号。
          </p>
        </div>
        <label className="block space-y-1.5 text-sm font-medium">
          显示名称
          <input
            required
            minLength={2}
            maxLength={80}
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            className="h-11 w-full rounded-xl border bg-background px-3 outline-none focus:ring-2 focus:ring-primary/30"
            placeholder="例如：张师傅"
          />
        </label>
        <label className="block space-y-1.5 text-sm font-medium">
          设置密码
          <input
            required
            minLength={8}
            maxLength={128}
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="h-11 w-full rounded-xl border bg-background px-3 outline-none focus:ring-2 focus:ring-primary/30"
          />
        </label>
        <label className="flex items-start gap-2 text-sm leading-5 text-muted-foreground">
          <input
            type="checkbox"
            checked={accepted}
            onChange={(event) => setAccepted(event.target.checked)}
            className="mt-1 size-4"
          />
          我已阅读并同意商家后台服务条款，理解此账号不能访问校内论坛内容。
        </label>
        {message && (
          <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{message}</p>
        )}
        <button
          type="submit"
          disabled={loading || !accepted}
          className="h-11 w-full rounded-xl bg-primary font-semibold text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? '创建中…' : '创建商家后台账号'}
        </button>
      </form>
    </main>
  );
}
