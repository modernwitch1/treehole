'use client';

import * as React from 'react';
import { ChevronRight, MoreHorizontal, Reply, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { VoteButtons } from '@/components/vote-buttons';
import { CommentComposer } from '@/components/comment-composer';
import { ReportDialog } from '@/components/report-dialog';
import { relativeTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { voteComment } from '@/lib/api';
import { toast } from 'sonner';
import type { Comment } from '@/types/api';

interface CommentTreeProps {
  comments: Comment[];
  postId: string;
  onChanged?: () => void;
}

/**
 * Reddit 风格的链式评论树:
 *   - 每条评论 = [头像 + 贯穿线列] + [内容列]
 *   - 子评论在父节点的内容列内嵌套渲染, 自然形成视觉缩进
 *   - 父节点的贯穿线从其头像延伸到该评论树底部, 子评论各有自己的贯穿线
 *   - 点击头像/贯穿线 → 整棵子树折叠成 [+N 折叠回复] chip
 */
export function CommentTree({ comments, postId, onChanged }: CommentTreeProps) {
  return (
    <ul className="space-y-5">
      {comments.map((c) => (
        <li key={c.id}>
          <CommentNode comment={c} depth={0} postId={postId} onChanged={onChanged} />
        </li>
      ))}
    </ul>
  );
}

interface CommentNodeProps {
  comment: Comment;
  depth: number;
  postId: string;
  onChanged?: () => void;
}

function CommentNode({ comment, depth, postId, onChanged }: CommentNodeProps) {
  const [collapsed, setCollapsed] = React.useState(false);
  const [replying, setReplying] = React.useState(false);

  const hasReplies = !!(comment.replies && comment.replies.length > 0);
  const a = comment.author;
  const color = a.type === 'anonymous' ? a.pseudonym.color : 'oklch(0.55 0.05 285)';
  const displayName = a.type === 'anonymous' ? a.pseudonym.displayName : a.user.username;
  const isOp = a.type === 'anonymous' && a.pseudonym.isOp;

  // 已删除评论 — 保留位置 + 仍然渲染子树(链式不断)
  if (comment.isDeleted) {
    return (
      <article className="flex gap-2 sm:gap-3">
        <div className="flex flex-col items-center self-stretch">
          <div
            className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] text-muted-foreground ring-2 ring-background"
            aria-hidden
          >
            —
          </div>
          {hasReplies && <div className="-mb-1 mt-1 w-px flex-1 bg-border/60" aria-hidden />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs italic text-muted-foreground">[评论已删除]</p>
          {hasReplies && (
            <ul className="mt-3 space-y-3">
              {comment.replies!.map((reply) => (
                <li key={reply.id}>
                  <CommentNode
                    comment={reply}
                    depth={depth + 1}
                    postId={postId}
                    onChanged={onChanged}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      </article>
    );
  }

  // 折叠态: 一行紧凑摘要
  if (collapsed) {
    const total = countReplies(comment);
    return (
      <button
        type="button"
        onClick={() => setCollapsed(false)}
        className="group flex items-center gap-2 rounded-md py-0.5 pr-2 text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronRight className="size-3 shrink-0 transition-transform group-hover:translate-x-0.5" />
        <span
          className="inline-flex size-5 shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-white"
          style={{ background: color }}
          aria-hidden
        >
          {isOp ? '楼' : '匿'}
        </span>
        <span className="font-medium text-foreground">{displayName}</span>
        {isOp && (
          <span className="rounded bg-primary/15 px-1 text-[10px] font-semibold uppercase leading-none tracking-wider text-primary">
            楼主
          </span>
        )}
        <span aria-hidden>·</span>
        <span>
          已折叠 <span className="tabular-nums">{total}</span> 条回复
        </span>
      </button>
    );
  }

  return (
    <article className="flex gap-2 sm:gap-3">
      {/* 左列: 头像 + 贯穿线 — 整列点击折叠 */}
      <div className="flex flex-col items-center self-stretch">
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          aria-label={`折叠 ${displayName} 的评论树`}
          className={cn(
            'group/avatar flex size-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white shadow-sm ring-2 ring-background transition-transform hover:scale-110',
            isOp && 'ring-primary/30',
          )}
          style={{ background: color }}
        >
          {isOp ? '楼' : '匿'}
        </button>

        {/* 贯穿线 — 只有当此节点存在子评论(或下面还有兄弟评论时由 ul.space-y 留白)才显示 */}
        {hasReplies && (
          <button
            type="button"
            onClick={() => setCollapsed(true)}
            aria-label="折叠回复"
            className="group/line relative -mb-1 mt-1 w-4 flex-1 cursor-pointer"
          >
            <span
              className={cn(
                'absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-border transition-colors',
                'group-hover/line:bg-foreground/40',
                isOp && 'bg-primary/30 group-hover/line:bg-primary/60',
              )}
            />
          </button>
        )}
      </div>

      {/* 右列: 内容 + 嵌套子评论 */}
      <div className="min-w-0 flex-1">
        {/* Header */}
        <header className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 text-xs leading-tight">
          <span className="font-semibold text-foreground">{displayName}</span>
          {isOp && (
            <span className="rounded bg-primary/15 px-1 py-0.5 text-[10px] font-semibold uppercase leading-none tracking-wider text-primary">
              楼主
            </span>
          )}
          <span aria-hidden className="text-muted-foreground">
            ·
          </span>
          <time className="text-muted-foreground" dateTime={comment.createdAt}>
            {relativeTime(comment.createdAt)}
          </time>
        </header>

        {/* Body */}
        <div className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
          {comment.contentMd}
        </div>

        {/* Action row */}
        <div className="mt-1.5 flex items-center gap-0.5">
          <VoteButtons
            score={comment.score}
            myVote={comment.myVote}
            size="sm"
            onVote={(v) => void voteComment(comment.id, v)}
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setReplying((v) => !v)}
            className="h-7 gap-1.5 rounded-full text-xs text-muted-foreground"
          >
            <Reply className="size-3.5" />
            <span className="hidden sm:inline">回复</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              void navigator.clipboard.writeText(
                `${window.location.origin}/p/${postId}#comment-${comment.id}`,
              );
              toast.success('评论链接已复制');
            }}
            className="h-7 gap-1.5 rounded-full text-xs text-muted-foreground"
          >
            <Share2 className="size-3.5" />
            <span className="hidden sm:inline">分享</span>
          </Button>
          <ReportDialog
            targetType="comment"
            targetId={comment.id}
            title="举报评论"
            trigger={
              <Button
                variant="ghost"
                size="icon"
                className="size-7 rounded-full text-muted-foreground"
                aria-label="更多"
              >
                <MoreHorizontal className="size-3.5" />
              </Button>
            }
          />
        </div>

        {replying && (
          <div className="mt-3">
            <CommentComposer
              postId={postId}
              parentId={comment.id}
              autoFocus
              placeholder={`回复 ${displayName}…`}
              onCreated={() => {
                setReplying(false);
                onChanged?.();
              }}
              onCancel={() => setReplying(false)}
            />
          </div>
        )}

        {/* 嵌套子评论 — 渲染在内容列内, 自然产生缩进 */}
        {hasReplies && (
          <ul className="mt-3 space-y-3">
            {comment.replies!.map((reply) => (
              <li key={reply.id}>
                <CommentNode
                  comment={reply}
                  depth={depth + 1}
                  postId={postId}
                  onChanged={onChanged}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </article>
  );
}

/** 递归统计某节点下的总回复数(用于折叠态显示) */
function countReplies(c: Comment): number {
  if (!c.replies) return 0;
  let n = c.replies.length;
  for (const r of c.replies) n += countReplies(r);
  return n;
}
