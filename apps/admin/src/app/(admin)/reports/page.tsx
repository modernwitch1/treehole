'use client';

import * as React from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Flag } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ReportCard } from '@/components/report-card';
import { Pagination } from '@/components/pagination';
import { listReports } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { AdminReport, ReportCategory, ReportStatus } from '@/types/admin';

const TABS = [
  { value: 'open', label: '待处理' },
  { value: 'resolved', label: '已处理' },
  { value: 'rejected', label: '已驳回' },
] as const;

const CATEGORIES: { value: ReportCategory | 'all'; label: string }[] = [
  { value: 'all', label: '全部分类' },
  { value: 'illegal', label: '违法/政治' },
  { value: 'porn', label: '色情低俗' },
  { value: 'ad', label: '广告/营销' },
  { value: 'harassment', label: '人身攻击' },
  { value: 'other', label: '其他' },
];

export default function ReportsPage() {
  const params = useSearchParams();
  const status = (params.get('status') ?? 'open') as ReportStatus;
  const categoryParam = (params.get('category') ?? 'all') as ReportCategory | 'all';

  const [items, setItems] = React.useState<AdminReport[]>([]);
  const [counts, setCounts] = React.useState({ open: 0, resolved: 0, rejected: 0 });
  const [loading, setLoading] = React.useState(true);
  const [page, setPage] = React.useState(1);
  const [total, setTotal] = React.useState(0);
  const [totalPages, setTotalPages] = React.useState(0);
  const requestSequence = React.useRef(0);

  const reload = React.useCallback(() => {
    const sequence = ++requestSequence.current;
    setLoading(true);
    Promise.all([
      listReports({
        status,
        category: categoryParam === 'all' ? undefined : categoryParam,
        page,
        pageSize: 20,
      }),
      listReports({
        status: 'open',
        category: categoryParam === 'all' ? undefined : categoryParam,
        pageSize: 1,
      }),
      listReports({
        status: 'resolved',
        category: categoryParam === 'all' ? undefined : categoryParam,
        pageSize: 1,
      }),
      listReports({
        status: 'rejected',
        category: categoryParam === 'all' ? undefined : categoryParam,
        pageSize: 1,
      }),
    ])
      .then(([cur, op, re, rj]) => {
        if (sequence !== requestSequence.current) return;
        setItems(cur.items);
        setTotal(cur.total);
        setTotalPages(cur.totalPages);
        setCounts({ open: op.total, resolved: re.total, rejected: rj.total });
        if (cur.items.length === 0 && page > 1) setPage(page - 1);
      })
      .catch((error: unknown) => {
        if (sequence === requestSequence.current) {
          toast.error((error as Error).message || '举报列表加载失败');
        }
      })
      .finally(() => {
        if (sequence === requestSequence.current) setLoading(false);
      });
  }, [categoryParam, page, status]);

  React.useEffect(() => {
    setPage(1);
  }, [categoryParam, status]);

  React.useEffect(() => {
    reload();
  }, [reload]);

  const filteredItems = items;

  const categoryCounts = React.useMemo(() => {
    const map: Record<string, number> = {};
    for (const r of items) {
      map[r.category] = (map[r.category] ?? 0) + 1;
    }
    return map;
  }, [items]);

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">举报队列</h1>
        <p className="text-sm text-muted-foreground">
          所有处理动作会写入审计日志 · 举报时证据快照可防止删改逃避调查
        </p>
      </header>

      <Tabs value={status}>
        <TabsList>
          {TABS.map((t) => (
            <TabsTrigger key={t.value} value={t.value} asChild>
              <Link href={`?status=${t.value}`} replace>
                {t.label}
                <span className="ml-1.5 rounded bg-muted px-1.5 text-xs tabular-nums">
                  {counts[t.value]}
                </span>
              </Link>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* 分类筛选 chip 行 — 仅在有数据时显示 */}
      {items.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">本页分类：</span>
          {CATEGORIES.map((c) => {
            const active = categoryParam === c.value;
            const count = c.value === 'all' ? items.length : (categoryCounts[c.value] ?? 0);
            return (
              <Link
                key={c.value}
                href={
                  c.value === 'all' ? `?status=${status}` : `?status=${status}&category=${c.value}`
                }
                replace
                className={cn(
                  'inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-colors',
                  active
                    ? 'bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                )}
              >
                {c.label}
                {count > 0 && (
                  <span
                    className={cn(
                      'rounded-full px-1.5 text-[10px] tabular-nums',
                      active ? 'bg-primary/20' : 'bg-muted',
                    )}
                  >
                    {count}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      )}

      <div className="space-y-3">
        {loading ? (
          <Card>
            <CardContent className="py-12 text-center text-sm text-muted-foreground">
              加载中…
            </CardContent>
          </Card>
        ) : filteredItems.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-2 py-12 text-center text-sm text-muted-foreground">
              <Flag className="size-8 text-muted-foreground/30" />
              {categoryParam !== 'all'
                ? '本页没有该分类，其他页面可能仍有记录'
                : status === 'open'
                  ? '无待处理举报 🎉'
                  : '此分类暂无记录'}
            </CardContent>
          </Card>
        ) : (
          filteredItems.map((r) => <ReportCard key={r.id} report={r} onChanged={reload} />)
        )}
      </div>

      {totalPages > 1 && (
        <div className="space-y-2">
          <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
          <p className="text-center text-xs text-muted-foreground">共 {total} 条举报记录</p>
        </div>
      )}
    </div>
  );
}
