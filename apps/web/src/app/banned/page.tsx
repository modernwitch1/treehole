'use client';

import * as React from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Ban, Loader2, Scale } from 'lucide-react';
import { mockLogout } from '@/lib/auth-mock';
import { listMySanctions, logout, submitAppeal } from '@/lib/api';
import type { MySanction } from '@/types/api';
import { toast } from 'sonner';

export const dynamic = 'force-dynamic';

const TYPE_LABEL: Record<MySanction['type'], string> = {
  warning: '警告',
  mute: '功能限制',
  suspension: '暂停账号',
  ban: '永久封禁',
};

const STATUS_LABEL: Record<MySanction['status'], string> = {
  active: '执行中',
  expired: '已到期',
  revoked: '已撤销',
};

function BannedContent() {
  const params = useSearchParams();
  const reason = params.get('reason') ?? 'banned';
  const isSuspended = reason === 'suspended';
  const [sanctions, setSanctions] = React.useState<MySanction[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState('');
  const [selected, setSelected] = React.useState<MySanction | null>(null);
  const [appealReason, setAppealReason] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);

  const load = React.useCallback(() => {
    setLoading(true);
    setLoadError('');
    listMySanctions()
      .then((result) => setSanctions(result.items))
      .catch((error: unknown) =>
        setLoadError((error as Error).message || '处罚记录加载失败，请重新登录后再试'),
      )
      .finally(() => setLoading(false));
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  async function handleLogout() {
    try {
      await logout();
    } catch {
      // Cookie clearing in the browser remains the final fallback.
    }
    mockLogout();
    window.location.href = '/login';
  }

  async function handleAppeal() {
    if (!selected || appealReason.trim().length < 20) return;
    setSubmitting(true);
    try {
      const result = await submitAppeal(selected.id, appealReason.trim());
      setSanctions((items) =>
        items.map((item) =>
          item.id === selected.id
            ? {
                ...item,
                appeal: {
                  ...result.appeal,
                  reason: appealReason.trim(),
                  reviewNote: null,
                  reviewedAt: null,
                },
              }
            : item,
        ),
      );
      setSelected(null);
      setAppealReason('');
      toast.success('申诉已提交，将由管理员复核');
    } catch (error) {
      toast.error((error as Error).message || '申诉提交失败');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4 py-10">
      <Card className="w-full max-w-2xl">
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
            {isSuspended ? '你的账号目前处于暂停状态' : '你的账号已被封禁'}
          </CardTitle>
          <CardDescription className="mx-auto max-w-xl text-sm leading-relaxed">
            {isSuspended
              ? '暂停期间无法发布内容、投票或发送私信，但可以查看处罚依据并提交申诉。'
              : '论坛访问权限已停止。使用密码重新登录后，系统只会签发短期申诉凭证，不会恢复论坛访问权限。'}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-5">
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <Scale className="size-4" />
              <h2 className="text-sm font-semibold">处罚记录与申诉</h2>
            </div>

            {loading ? (
              <div className="flex items-center justify-center gap-2 rounded-lg border p-6 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> 加载中…
              </div>
            ) : loadError ? (
              <div className="space-y-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm">
                <p className="text-destructive">{loadError}</p>
                <Button size="sm" variant="outline" asChild>
                  <Link href="/login">重新登录获取申诉权限</Link>
                </Button>
              </div>
            ) : sanctions.length === 0 ? (
              <p className="rounded-lg border p-4 text-sm text-muted-foreground">
                暂未查询到处罚记录。如状态显示有误，请重新登录或联系平台管理员。
              </p>
            ) : (
              <div className="space-y-3">
                {sanctions.map((sanction) => (
                  <div key={sanction.id} className="space-y-3 rounded-lg border p-4 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{TYPE_LABEL[sanction.type]}</span>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
                        {STATUS_LABEL[sanction.status]}
                      </span>
                      <span className="ml-auto font-mono text-xs text-muted-foreground">
                        记录 #{sanction.id}
                      </span>
                    </div>
                    <dl className="grid gap-1 text-xs sm:grid-cols-[5rem_1fr]">
                      <dt className="text-muted-foreground">处理依据</dt>
                      <dd>{sanction.reason}</dd>
                      <dt className="text-muted-foreground">开始时间</dt>
                      <dd>{new Date(sanction.startsAt).toLocaleString('zh-CN')}</dd>
                      <dt className="text-muted-foreground">结束时间</dt>
                      <dd>
                        {sanction.endsAt
                          ? new Date(sanction.endsAt).toLocaleString('zh-CN')
                          : sanction.status === 'revoked'
                            ? '已撤销'
                            : '长期有效'}
                      </dd>
                    </dl>

                    {sanction.appeal ? (
                      <div className="rounded-md bg-muted/50 p-3 text-xs leading-relaxed">
                        <p className="font-medium">
                          申诉状态：
                          {sanction.appeal.status === 'pending'
                            ? '等待复核'
                            : sanction.appeal.status === 'approved'
                              ? '申诉成立'
                              : '维持原处理'}
                        </p>
                        {sanction.appeal.reviewNote && (
                          <p className="mt-1 text-muted-foreground">
                            复核说明：{sanction.appeal.reviewNote}
                          </p>
                        )}
                      </div>
                    ) : sanction.status !== 'revoked' ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setSelected(sanction);
                          setAppealReason('');
                        }}
                      >
                        对此记录提出申诉
                      </Button>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </section>

          {selected && (
            <section className="space-y-3 rounded-lg border border-primary/30 bg-primary/5 p-4">
              <div>
                <h2 className="text-sm font-semibold">申诉处罚 #{selected.id}</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  请说明事实、上下文和你认为处理有误的具体原因。每条处罚只能提交一次申诉。
                </p>
              </div>
              <textarea
                value={appealReason}
                onChange={(event) => setAppealReason(event.target.value)}
                rows={5}
                maxLength={2000}
                placeholder="至少 20 个字；可提供时间、上下文和可核验信息"
                className="w-full resize-y rounded-md border bg-background p-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-muted-foreground">
                  {appealReason.trim().length} / 2000
                </span>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setSelected(null)}>
                    取消
                  </Button>
                  <Button
                    size="sm"
                    disabled={appealReason.trim().length < 20 || submitting}
                    onClick={() => void handleAppeal()}
                  >
                    {submitting && <Loader2 className="size-4 animate-spin" />}
                    提交申诉
                  </Button>
                </div>
              </div>
            </section>
          )}

          <div className="rounded-md bg-muted/50 p-3 text-xs leading-relaxed text-muted-foreground">
            申诉不会自动解除处罚。复核人员会查看原内容、规则命中、举报证据和处理记录；紧急安全或法律问题请同时联系学校相关部门或有权机关。
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <Button variant="outline" onClick={() => void handleLogout()}>
              退出登录
            </Button>
            <Button variant="ghost" asChild>
              <Link href="/community-rules">查看社区规则</Link>
            </Button>
          </div>
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
