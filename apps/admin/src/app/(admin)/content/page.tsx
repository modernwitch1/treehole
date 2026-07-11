'use client';

import * as React from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Pin, Lock, Search, Flag, Eye, EyeOff } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import { listAdminComments, listAdminPosts } from '@/lib/api';
import { relativeTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { AdminComment, AdminPost } from '@/types/admin';

type PostQuickFilter = 'all' | 'reported' | 'hidden' | 'pinned' | 'locked';
type CommentQuickFilter = 'all' | 'reported' | 'hidden';

const POST_QUICK_FILTERS: { value: PostQuickFilter; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { value: 'all', label: '全部', icon: Eye },
  { value: 'reported', label: '被举报', icon: Flag },
  { value: 'hidden', label: '已隐藏', icon: EyeOff },
  { value: 'pinned', label: '已置顶', icon: Pin },
  { value: 'locked', label: '已锁定', icon: Lock },
];

const COMMENT_QUICK_FILTERS: { value: CommentQuickFilter; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { value: 'all', label: '全部', icon: Eye },
  { value: 'reported', label: '被举报', icon: Flag },
  { value: 'hidden', label: '已隐藏', icon: EyeOff },
];

export default function ContentPage() {
  const params = useSearchParams();
  const tab = (params.get('tab') ?? 'posts') as 'posts' | 'comments';

  const [posts, setPosts] = React.useState<AdminPost[]>([]);
  const [comments, setComments] = React.useState<AdminComment[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [search, setSearch] = React.useState('');
  const [postFilter, setPostFilter] = React.useState<PostQuickFilter>('all');
  const [commentFilter, setCommentFilter] = React.useState<CommentQuickFilter>('all');
  const [postPage, setPostPage] = React.useState(1);
  const [commentPage, setCommentPage] = React.useState(1);
  const [postTotalPages, setPostTotalPages] = React.useState(0);
  const [commentTotalPages, setCommentTotalPages] = React.useState(0);
  const [postTotal, setPostTotal] = React.useState(0);
  const [commentTotal, setCommentTotal] = React.useState(0);
  const pageSize = 20;

  const reload = React.useCallback(() => {
    setLoading(true);
    Promise.all([listAdminPosts({ page: postPage, pageSize }), listAdminComments({ page: commentPage, pageSize })])
      .then(([p, c]) => {
        setPosts(p.items);
        setComments(c.items);
        setPostTotalPages(p.totalPages);
        setCommentTotalPages(c.totalPages);
        setPostTotal(p.total);
        setCommentTotal(c.total);
      })
      .finally(() => setLoading(false));
  }, [postPage, commentPage]);

  React.useEffect(() => {
    reload();
  }, [reload]);

  const q = search.trim().toLowerCase();

  const baseFilteredPosts = posts.filter((p) => {
    if (!q) return true;
    return (
      p.title.toLowerCase().includes(q) ||
      p.excerpt.toLowerCase().includes(q) ||
      p.authorUsername.toLowerCase().includes(q) ||
      p.boardName.toLowerCase().includes(q) ||
      p.id.toLowerCase().includes(q)
    );
  });

  const filteredPosts = baseFilteredPosts.filter((p) => {
    switch (postFilter) {
      case 'reported':
        return p.reportCount > 0;
      case 'hidden':
        return p.status === 'hidden';
      case 'pinned':
        return p.isPinned;
      case 'locked':
        return p.isLocked;
      default:
        return true;
    }
  });

  const baseFilteredComments = comments.filter((c) => {
    if (!q) return true;
    return (
      c.excerpt.toLowerCase().includes(q) ||
      c.authorUsername.toLowerCase().includes(q) ||
      c.postTitle.toLowerCase().includes(q) ||
      c.id.toLowerCase().includes(q)
    );
  });

  const filteredComments = baseFilteredComments.filter((c) => {
    switch (commentFilter) {
      case 'reported':
        return c.reportCount > 0;
      case 'hidden':
        return c.status === 'hidden';
      default:
        return true;
    }
  });

  const reportedPostCount = posts.filter((p) => p.reportCount > 0).length;
  const reportedCommentCount = comments.filter((c) => c.reportCount > 0).length;

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">内容管理</h1>
          <p className="text-sm text-muted-foreground">
            所有帖子 / 评论 · 按时间倒序 · 红色举报数提示需关注内容
          </p>
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="搜索标题/内容/作者/标签/ID…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
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

      {/* 快捷筛选 chip 行 */}
      <div className="flex flex-wrap items-center gap-2">
        {tab === 'posts'
          ? POST_QUICK_FILTERS.map((f) => (
              <FilterChip
                key={f.value}
                active={postFilter === f.value}
                onClick={() => setPostFilter(f.value)}
                icon={f.icon}
                label={f.label}
                count={
                  f.value === 'reported'
                    ? reportedPostCount
                    : f.value === 'all'
                      ? postTotal
                      : undefined
                }
                highlight={f.value === 'reported' && reportedPostCount > 0}
              />
            ))
          : COMMENT_QUICK_FILTERS.map((f) => (
              <FilterChip
                key={f.value}
                active={commentFilter === f.value}
                onClick={() => setCommentFilter(f.value)}
                icon={f.icon}
                label={f.label}
                count={
                  f.value === 'reported'
                    ? reportedCommentCount
                    : f.value === 'all'
                      ? commentTotal
                      : undefined
                }
                highlight={f.value === 'reported' && reportedCommentCount > 0}
              />
            ))}
      </div>

      {loading ? (
        <Card>
          <div className="py-12 text-center text-sm text-muted-foreground">加载中…</div>
        </Card>
      ) : tab === 'posts' ? (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[35%]">标题 / 摘要</TableHead>
                <TableHead>标签</TableHead>
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
              {filteredPosts.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={9}
                    className="py-12 text-center text-sm text-muted-foreground"
                  >
                    没有匹配的帖子
                  </TableCell>
                </TableRow>
              ) : (
                filteredPosts.map((p) => (
                  <TableRow key={p.id} className={p.reportCount > 0 ? 'bg-destructive/5' : ''}>
                    <TableCell>
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-1.5">
                          {p.isPinned && (
                            <Pin className="size-3 shrink-0 text-[color:var(--warning)]" />
                          )}
                          {p.isLocked && <Lock className="size-3 shrink-0 text-muted-foreground" />}
                          <p className="line-clamp-1 font-medium">{p.title}</p>
                        </div>
                        <p className="line-clamp-1 text-xs text-muted-foreground">{p.excerpt}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="muted">{p.boardName}</Badge>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm">{p.authorUsername}</span>
                      {p.isAnonymous && (
                        <Badge variant="muted" className="ml-1 text-[10px]">
                          匿
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <ContentStatusBadge status={p.status} />
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">{p.score}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {p.commentCount}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {p.reportCount > 0 ? (
                        <span className="font-semibold text-destructive">{p.reportCount}</span>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {relativeTime(p.createdAt)}
                    </TableCell>
                    <TableCell>
                      <ContentActionsMenu
                        kind="post"
                        id={p.id}
                        boardSlug={p.boardSlug}
                        status={p.status}
                        isPinned={p.isPinned}
                        isLocked={p.isLocked}
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
              <Pagination
                page={postPage}
                totalPages={postTotalPages}
                onPageChange={setPostPage}
              />
            </div>
          )}
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[45%]">评论内容</TableHead>
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
              {filteredComments.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={8}
                    className="py-12 text-center text-sm text-muted-foreground"
                  >
                    没有匹配的评论
                  </TableCell>
                </TableRow>
              ) : (
                filteredComments.map((c) => (
                  <TableRow key={c.id} className={c.reportCount > 0 ? 'bg-destructive/5' : ''}>
                    <TableCell>
                      <p className="line-clamp-2 text-sm text-foreground/90">{c.excerpt}</p>
                    </TableCell>
                    <TableCell>
                      <p className="line-clamp-1 max-w-[160px] text-xs text-muted-foreground">
                        {c.postTitle}
                      </p>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm">{c.authorUsername}</span>
                      {c.isAnonymous && (
                        <Badge variant="muted" className="ml-1 text-[10px]">
                          匿
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <ContentStatusBadge status={c.status} />
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">{c.score}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {c.reportCount > 0 ? (
                        <span className="font-semibold text-destructive">{c.reportCount}</span>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {relativeTime(c.createdAt)}
                    </TableCell>
                    <TableCell>
                      <ContentActionsMenu
                        kind="comment"
                        id={c.id}
                        postId={c.postId}
                        boardSlug={c.boardSlug}
                        status={c.status}
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
    </div>
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
            ? 'text-destructive hover:bg-destructive/10 hover:text-destructive'
            : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
      )}
    >
      <Icon className="size-3.5" />
      {label}
      {count !== undefined && count > 0 && (
        <span
          className={cn(
            'rounded-full px-1.5 text-[10px] tabular-nums',
            active ? 'bg-primary/20' : 'bg-muted',
          )}
        >
          {count}
        </span>
      )}
    </Button>
  );
}

