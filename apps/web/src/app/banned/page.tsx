'use client';

import * as React from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Ban, AlertTriangle } from 'lucide-react';
import { mockLogout } from '@/lib/auth-mock';

export const dynamic = 'force-dynamic';

function BannedContent() {
  const params = useSearchParams();
  const reason = params.get('reason') ?? 'banned';
  const isSuspended = reason === 'suspended';

  function handleLogout() {
    mockLogout();
    window.location.href = '/login';
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-2 text-center">
          <div
            className={`mx-auto flex size-14 items-center justify-center rounded-full ${
              isSuspended ? 'bg-yellow-500/10' : 'bg-destructive/10'
            }`}
          >
            {isSuspended ? (
              <AlertTriangle className="size-7 text-yellow-500" />
            ) : (
              <Ban className="size-7 text-destructive" />
            )}
          </div>
          <CardTitle className="text-xl">
            {isSuspended ? '你的账号已被禁言' : '你的账号已被封禁'}
          </CardTitle>
          <CardDescription className="text-sm leading-relaxed">
            {isSuspended
              ? '在禁言期间你无法发帖、评论、投票和发送私信。如对处理结果有异议,请联系管理员申诉。'
              : '由于违反社区准则,你的账号已被永久封禁,无法访问浙工商树洞。如认为处理有误,请通过校园邮箱联系管理员申诉。'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
            <p className="font-medium text-foreground">申诉方式</p>
            <p className="mt-1">
              发送邮件至 admin@pop.zjgsu.edu.cn,标题注明「账号申诉 - 你的学号」
            </p>
          </div>
          <Button variant="outline" className="w-full" onClick={handleLogout}>
            退出登录
          </Button>
          <Button variant="ghost" className="w-full" asChild>
            <Link href="/help">查看社区准则</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export default function BannedPage() {
  return (
    <React.Suspense fallback={null}>
      <BannedContent />
    </React.Suspense>
  );
}
