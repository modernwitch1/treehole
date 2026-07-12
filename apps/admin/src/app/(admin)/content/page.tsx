'use client';

import * as React from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Eye, EyeOff, Flag, Search, ShieldCheck, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ContentStatusBadge } from '@/components/status-badge';
import { ContentActionsMenu } from '@/components/content-actions-menu';
import { Pagination } from '@/components/pagination';
import { batchContentAction, getCurrentAdmin, listAdminComments, listAdminPosts } from '@/lib/api';
import { relativeTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { AdminComment, AdminPost, ContentStatus } from '@/types/admin';

type QuickFilter = 'all' | 'pending_review' | 'reported' | 'published' | 'hidden' | 'deleted';
type BatchAction = { kind: 'post' | 'comment'; action: 'approve' | 'hide' } | null;

const QUICK_FILTERS: Array<{
  value: QuickFilter;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { value: 'all', label: '全部', icon: Eye },
  { value: 'pending_review', label: '待审核', icon: ShieldCheck },
  { value: 'reported', label: '被举报', icon: Flag },
  { value: 'published', label: '已发布', icon: Eye },
  { value: 'hidden', label: '已隐藏', icon: EyeOff },
  { value: 'deleted', label: '已删除', icon: Trash2 },
];

function filterRequest(filter: QuickFilter): { status?: ContentStatus; reported?: boolean } {
  if (filter === 'reported') return { reported: true };
  if (filter === 'all') return {};
  return { status: filter };
}

function isBatchSelectable(item: AdminPost | AdminComment): boolean {
  return item.status === 'published' || item.status === 'pending_review';
}

function isBatchApprovable(item: AdminPost | AdminComment): boolean {
  return (
    item.status === 'pending_review' &&
    moderationRiskLevel(item.moderationLabels) < 4 &&
    !hasPendingImage(item.moderationLabels)
  );
}

function hasPendingImage(labels: unknown): boolean {
  return Boolean(
    labels &&
    typeof labels === 'object' &&
    !Array.isArray(labels) &&
    (labels as Record<string, unknown>).imagePending === true,
  );
}

function moderationRiskLevel(labels: unknown): number {
  if (!labels || typeof labels !== 'object' || Array.isArray(labels)) return 0;
  const record = labels as Record<string, unknown>;
  const directRisk = typeof record.riskLevel === 'number' ? record.riskLevel : 0;
  const titleRisk = moderationRiskLevel(record.title);
  const bodyRisk = moderationRiskLevel(record.body);
  const imageRisk = record.imagePending === true ? 2 : 0;
  return Math.max(directRisk, titleRisk, bodyRisk, imageRisk);
}

export default function ContentPage() {
  const params = useSearchParams();
  const tab = params.get('tab') === 'comments' ? 'comments' : 'posts';
  const [posts, setPosts] = React.useState<AdminPost[]>([]);
  const [comments, setComments] = React.useState<AdminComment[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [search, setSearch] = React.useState('');
  const [debouncedSearch, setDebouncedSearch] = React.useState('');
  const [postFilter, setPostFilter] = React.useState<QuickFilter>('all');
  const [commentFilter, setCommentFilter] = React.useState<QuickFilter>('all');
  const [postPage, setPostPage] = React.useState(1);
  const [commentPage, setCommentPage] = React.useState(1);
  const [postTotalPages, setPostTotalPages] = React.useState(0);
  const [commentTotalPages, setCommentTotalPages] = React.useState(0);
  const [postTotal, setPostTotal] = React.useState(0);
  const [commentTotal, setCommentTotal] = React.useState(0);
  const [selectedPosts, setSelectedPosts] = React.useState<Set<string>>(new Set());
  const [selectedComments, setSelectedComments] = React.useState<Set<string>>(new Set());
  const [batchAction, setBatchAction] = React.useState<BatchAction>(null);
  const [batchSubmitting, setBatchSubmitting] = React.useState(false);
  const [canRevealIdentity, setCanRevealIdentity] = React.useState(false);
  const [canDelete, setCanDelete] = React.useState(false);
  const requestSequence = React.useRef(0);
  const pageSize = 20;

  React.useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  React.useEffect(() => {
    getCurrentAdmin()
      .then((admin) => {
        setCanRevealIdentity(admin?.role === 'superadmin');
        setCanDelete(admin?.role === 'superadmin');
      })
      .catch(() => {
        setCanRevealIdentity(false);
        setCanDelete(false);
      });
  }, []);

  const reload = React.useCallback(() => {
    const sequence = ++requestSequence.current;
    setLoading(true);
    Promise.all([
      listAdminPosts({
        q: debouncedSearch || undefined,
        ...filterRequest(postFilter),
        page: postPage,
        pageSize,
      }),
      listAdminComments({
        q: debouncedSearch || undefined,
        ...filterRequest(commentFilter),
        page: commentPage,
        pageSize,
      }),
    ])
      .then(([postResult, commentResult]) => {
        if (sequence !== requestSequence.current) return;
        setPosts(postResult.items);
        setComments(commentResult.items);
        setPostTotalPages(postResult.totalPages);
        setCommentTotalPages(commentResult.totalPages);
        setPostTotal(postResult.total);
        setCommentTotal(commentResult.total);
        setSelectedPosts(new Set());
        setSelectedComments(new Set());
        const lastPostPage = Math.max(postResult.totalPages, 1);
        const lastCommentPage = Math.max(commentResult.totalPages, 1);
        if (postPage > lastPostPage) setPostPage(lastPostPage);
        if (commentPage > lastCommentPage) setCommentPage(lastCommentPage);
      })
      .catch((error: unknown) => {
        if (sequence === requestSequence.current) {
          toast.error((error as Error).message || '内容列表加载失败');
        }
      })
      .finally(() => {
        if (sequence === requestSequence.current) setLoading(false);
      });
  }, [commentFilter, commentPage, debouncedSearch, postFilter, postPage]);

  React.useEffect(() => {
    reload();
  }, [reload]);

  function changeSearch(value: string) {
    setSearch(value);
    setPostPage(1);
    setCommentPage(1);
  }

  function changePostFilter(value: QuickFilter) {
    setPostFilter(value);
    setPostPage(1);
  }

  function changeCommentFilter(value: QuickFilter) {
    setCommentFilter(value);
    setCommentPage(1);
  }

  function toggleOne(kind: 'post' | 'comment', id: string, checked: boolean) {
    const setter = kind === 'post' ? setSelectedPosts : setSelectedComments;
    setter((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function toggleAll(kind: 'post' | 'comment', checked: boolean) {
    if (kind === 'post') {
      setSelectedPosts(
        checked ? new Set(posts.filter(isBatchSelectable).map((item) => item.id)) : new Set(),
      );
    } else {
      setSelectedComments(
        checked ? new Set(comments.filter(isBatchSelectable).map((item) => item.id)) : new Set(),
      );
    }
  }

  async function confirmBatchAction() {
    if (!batchAction) return;
    const selected = batchAction.kind === 'post' ? selectedPosts : selectedComments;
    if (selected.size === 0) return;
    setBatchSubmitting(true);
    try {
      const result = await batchContentAction(batchAction.kind, [...selected], batchAction.action);
      toast.success(
        batchAction.action === 'approve'
          ? `已通过 ${result.processed} 条内容`
          : `已隐藏 ${result.processed} 条内容`,
      );
      setBatchAction(null);
      reload();
    } catch (error) {
      toast.error((error as Error).message || '批量操作失败');
    } finally {
      setBatchSubmitting(false);
    }
  }

  const activeItems = tab === 'posts' ? posts : comments;
  const activeSelected = tab === 'posts' ? selectedPosts : selectedComments;
  const selectedItems = activeItems.filter((item) => activeSelected.has(item.id));
  const canApproveSelection =
    selectedItems.length > 0 && selectedItems.every((item) => isBatchApprovable(item));
  const selectableIds = activeItems.filter(isBatchSelectable).map((item) => item.id);
  const allSelected =
    selectableIds.length > 0 && selectableIds.every((id) => activeSelected.has(id));
  const partlySelected = !allSelected && selectableIds.some((id) => activeSelected.has(id));

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">内容管理</h1>
          <p className="text-sm text-muted-foreground">
            搜索和状态筛选由服务端执行 · 匿名身份仅超级管理员可直接调阅，且每次自动留痕
          </p>
        </div>
        <div className="relative w-full sm:w-80">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="搜索标题、正文或所属板块…"
            value={search}
            onChange={(event) => changeSearch(event.target.value)}
            maxLength={100}
            className="pl-9"
          />
        </div>
      </header>

      <Tabs value={tab}>
        <TabsList>
          <TabsTrigger value="posts" asChild>
            <Link href="?tab=posts" replace>
              帖子
              <span className="ml-1.5 rounded bg-muted px-1.5 text-xs tabular-nums">
                {postTotal}
              </span>
            </Link>
          </TabsTrigger>
          <TabsTrigger value="comments" asChild>
            <Link href="?tab=comments" replace>
              评论
              <span className="ml-1.5 rounded bg-muted px-1.5 text-xs tabular-nums">
                {commentTotal}
              </span>
            </Link>
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="flex flex-wrap items-center gap-2">
        {QUICK_FILTERS.map((filter) => {
          const active = (tab === 'posts' ? postFilter : commentFilter) === filter.value;
          return (
            <FilterChip
              key={filter.value}
              active={active}
              onClick={() =>
                tab === 'posts' ? changePostFilter(filter.value) : changeCommentFilter(filter.value)
              }
              icon={filter.icon}
              label={filter.label}
              count={active ? (tab === 'posts' ? postTotal : commentTotal) : undefined}
              highlight={filter.value === 'pending_review' || filter.value === 'reported'}
            />
          );
        })}
      </div>

      {activeSelected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2">
          <span className="text-sm font-medium">已选 {activeSelected.size} 条</span>
          <Button
            size="sm"
            disabled={!canApproveSelection}
            title={
              canApproveSelection
                ? undefined
                : '只能批量通过待审核、风险等级低于 4 且图片已审核的内容'
            }
            onClick={() =>
              setBatchAction({ kind: tab === 'posts' ? 'post' : 'comment', action: 'approve' })
            }
          >
            <ShieldCheck /> 通过审核
          </Button>
          <Button
            size="sm"
            variant="destructive"
            onClick={() =>
              setBatchAction({ kind: tab === 'posts' ? 'post' : 'comment', action: 'hide' })
            }
          >
            <EyeOff /> 批量隐藏
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto"
            onClick={() =>
              tab === 'posts' ? setSelectedPosts(new Set()) : setSelectedComments(new Set())
            }
          >
            取消选择
          </Button>
        </div>
      )}

      {loading ? (
        <Card>
          <div className="py-12 text-center text-sm text-muted-foreground">加载中…</div>
        </Card>
      ) : tab === 'posts' ? (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <SelectionCheckbox
                    checked={allSelected}
                    indeterminate={partlySelected}
                    disabled={selectableIds.length === 0}
                    onChange={(checked) => toggleAll('post', checked)}
                    label="选择本页全部帖子"
                  />
                </TableHead>
                <TableHead className="w-[34%]">标题 / 摘要</TableHead>
                <TableHead>板块</TableHead>
                <TableHead>作者</TableHead>
                <TableHead>状态</TableHead>
                <TableHead className="text-right">分数</TableHead>
                <TableHead className="text-right">评论</TableHead>
                <TableHead className="text-right">举报</TableHead>
                <TableHead>时间</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {posts.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={10}
                    className="py-12 text-center text-sm text-muted-foreground"
                  >
                    没有匹配的帖子
                  </TableCell>
                </TableRow>
              ) : (
                posts.map((post) => (
                  <TableRow
                    key={post.id}
                    data-state={selectedPosts.has(post.id) ? 'selected' : undefined}
                    className={post.reportCount > 0 ? 'bg-destructive/5' : ''}
                  >
                    <TableCell>
                      <SelectionCheckbox
                        checked={selectedPosts.has(post.id)}
                        disabled={!isBatchSelectable(post)}
                        onChange={(checked) => toggleOne('post', post.id, checked)}
                        label={`选择帖子 ${post.title}`}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="space-y-0.5">
                        <p className="line-clamp-1 font-medium">{post.title}</p>
                        <p className="line-clamp-1 text-xs text-muted-foreground">{post.excerpt}</p>
                        <ModerationRisk labels={post.moderationLabels} />
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="muted">{post.boardName}</Badge>
                    </TableCell>
                    <TableCell>
                      <div>
                        <div className="flex items-center gap-1">
                          <span className="text-sm">{post.authorUsername}</span>
                          {post.isAnonymous && (
                            <Badge variant="muted" className="text-[10px]">
                              匿
                            </Badge>
                          )}
                        </div>
                        {!post.isAnonymous && post.authorId && (
                          <p className="font-mono text-[11px] text-muted-foreground">
                            UID: {post.authorId}
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <ContentStatusBadge status={post.status} />
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {post.score}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {post.commentCount}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {post.reportCount > 0 ? (
                        <span className="font-semibold text-destructive">{post.reportCount}</span>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {relativeTime(post.createdAt)}
                    </TableCell>
                    <TableCell>
                      <ContentActionsMenu
                        kind="post"
                        id={post.id}
                        boardSlug={post.boardSlug}
                        status={post.status}
                        isAnonymous={post.isAnonymous}
                        isPinned={post.isPinned}
                        isLocked={post.isLocked}
                        canRevealIdentity={canRevealIdentity}
                        canDelete={canDelete}
                        onChanged={reload}
                      />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          {postTotalPages > 1 && (
            <div className="border-t px-4 py-3">
              <Pagination page={postPage} totalPages={postTotalPages} onPageChange={setPostPage} />
            </div>
          )}
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <SelectionCheckbox
                    checked={allSelected}
                    indeterminate={partlySelected}
                    disabled={selectableIds.length === 0}
                    onChange={(checked) => toggleAll('comment', checked)}
                    label="选择本页全部评论"
                  />
                </TableHead>
                <TableHead className="w-[42%]">评论内容</TableHead>
                <TableHead>所属帖子</TableHead>
                <TableHead>作者</TableHead>
                <TableHead>状态</TableHead>
                <TableHead className="text-right">分数</TableHead>
                <TableHead className="text-right">举报</TableHead>
                <TableHead>时间</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {comments.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={9}
                    className="py-12 text-center text-sm text-muted-foreground"
                  >
                    没有匹配的评论
                  </TableCell>
                </TableRow>
              ) : (
                comments.map((comment) => (
                  <TableRow
                    key={comment.id}
                    data-state={selectedComments.has(comment.id) ? 'selected' : undefined}
                    className={comment.reportCount > 0 ? 'bg-destructive/5' : ''}
                  >
                    <TableCell>
                      <SelectionCheckbox
                        checked={selectedComments.has(comment.id)}
                        disabled={!isBatchSelectable(comment)}
                        onChange={(checked) => toggleOne('comment', comment.id, checked)}
                        label={`选择评论 ${comment.id}`}
                      />
                    </TableCell>
                    <TableCell>
                      <p className="line-clamp-2 text-sm text-foreground/90">{comment.excerpt}</p>
                      <ModerationRisk labels={comment.moderationLabels} />
                    </TableCell>
                    <TableCell>
                      <p className="line-clamp-1 max-w-[160px] text-xs text-muted-foreground">
                        {comment.postTitle}
                      </p>
                    </TableCell>
                    <TableCell>
                      <div>
                        <div className="flex items-center gap-1">
                          <span className="text-sm">{comment.authorUsername}</span>
                          {comment.isAnonymous && (
                            <Badge variant="muted" className="text-[10px]">
                              匿
                            </Badge>
                          )}
                        </div>
                        {!comment.isAnonymous && comment.authorId && (
                          <p className="font-mono text-[11px] text-muted-foreground">
                            UID: {comment.authorId}
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <ContentStatusBadge status={comment.status} />
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {comment.score}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {comment.reportCount > 0 ? (
                        <span className="font-semibold text-destructive">
                          {comment.reportCount}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {relativeTime(comment.createdAt)}
                    </TableCell>
                    <TableCell>
                      <ContentActionsMenu
                        kind="comment"
                        id={comment.id}
                        postId={comment.postId}
                        boardSlug={comment.boardSlug}
                        status={comment.status}
                        isAnonymous={comment.isAnonymous}
                        canRevealIdentity={canRevealIdentity}
                        canDelete={canDelete}
                        onChanged={reload}
                      />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          {commentTotalPages > 1 && (
            <div className="border-t px-4 py-3">
              <Pagination
                page={commentPage}
                totalPages={commentTotalPages}
                onPageChange={setCommentPage}
              />
            </div>
          )}
        </Card>
      )}

      <AlertDialog
        open={batchAction !== null}
        onOpenChange={(open) => !open && setBatchAction(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {batchAction?.action === 'approve' ? '确认批量通过审核？' : '确认批量隐藏？'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              将处理 {activeSelected.size} 条{batchAction?.kind === 'post' ? '帖子' : '评论'}。
              操作会同步关闭关联审核案件并写入审计日志。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={batchSubmitting}>取消</AlertDialogCancel>
            <AlertDialogAction
              disabled={batchSubmitting}
              onClick={(event) => {
                event.preventDefault();
                void confirmBatchAction();
              }}
              className={
                batchAction?.action === 'hide' ? 'bg-destructive hover:bg-destructive/90' : ''
              }
            >
              {batchSubmitting ? '处理中…' : '确认处理'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function SelectionCheckbox({
  checked,
  indeterminate = false,
  disabled = false,
  onChange,
  label,
}: {
  checked: boolean;
  indeterminate?: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  const ref = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      disabled={disabled}
      aria-label={label}
      onChange={(event) => onChange(event.target.checked)}
      className="size-4 rounded border-input accent-primary disabled:cursor-not-allowed disabled:opacity-40"
    />
  );
}

function ModerationRisk({ labels }: { labels: unknown }) {
  const riskLevel = moderationRiskLevel(labels);
  if (riskLevel <= 0) return null;
  return (
    <span
      className={cn('text-[11px]', riskLevel >= 3 ? 'text-destructive' : 'text-muted-foreground')}
    >
      {hasPendingImage(labels) ? '关联图片待审 · ' : ''}自动审核风险等级 {riskLevel}
    </span>
  );
}

function FilterChip({
  active,
  onClick,
  icon: Icon,
  label,
  count,
  highlight,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  count?: number;
  highlight?: boolean;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={onClick}
      className={cn(
        'h-8 gap-1.5 rounded-full px-3 text-xs font-medium',
        active
          ? 'bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary'
          : highlight
            ? 'text-[color:var(--warning)] hover:bg-[color:var(--warning)]/10'
            : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
      )}
    >
      <Icon className="size-3.5" />
      {label}
      {count !== undefined && count > 0 && (
        <span className="rounded-full bg-primary/20 px-1.5 text-[10px] tabular-nums">{count}</span>
      )}
    </Button>
  );
}
