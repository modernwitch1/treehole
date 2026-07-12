'use client';

import * as React from 'react';
import Link from 'next/link';
import { BrandMark } from '@/components/brand-mark';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Clock, CheckCircle2, XCircle, AlertTriangle, Hourglass } from 'lucide-react';
import { login } from '@/lib/api';
import { mockLogin } from '@/lib/auth-mock';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import type { RegistrationStatus } from '@/types/api';

const STATUS_CONFIG: Record<
  RegistrationStatus,
  { icon: React.ComponentType<{ className?: string }>; label: string; color: string; desc: string }
> = {
  not_registered: {
    icon: AlertTriangle,
    label: '未注册',
    color: 'text-muted-foreground',
    desc: '该学号尚未注册账号',
  },
  pending: {
    icon: Hourglass,
    label: '审核中',
    color: 'text-yellow-500',
    desc: '你的注册申请正在等待管理员审批',
  },
  approved: {
    icon: CheckCircle2,
    label: '已通过',
    color: 'text-green-500',
    desc: '注册申请已通过,你可以登录了',
  },
  rejected: { icon: XCircle, label: '已拒绝', color: 'text-red-500', desc: '注册申请被拒绝' },
  expired: {
    icon: Clock,
    label: '已过期',
    color: 'text-orange-500',
    desc: '注册申请已过期,请重新提交',
  },
  banned: {
    icon: AlertTriangle,
    label: '账号已封禁',
    color: 'text-destructive',
    desc: '你仍可查看处罚记录并通过受限入口提交申诉',
  },
};
const USE_MOCK = process.env.NEXT_PUBLIC_USE_MOCK === 'true';

export default function LoginPage() {
  const router = useRouter();
  const [studentId, setStudentId] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [checking, setChecking] = React.useState(false);
  const [regStatus, setRegStatus] = React.useState<RegistrationStatus | null>(null);
  const [regMessage, setRegMessage] = React.useState('');
  const [regNote, setRegNote] = React.useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!studentId.trim() || !password.trim()) {
      toast.error('请填写学号和密码');
      return;
    }
    setChecking(true);
    setRegStatus(null);
    try {
      const result = await login(studentId.trim(), password);
      setRegStatus(result.status);
      setRegMessage(result.message ?? '');
      setRegNote(result.request?.reviewNote ?? '');
      if (result.status === 'approved') {
        if (USE_MOCK) {
          mockLogin();
        }
        toast.success('登录成功!');
        router.push('/');
        router.refresh();
      } else if (result.status === 'banned') {
        router.push('/banned?reason=banned');
        router.refresh();
      }
    } catch (err) {
      toast.error((err as Error).message || '查询失败,请重试');
    } finally {
      setChecking(false);
    }
  }

  const cfg = regStatus ? STATUS_CONFIG[regStatus] : null;

  return (
    <Card className="border-border/60 shadow-card">
      <CardHeader className="space-y-2 text-center">
        <BrandMark className="mx-auto size-12 lg:hidden" />
        <CardTitle className="text-2xl tracking-tight">欢迎回来</CardTitle>
        <CardDescription>输入学号和密码登录浙工商树洞</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="studentId">学号</Label>
            <Input
              id="studentId"
              value={studentId}
              onChange={(e) => {
                setStudentId(e.target.value);
                setRegStatus(null);
              }}
              placeholder="20231234001"
              required
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">密码</Label>
              <Link
                href="/forgot-password"
                className="text-xs text-muted-foreground hover:text-foreground hover:underline"
              >
                忘记密码?
              </Link>
            </div>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setRegStatus(null);
              }}
              required
            />
          </div>
          <Button type="submit" className="w-full" disabled={checking}>
            {checking && <Loader2 className="mr-2 size-4 animate-spin" />}
            {checking ? '查询中…' : '登录'}
          </Button>
        </form>

        {regStatus && cfg && (
          <div
            className={cn(
              'mt-4 rounded-lg border p-4 space-y-2',
              regStatus === 'approved' ? 'border-green-500/30 bg-green-500/5' : 'bg-muted/50',
            )}
          >
            <div className="flex items-center gap-2">
              <cfg.icon className={cn('size-5', cfg.color)} />
              <span className={cn('text-sm font-medium', cfg.color)}>{cfg.label}</span>
            </div>
            <p className="text-sm text-muted-foreground">{regMessage || cfg.desc}</p>
            {regNote && (
              <p className="text-sm text-muted-foreground">
                <span className="font-medium">管理员备注：</span>
                {regNote}
              </p>
            )}
            {(regStatus === 'not_registered' || regStatus === 'expired') && (
              <Button size="sm" className="mt-1" asChild>
                <Link href="/register">立即注册</Link>
              </Button>
            )}
            {regStatus === 'rejected' && (
              <Button size="sm" variant="outline" className="mt-1" asChild>
                <Link href="/register">重新提交申请</Link>
              </Button>
            )}
          </div>
        )}

        <p className="mt-6 text-center text-sm text-muted-foreground">
          还没有账号?{' '}
          <Link href="/register" className="font-medium text-foreground hover:underline">
            注册
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
