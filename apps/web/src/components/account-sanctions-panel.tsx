'use client';

import * as React from 'react';
import { AlertTriangle, Loader2, Scale } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { listMySanctions, submitAppeal } from '@/lib/api';
import type { MySanction } from '@/types/api';

const TYPE_LABEL: Record<MySanction['type'], string> = {
  warning: '警告',
  mute: '功能限制',
  suspension: '暂停账号',
  ban: '永久封禁',
};

export function AccountSanctionsPanel() {
  const [items, setItems] = React.useState<MySanction[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [reason, setReason] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);

  const load = React.useCallback(() => {
    setLoading(true);
    listMySanctions()
      .then((result) => setItems(result.items))
      .catch((error: unknown) => toast.error((error as Error).message || '处罚记录加载失败'))
      .finally(() => setLoading(false));
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  async function appeal() {
    if (!selectedId || reason.trim().length < 20) return;
    setSubmitting(true);
    try {
      await submitAppeal(selectedId, reason.trim());
      toast.success('申诉已提交，将由管理员复核');
      setSelectedId(null);
      setReason('');
      load();
    } catch (error) {
      toast.error((error as Error).message || '申诉提交失败');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Scale className="size-4" /> 处罚与申诉
        </CardTitle>
        <CardDescription>查看账号处理记录；每条处罚可提交一次有事实依据的申诉</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> 加载中…
          </div>
        ) : items.length === 0 ? (
          <p className="rounded-md bg-muted/40 p-4 text-sm text-muted-foreground">
            当前没有处罚记录。
          </p>
        ) : (
          items.map((item) => (
            <div key={item.id} className="space-y-3 rounded-lg border p-4 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <AlertTriangle className="size-4 text-amber-500" />
                <span className="font-semibold">{TYPE_LABEL[item.type]}</span>
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
                  {item.status === 'active'
                    ? '执行中'
                    : item.status === 'expired'
                      ? '已到期'
                      : '已撤销'}
                </span>
                <span className="ml-auto font-mono text-xs text-muted-foreground">#{item.id}</span>
              </div>
              <p className="whitespace-pre-wrap leading-relaxed">{item.reason}</p>
              {item.appeal ? (
                <div className="rounded-md bg-muted/40 p-3 text-xs">
                  <p>
                    申诉状态：
                    {item.appeal.status === 'pending'
                      ? '等待复核'
                      : item.appeal.status === 'approved'
                        ? '申诉成立'
                        : '维持原处理'}
                  </p>
                  {item.appeal.reviewNote && (
                    <p className="mt-1 text-muted-foreground">
                      复核说明：{item.appeal.reviewNote}
                    </p>
                  )}
                </div>
              ) : item.status !== 'revoked' ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setSelectedId(item.id);
                    setReason('');
                  }}
                >
                  提交申诉
                </Button>
              ) : null}

              {selectedId === item.id && (
                <div className="space-y-2 border-t pt-3">
                  <textarea
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    rows={4}
                    maxLength={2000}
                    placeholder="至少 20 个字，请说明事实、上下文和具体异议"
                    className="w-full resize-y rounded-md border bg-background p-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">{reason.trim().length} / 2000</span>
                    <div className="flex gap-2">
                      <Button size="sm" variant="ghost" onClick={() => setSelectedId(null)}>
                        取消
                      </Button>
                      <Button
                        size="sm"
                        disabled={reason.trim().length < 20 || submitting}
                        onClick={() => void appeal()}
                      >
                        {submitting && <Loader2 className="size-4 animate-spin" />}
                        确认提交
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
