'use client';

import * as React from 'react';
import Link from 'next/link';
import { BrandMark } from '@/components/brand-mark';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, CheckCircle2, Mail } from 'lucide-react';
import { requestPasswordReset } from '@/lib/api';
import { toast } from 'sonner';

export default function ForgotPasswordPage() {
  const [email, setEmail] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const [done, setDone] = React.useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setSubmitting(true);
    try {
      await requestPasswordReset(email.trim());
      setDone(true);
    } catch (err) {
      toast.error((err as Error).message || '发送失败');
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <Card className="border-border/60 shadow-card">
        <CardHeader className="space-y-2 text-center">
        <BrandMark className="mx-auto size-12 lg:hidden" />
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-green-500/10">
            <CheckCircle2 className="size-6 text-green-500" />
          </div>
          <CardTitle className="text-xl tracking-tight">邮件已发送</CardTitle>
          <CardDescription>
            如果 <span className="font-medium">{email}</span>{' '}
            已注册,我们会向它发送一封密码重置链接,请查收。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button
            className="w-full"
            variant="outline"
            onClick={() => {
              setDone(false);
              setEmail('');
            }}
          >
            更换邮箱
          </Button>
          <Button className="w-full" asChild>
            <Link href="/login">返回登录</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/60 shadow-card">
      <CardHeader className="space-y-2 text-center">
        <BrandMark className="mx-auto size-12 lg:hidden" />
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-muted">
          <Mail className="size-6 text-muted-foreground" />
        </div>
        <CardTitle className="text-xl tracking-tight">忘记密码</CardTitle>
        <CardDescription>输入注册时使用的校园邮箱,我们会发送重置链接</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">校园邮箱</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="20231234001@pop.zjgsu.edu.cn"
              required
            />
          </div>
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting && <Loader2 className="mr-2 size-4 animate-spin" />}
            {submitting ? '发送中…' : '发送重置链接'}
          </Button>
        </form>
        <p className="mt-6 text-center text-sm text-muted-foreground">
          想起密码了?{' '}
          <Link href="/login" className="font-medium text-foreground hover:underline">
            登录
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
