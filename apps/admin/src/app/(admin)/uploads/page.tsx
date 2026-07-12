'use client';

import * as React from 'react';
import { AlertTriangle, Check, ImageOff, Loader2, RefreshCw, ShieldCheck, X } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Pagination } from '@/components/pagination';
import { Textarea } from '@/components/ui/textarea';
import { fetchAdminUploadPreview, listPendingUploads, reviewUpload } from '@/lib/api';
import { relativeTime } from '@/lib/format';
import type { AdminPendingUpload } from '@/types/admin';

type ReviewState = { upload: AdminPendingUpload; action: 'approve' | 'reject' } | null;

export default function UploadsPage() {
  const [items, setItems] = React.useState<AdminPendingUpload[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [page, setPage] = React.useState(1);
  const [total, setTotal] = React.useState(0);
  const [totalPages, setTotalPages] = React.useState(0);
  const [review, setReview] = React.useState<ReviewState>(null);
  const [note, setNote] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const sequence = React.useRef(0);

  const reload = React.useCallback(() => {
    const request = ++sequence.current;
    setLoading(true);
    listPendingUploads({ page, pageSize: 20 })
      .then((result) => {
        if (request !== sequence.current) return;
        setItems(result.items);
        setTotal(result.total);
        setTotalPages(result.totalPages);
        if (result.items.length === 0 && page > 1) setPage(page - 1);
      })
      .catch((error: unknown) => {
        if (request === sequence.current)
          toast.error((error as Error).message || '图片队列加载失败');
      })
      .finally(() => {
        if (request === sequence.current) setLoading(false);
      });
  }, [page]);

  React.useEffect(() => {
    reload();
  }, [reload]);

  function openReview(upload: AdminPendingUpload, action: 'approve' | 'reject') {
    setReview({ upload, action });
    setNote('');
  }

  async function submitReview() {
    if (!review) return;
    if (review.action === 'reject' && note.trim().length < 3) {
      toast.error('驳回图片时请填写至少 3 个字的依据');
      return;
    }
    setSubmitting(true);
    try {
      await reviewUpload(review.upload.id, review.action, note);
      toast.success(review.action === 'approve' ? '图片已通过审核' : '图片已驳回并保全证据');
      setReview(null);
      reload();
    } catch (error) {
      toast.error((error as Error).message || '图片审核失败');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">图片待审</h1>
          <p className="text-sm text-muted-foreground">
            待审或机器标记图片不会公开访问 · 驳回关联帖子时会同步隐藏并进入证据保全
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={total > 0 ? 'warning' : 'muted'}>{total} 张待处理</Badge>
          <Button variant="outline" size="sm" disabled={loading} onClick={reload}>
            <RefreshCw className={loading ? 'animate-spin' : ''} /> 刷新
          </Button>
        </div>
      </header>

      {loading ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            加载中…
          </CardContent>
        </Card>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center text-sm text-muted-foreground">
            <ShieldCheck className="size-9 text-[color:var(--success)]/50" />
            暂无待审图片
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((upload) => (
            <Card
              key={upload.id}
              className={upload.moderationStatus === 'flagged' ? 'border-destructive/40' : ''}
            >
              <div className="relative aspect-video overflow-hidden rounded-t-xl border-b bg-muted/50">
                <AuthenticatedImagePreview upload={upload} />
              </div>
              <CardContent className="space-y-3 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    variant={upload.moderationStatus === 'flagged' ? 'destructive' : 'warning'}
                  >
                    {upload.moderationStatus === 'flagged' ? '机器标记' : '等待审核'}
                  </Badge>
                  <Badge variant="muted">{upload.mimeType}</Badge>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {relativeTime(upload.createdAt)}
                  </span>
                </div>
                <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                  <dt className="text-muted-foreground">尺寸</dt>
                  <dd className="text-right font-mono">
                    {upload.width && upload.height ? `${upload.width} × ${upload.height}` : '未知'}
                  </dd>
                  <dt className="text-muted-foreground">大小</dt>
                  <dd className="text-right font-mono">{formatBytes(upload.sizeBytes)}</dd>
                  <dt className="text-muted-foreground">关联目标</dt>
                  <dd className="truncate text-right font-mono">
                    {upload.attachedToType
                      ? `${upload.attachedToType} #${upload.attachedToId ?? '待绑定'}`
                      : '尚未绑定'}
                  </dd>
                </dl>
                {labelTokens(upload.moderationLabels).length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {labelTokens(upload.moderationLabels).map((label, index) => (
                      <Badge key={`${label}-${index}`} variant="outline">
                        {label}
                      </Badge>
                    ))}
                  </div>
                )}
                <div className="flex gap-2 border-t pt-3">
                  <Button
                    size="sm"
                    className="flex-1"
                    onClick={() => openReview(upload, 'approve')}
                  >
                    <Check /> 通过
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    className="flex-1"
                    onClick={() => openReview(upload, 'reject')}
                  >
                    <X /> 驳回
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {totalPages > 1 && <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />}

      <Dialog open={review !== null} onOpenChange={(open) => !open && setReview(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {review?.action === 'approve' ? '确认通过图片？' : '确认驳回图片？'}
            </DialogTitle>
            <DialogDescription>
              {review?.action === 'approve'
                ? '通过后图片可随已发布内容公开访问，本次操作会写入审计日志。'
                : '驳回后图片不会公开；若已关联帖子，帖子会同步隐藏，原图进入证据保全。'}
            </DialogDescription>
          </DialogHeader>
          {review?.action === 'reject' && (
            <div className="flex gap-2 rounded-md bg-destructive/10 p-3 text-xs text-destructive">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              请确认画面确有违规或高风险内容，避免误伤正常图片。
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="upload-review-note">
              审核说明{review?.action === 'reject' ? '（必填）' : '（可选）'}
            </Label>
            <Textarea
              id="upload-review-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="说明画面内容与判断依据"
              rows={3}
              maxLength={500}
              className="resize-none"
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" disabled={submitting} onClick={() => setReview(null)}>
              取消
            </Button>
            <Button
              variant={review?.action === 'reject' ? 'destructive' : 'default'}
              disabled={submitting || (review?.action === 'reject' && note.trim().length < 3)}
              onClick={() => void submitReview()}
            >
              {submitting ? '处理中…' : review?.action === 'approve' ? '确认通过' : '确认驳回'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AuthenticatedImagePreview({ upload }: { upload: AdminPendingUpload }) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [shouldLoad, setShouldLoad] = React.useState(false);
  const [url, setUrl] = React.useState<string | null>(null);
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    const element = containerRef.current;
    if (!element || typeof IntersectionObserver === 'undefined') {
      setShouldLoad(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setShouldLoad(true);
          observer.disconnect();
        }
      },
      { rootMargin: '200px' },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  React.useEffect(() => {
    if (!shouldLoad) return;
    let cancelled = false;
    let objectUrl: string | null = null;
    setUrl(null);
    setError('');
    fetchAdminUploadPreview(upload.previewUrl)
      .then((nextUrl) => {
        objectUrl = nextUrl;
        if (cancelled) {
          if (nextUrl.startsWith('blob:')) URL.revokeObjectURL(nextUrl);
          return;
        }
        setUrl(nextUrl);
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError((reason as Error).message || '预览加载失败');
      });
    return () => {
      cancelled = true;
      if (objectUrl?.startsWith('blob:')) URL.revokeObjectURL(objectUrl);
    };
  }, [shouldLoad, upload.id, upload.previewUrl]);

  return (
    <div ref={containerRef} className="h-full w-full">
      {error ? (
        <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center text-xs text-muted-foreground">
          <ImageOff className="size-7" />
          {error}
        </div>
      ) : !url ? (
        <div className="flex h-full items-center justify-center text-muted-foreground">
          {shouldLoad ? <Loader2 className="size-6 animate-spin" /> : '滚动到此处加载安全预览'}
        </div>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- authenticated no-store object URL
        <img
          src={url}
          alt="待审核上传图片"
          referrerPolicy="no-referrer"
          className="h-full w-full object-contain"
        />
      )}
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function labelTokens(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string').slice(0, 6);
  }
  if (typeof value !== 'object') return [];
  return Object.entries(value as Record<string, unknown>)
    .flatMap(([key, item]) => {
      if (typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean') {
        return [`${key}: ${String(item)}`];
      }
      if (Array.isArray(item)) {
        return item
          .filter((entry): entry is string => typeof entry === 'string')
          .map((entry) => `${key}: ${entry}`);
      }
      return [];
    })
    .slice(0, 6);
}
