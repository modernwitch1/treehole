'use client';

import * as React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { MessageSquare, Share2, Bookmark, Pin, Lock, Image as ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { VoteButtons } from '@/components/vote-buttons';
import { AuthorChip } from '@/components/author-chip';
import { PostMoreMenu } from '@/components/post-more-menu';
import { DmButton } from '@/components/dm-button';
import { formatScore, relativeTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { toggleBookmark, votePost } from '@/lib/api';
import type { Post, UserRole } from '@/types/api';

interface PostCardProps {
  post: Post;
  /** 是否在标签页内 (隐藏标签 chip 因为已经在该标签内) */
  /** 当前用户角色 — 管理员/版主会看到额外的内联操作 */
  currentUserRole?: UserRole | null;
  /** 是否是当前用户自己的帖子 — 隐藏私信按钮 */
  isOwnPost?: boolean;
  /** 是否登录 — 未登录隐藏私信按钮 */
  isLoggedIn?: boolean;
}

/**
 * 经典论坛信息流卡片:
 *   左 vertical 投票列 | 中 meta+title+excerpt+actions | 右 thumbnail
 *
 * 紧凑密度 (p-2 + rounded-md), 一屏能看到 5-6 条帖子。
 */
export function PostCard({ post, currentUserRole, isOwnPost, isLoggedIn }: PostCardProps) {
  const href = `/p/${post.id}`;

  async function sharePost() {
    const url = `${window.location.origin}${href}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: post.title, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      toast.success('链接已复制');
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        toast.error('分享失败，请稍后重试');
      }
    }
  }

  async function bookmarkPost() {
    const result = await toggleBookmark(post.id);
    toast.success(result.bookmarked ? '已收藏' : '已取消收藏');
  }

  return (
    <article
      aria-labelledby={`post-title-${post.id}`}
      className={cn(
        'group/post flex gap-0 overflow-hidden rounded-2xl border border-border/80 bg-card shadow-card shadow-card-hover',
        'hover:border-primary/25 focus-within:border-primary/30 focus-within:ring-2 focus-within:ring-primary/10',
      )}
    >
      <div className="flex shrink-0 flex-col items-center gap-0.5 border-r border-border/40 bg-muted/50 px-1.5 py-3 sm:px-2">
        <VoteButtons
          score={post.score}
          myVote={post.myVote}
          orientation="vertical"
          size="sm"
          onVote={(v) => void votePost(post.id, v)}
        />
      </div>

      {/* 中: 内容主体 */}
      <div className="min-w-0 flex-1 px-3 py-3 sm:px-4">
        {/* Meta row */}
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] leading-tight text-muted-foreground">
          {post.board && (
            <Link
              href={`/?board=${encodeURIComponent(post.board.slug)}`}
              className="inline-flex min-h-6 items-center rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary transition-colors hover:bg-primary/20"
              onClick={(e) => e.stopPropagation()}
            >
              {post.board.name}
            </Link>
          )}
          <span aria-hidden className="text-border">·</span>
          <AuthorChip author={post.author} />
          <span aria-hidden className="text-border">·</span>
          <time dateTime={post.createdAt} className="tabular-nums">
            {relativeTime(post.createdAt)}
          </time>
          {post.isPinned && (
            <Badge variant="secondary" className="ml-0.5 gap-0.5 px-1.5 py-0 text-[10px]">
              <Pin className="size-2.5" /> 置顶
            </Badge>
          )}
          {post.isLocked && (
            <Badge variant="secondary" className="ml-0.5 gap-0.5 px-1.5 py-0 text-[10px]">
              <Lock className="size-2.5" /> 已锁定
            </Badge>
          )}
        </div>

        {/* Title + Excerpt (整块可点) */}
        <Link href={href} className="group/title mt-2 block rounded-sm">
          <h2
            id={`post-title-${post.id}`}
            className="text-pretty text-[15px] font-semibold leading-snug tracking-[-0.012em] transition-colors group-hover/title:text-primary sm:text-base"
          >
            {post.title}
          </h2>
          {post.contentExcerpt && (
            <p className="mt-1.5 line-clamp-2 text-[13px] leading-relaxed text-muted-foreground">
              {post.contentExcerpt}
            </p>
          )}
        </Link>

        {/* 含图片但无缩略图 */}
        {post.hasImages && !post.thumbnailUrl && (
          <div className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-muted/70 px-2 py-1 text-[11px] text-muted-foreground">
            <ImageIcon className="size-3.5" />
            <span>含图片</span>
          </div>
        )}

        {/* 图片网格 */}
        {post.imageUrls && post.imageUrls.length > 0 && (
          <Link
            href={href}
            className={cn(
              'mt-3 grid overflow-hidden rounded-xl border bg-muted',
              post.imageUrls.length === 1 ? 'grid-cols-1' : 'grid-cols-2',
            )}
          >
            {post.imageUrls.slice(0, 4).map((url, index) => (
              <div key={`${url}-${index}`} className="relative aspect-video min-h-0">
                <Image
                  src={url}
                  alt={`“${post.title}”的第 ${index + 1} 张配图`}
                  fill
                  sizes="(max-width: 640px) 90vw, 420px"
                  className="object-cover"
                  unoptimized
                />
                {index === 3 && post.imageUrls && post.imageUrls.length > 4 && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-sm font-semibold text-white">
                    +{post.imageUrls.length - 4}
                  </div>
                )}
              </div>
            ))}
          </Link>
        )}

        {/* Action row */}
        <div className="mt-2.5 flex flex-wrap items-center gap-0.5">
          <Button
            variant="ghost"
            size="sm"
            asChild
            className="h-9 gap-1.5 rounded-lg px-2.5 text-xs text-muted-foreground hover:bg-accent"
          >
            <Link href={href}>
              <MessageSquare className="size-3.5" />
              <span className="tabular-nums">{formatScore(post.commentCount)}</span>
              <span className="hidden sm:inline">评论</span>
            </Link>
          </Button>

          {isLoggedIn && !isOwnPost && (
            <DmButton
              originPostId={post.id}
              partnerLabel={
                post.author.type === 'anonymous' ? post.author.pseudonym.displayName : 'TA'
              }
            />
          )}

          <Button
            variant="ghost"
            size="sm"
            onClick={sharePost}
            className="h-9 gap-1.5 rounded-lg px-2.5 text-xs text-muted-foreground hover:bg-accent"
            aria-label={`分享帖子：${post.title}`}
          >
            <Share2 className="size-3.5" />
            <span className="hidden sm:inline">分享</span>
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={bookmarkPost}
            className="h-9 gap-1.5 rounded-lg px-2.5 text-xs text-muted-foreground hover:bg-accent"
            aria-label={`收藏帖子：${post.title}`}
          >
            <Bookmark className="size-3.5" />
            <span className="hidden sm:inline">收藏</span>
          </Button>

          <PostMoreMenu
            postId={post.id}
            authorIsAnonymous={post.author.type === 'anonymous'}
            currentUserRole={currentUserRole}
            isPinned={post.isPinned}
            isLocked={post.isLocked}
          />
        </div>
      </div>

      {/* 右: 缩略图 — 仅在无 imageUrls 时显示，避免与图片网格重复 */}
      {post.thumbnailUrl && !(post.imageUrls && post.imageUrls.length > 0) && (
        <Link
          href={href}
          className="relative my-3 mr-3 hidden size-24 shrink-0 overflow-hidden rounded-xl bg-muted ring-1 ring-border/60 transition-opacity hover:opacity-90 sm:block"
          aria-label={`查看帖子：${post.title}`}
        >
          <Image
            src={post.thumbnailUrl}
            alt={`帖子“${post.title}”的缩略图`}
            fill
            sizes="96px"
            className="object-cover"
            unoptimized
          />
        </Link>
      )}
    </article>
  );
}
