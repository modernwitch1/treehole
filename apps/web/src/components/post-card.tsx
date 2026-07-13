'use client';

import * as React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { MessageSquare, Share2, Bookmark, Pin, Lock, Quote } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { LikeButton } from '@/components/like-button';
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
  currentUserRole?: UserRole | null;
  isOwnPost?: boolean;
  isLoggedIn?: boolean;
  variant?: 'default' | 'compact' | 'detail';
}

export function PostCard({
  post,
  currentUserRole,
  isOwnPost,
  isLoggedIn,
  variant = 'default',
}: PostCardProps) {
  const href = `/p/${post.id}`;
  const images = post.imageUrls ?? [];
  const compact = variant === 'compact';
  const detail = variant === 'detail';
  // The explore grid only needs a visual cue. Keep the full gallery for the
  // detail page so a dense feed does not eagerly render four large images per card.
  const previewImages = compact ? images.slice(0, 1) : images.slice(0, 4);

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
      if ((error as Error).name !== 'AbortError') toast.error('分享失败，请稍后重试');
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
        'group/post overflow-hidden border border-border/75 bg-card shadow-card shadow-card-hover transition-[border-color,box-shadow] hover:border-primary/25 focus-within:ring-2 focus-within:ring-primary/10 [&_svg]:stroke-[1.8]',
        compact ? 'rounded-lg' : 'rounded-xl',
      )}
    >
      <div className={compact ? 'px-3 pb-2.5 pt-3' : 'px-4 pb-3.5 pt-4 sm:px-5 sm:pt-5'}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground">
            <AuthorChip author={post.author} />
            <span aria-hidden>·</span>
            <time dateTime={post.createdAt} className="tabular-nums">
              {relativeTime(post.createdAt)}
            </time>
            {post.board && (
              <>
                <span aria-hidden>·</span>
                <Link
                  href={`/board/${encodeURIComponent(post.board.slug)}`}
                  className="font-medium text-primary hover:underline"
                >
                  {post.board.name}
                </Link>
              </>
            )}
            {post.isPinned && (
              <Badge variant="secondary" className="gap-1 px-1.5 py-0 text-[10px]">
                <Pin className="size-2.5" /> 置顶
              </Badge>
            )}
            {post.isLocked && (
              <Badge variant="secondary" className="gap-1 px-1.5 py-0 text-[10px]">
                <Lock className="size-2.5" /> 已锁定
              </Badge>
            )}
          </div>
          <PostMoreMenu
            postId={post.id}
            authorIsAnonymous={post.author.type === 'anonymous'}
            currentUserRole={currentUserRole}
            isPinned={post.isPinned}
            isLocked={post.isLocked}
          />
        </div>

        <Link href={href} className={compact ? 'mt-2 block' : 'mt-3 block'}>
          <h2
            id={`post-title-${post.id}`}
            className={cn(
              'text-pretty font-semibold leading-snug tracking-[-0.02em] transition-colors group-hover/post:text-primary',
              compact ? 'line-clamp-2 text-[15px]' : 'text-[17px] sm:text-lg',
            )}
          >
            {post.title}
          </h2>
          {!detail && post.contentExcerpt && (
            <p
              className={cn(
                'whitespace-pre-line text-muted-foreground',
                compact
                  ? 'mt-1.5 line-clamp-2 text-xs leading-5'
                  : 'mt-2 line-clamp-3 text-sm leading-6 sm:text-[15px]',
              )}
            >
              {post.contentExcerpt}
            </p>
          )}
        </Link>

        {detail && post.contentHtml && (
          <div
            className="mt-4 whitespace-normal break-words text-[15px] leading-7 text-foreground [&_a]:text-primary [&_a]:underline [&_blockquote]:border-l-4 [&_blockquote]:border-border [&_blockquote]:pl-4 [&_img]:mt-4 [&_img]:max-h-[720px] [&_img]:w-auto [&_img]:max-w-full [&_img]:rounded-xl [&_img]:object-contain [&_p+p]:mt-3"
            dangerouslySetInnerHTML={{ __html: post.contentHtml }}
          />
        )}

        {detail && !post.contentHtml && post.contentMd && (
          <p className="mt-4 whitespace-pre-wrap break-words text-[15px] leading-7 text-foreground">
            {post.contentMd}
          </p>
        )}

        {post.quotedPost && (
          <Link
            href={`/p/${post.quotedPost.id}`}
            className={cn(
              'block border border-border/70 bg-muted/35 transition-colors hover:bg-muted/60',
              compact ? 'mt-2 rounded-lg p-2.5' : 'mt-3 rounded-lg p-3',
            )}
          >
            <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
              <Quote className="size-3.5" /> 引用自 {post.quotedPost.board.name}
            </div>
            <p className="mt-1.5 line-clamp-1 text-sm font-semibold text-foreground">
              {post.quotedPost.title}
            </p>
            {post.quotedPost.contentExcerpt && (
              <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                {post.quotedPost.contentExcerpt}
              </p>
            )}
          </Link>
        )}
      </div>

      {!detail && previewImages.length > 0 && (
        <Link
          href={href}
          aria-label={`查看帖子“${post.title}”的图片`}
          className={cn(
            compact
              ? 'mx-0 mb-0 grid overflow-hidden border-y border-border/60 bg-muted'
              : 'mx-3 mb-2 grid overflow-hidden rounded-lg border border-border/60 bg-muted sm:mx-4',
            previewImages.length === 1 ? 'grid-cols-1' : 'grid-cols-2 gap-px',
          )}
        >
          {previewImages.map((url, index) => (
            <div
              key={`${url}-${index}`}
              className={cn(
                'relative min-h-0 overflow-hidden bg-muted',
                previewImages.length === 1 &&
                  (compact ? 'aspect-[16/9]' : 'aspect-[16/10] max-h-[480px]'),
                previewImages.length === 2 && 'aspect-square',
                previewImages.length === 3 && index === 0 && 'row-span-2 aspect-square',
                previewImages.length === 3 && index > 0 && 'aspect-[2/1]',
                previewImages.length === 4 && 'aspect-[4/3]',
              )}
            >
              <Image
                src={url}
                alt={`“${post.title}”的第 ${index + 1} 张配图`}
                fill
                sizes={
                  compact
                    ? '(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 33vw'
                    : previewImages.length === 1
                      ? '(max-width: 768px) 100vw, 680px'
                      : '(max-width: 768px) 50vw, 340px'
                }
                className="object-cover"
                unoptimized
              />
              {((compact && index === 0 && images.length > 1) ||
                (!compact && index === 3 && images.length > 4)) && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/55 text-xl font-semibold text-white">
                  +{images.length - (compact ? 1 : 4)}
                </div>
              )}
            </div>
          ))}
        </Link>
      )}

      <div
        className={cn(
          'flex items-center gap-1 border-t border-border/50',
          compact ? 'px-2.5 py-2' : 'px-3 py-2 sm:px-4',
        )}
      >
        <LikeButton
          count={post.upvotes}
          liked={post.myVote === 1}
          onChange={(liked) => votePost(post.id, liked ? 1 : 0)}
        />
        <Button
          variant="ghost"
          size="sm"
          asChild
          className="h-8 gap-1.5 rounded-full px-2.5 text-xs text-muted-foreground"
        >
          <Link href={href}>
            <MessageSquare className="size-4" />
            <span className="tabular-nums">{formatScore(post.commentCount)}</span>
          </Link>
        </Button>
        {!compact && isLoggedIn && !isOwnPost && (
          <DmButton
            originPostId={post.id}
            partnerLabel={
              post.author.type === 'anonymous' ? post.author.pseudonym.displayName : 'TA'
            }
          />
        )}
        <div className="ml-auto flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            asChild
            className="size-8 rounded-full text-muted-foreground"
          >
            <Link href={`/submit?quote=${post.id}`} aria-label={`引用帖子：${post.title}`}>
              <Quote className="size-4" />
            </Link>
          </Button>
          {!compact && (
            <Button
              variant="ghost"
              size="icon"
              onClick={sharePost}
              className="size-8 rounded-full text-muted-foreground"
              aria-label={`分享帖子：${post.title}`}
            >
              <Share2 className="size-4" />
            </Button>
          )}
          {!compact && (
            <Button
              variant="ghost"
              size="icon"
              onClick={bookmarkPost}
              className="size-8 rounded-full text-muted-foreground"
              aria-label={`收藏帖子：${post.title}`}
            >
              <Bookmark className="size-4" />
            </Button>
          )}
        </div>
      </div>
    </article>
  );
}
