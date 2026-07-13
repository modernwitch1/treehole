'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  Hourglass,
  KeyRound,
  Loader2,
  ShieldCheck,
  UserRound,
  XCircle,
} from 'lucide-react';
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
    <Card className="overflow-hidden rounded-3xl border-border/60 bg-card/90 shadow-[0_24px_70px_-32px_rgba(15,23,42,0.45)] backdrop-blur-xl">
      <div className="h-1 bg-gradient-to-r from-primary via-orange-400 to-sky-400" />
      <CardHeader className="space-y-4 px-6 pb-5 pt-7 sm:px-8 sm:pt-8">
        <div className="inline-flex w-fit items-center gap-2 rounded-full border border-primary/15 bg-primary/[0.07] px-3 py-1.5 text-xs font-medium text-primary">
          <span className="size-1.5 rounded-full bg-emerald-500" />
          ZJGSU · CAMPUS COMMUNITY
        </div>
        <div>
          <CardTitle className="text-3xl tracking-[-0.04em]">欢迎回到树洞</CardTitle>
          <CardDescription className="mt-2 leading-6">
            登录后继续和同学分享校园里的每一件小事
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="px-6 pb-7 sm:px-8 sm:pb-8">
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="studentId">学号</Label>
            <div className="relative">
              <UserRound className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="studentId"
                value={studentId}
                onChange={(e) => {
                  setStudentId(e.target.value);
                  setRegStatus(null);
                }}
                placeholder="请输入学号"
                className="h-12 rounded-xl bg-muted/25 pl-10 shadow-none"
                required
              />
            </div>
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
            <div className="relative">
              <KeyRound className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setRegStatus(null);
                }}
                placeholder="请输入登录密码"
                className="h-12 rounded-xl bg-muted/25 pl-10 shadow-none"
                required
              />
            </div>
          </div>
          <Button
            type="submit"
            className="h-12 w-full rounded-xl bg-primary text-base font-semibold shadow-lg shadow-primary/20 transition-transform hover:shadow-primary/30 active:scale-[0.99]"
            disabled={checking}
          >
            {checking ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                查询中…
              </>
            ) : (
              <>
                登录
                <ArrowRight className="size-4" />
              </>
            )}
          </Button>
        </form>

        <div className="mt-5 flex items-start gap-2.5 rounded-2xl bg-muted/45 p-3.5 text-xs leading-5 text-muted-foreground">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
          <p>
            校园邮箱用于身份验证，帖子和评论默认匿名展示。请和大家一起维护友善、安全的校园社区。
          </p>
        </div>

        {regStatus && cfg && (
          <div
            className={cn(
              'mt-4 space-y-2 rounded-2xl border p-4',
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
          还没有账号？{' '}
          <Link href="/register" className="font-medium text-foreground hover:underline">
            注册
          </Link>
        </p>
        <p className="mt-3 text-center text-xs text-muted-foreground/75">
          <Link href="/community-rules" className="hover:text-foreground hover:underline">
            社区规则
          </Link>
          <span className="mx-2">·</span>
          学生专属 · 非官方平台
        </p>
      </CardContent>
    </Card>
  );
}
