'use client';

import * as React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { PostCard } from '@/components/post-card';
import { LoadMoreButton } from '@/components/load-more-button';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertCircle, Layers3, RotateCcw } from 'lucide-react';
import { listPosts } from '@/lib/api';
import type { Post, SortType, UserRole } from '@/types/api';

interface PostListInfiniteProps {
  initialPosts: Post[];
  initialNextCursor?: string;
  limit?: number;
  sort?: SortType;
  tag?: string;
  q?: string;
  currentUserRole?: UserRole | null;
  isLoggedIn?: boolean;
  layout?: 'list' | 'grid';
}

export function PostListInfinite({
  initialPosts,
  initialNextCursor,
  limit = 20,
  sort,
  tag,
  q,
  currentUserRole,
  isLoggedIn,
  layout = 'list',
}: PostListInfiniteProps) {
  const [posts, setPosts] = useState<Post[]>(initialPosts);
  const [nextCursor, setNextCursor] = useState<string | undefined>(initialNextCursor);
  const [isLoading, setIsLoading] = useState(false);
  const [hasMore, setHasMore] = useState(!!initialNextCursor);
  const [loadError, setLoadError] = useState(false);
  const observerRef = useRef<HTMLDivElement>(null);
  const loadingRef = useRef(false);
  const requestIdRef = useRef(0);

  // Reset when filter params change
  useEffect(() => {
    setPosts(initialPosts);
    setNextCursor(initialNextCursor);
    setHasMore(!!initialNextCursor);
    setLoadError(false);
    setIsLoading(false);
    loadingRef.current = false;
    requestIdRef.current += 1;
  }, [initialPosts, initialNextCursor, limit, sort, tag, q]);

  const loadMore = useCallback(async () => {
    if (loadingRef.current || !nextCursor) return;

    loadingRef.current = true;
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setIsLoading(true);
    setLoadError(false);
    try {
      const result = await listPosts({ sort, tag, q, cursor: nextCursor, limit });
      if (requestId !== requestIdRef.current) return;
      setPosts((previous) => {
        const seen = new Set(previous.map((post) => post.id));
        const uniqueItems = result.items.filter((post) => !seen.has(post.id));
        return [...previous, ...uniqueItems];
      });
      setNextCursor(result.nextCursor);
      setHasMore(!!result.nextCursor);
    } catch {
      if (requestId === requestIdRef.current) setLoadError(true);
    } finally {
      if (requestId === requestIdRef.current) {
        loadingRef.current = false;
        setIsLoading(false);
      }
    }
  }, [limit, nextCursor, sort, tag, q]);

  // Intersection Observer for infinite scroll
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoading && nextCursor) {
          loadMore();
        }
      },
      { rootMargin: '400px 0px', threshold: 0.01 },
    );

    const currentRef = observerRef.current;
    if (currentRef) {
      observer.observe(currentRef);
    }

    return () => {
      if (currentRef) {
        observer.unobserve(currentRef);
      }
    };
  }, [hasMore, isLoading, nextCursor, loadMore]);

  return (
    <div className="space-y-3">
      <div
        className={
          layout === 'grid'
            ? 'grid grid-cols-1 items-start gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4'
            : 'space-y-2'
        }
      >
        {posts.map((post) => (
          <PostCard
            key={post.id}
            post={post}
            currentUserRole={currentUserRole}
            isLoggedIn={isLoggedIn}
            variant={layout === 'grid' ? 'compact' : 'default'}
          />
        ))}
      </div>

      {/* Intersection observer target */}
      {hasMore && <div ref={observerRef} className="h-4" />}

      {/* Loading indicator */}
      {isLoading && (
        <div
          className={
            layout === 'grid'
              ? 'grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4'
              : 'space-y-2'
          }
        >
          {Array.from({ length: layout === 'grid' ? 4 : 2 }).map((_, index) => (
            <Skeleton
              key={index}
              className={layout === 'grid' ? 'h-48 w-full rounded-xl' : 'h-28 w-full rounded-xl'}
            />
          ))}
        </div>
      )}

      {/* Load more button (fallback for manual loading) */}
      {!isLoading && !loadError && (
        <LoadMoreButton hasMore={hasMore} isLoading={isLoading} onLoadMore={loadMore} />
      )}

      {loadError && (
        <div
          className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-destructive/30 bg-destructive/5 px-4 py-5 text-center"
          role="status"
          aria-live="polite"
        >
          <div className="flex items-center gap-2 text-sm text-destructive">
            <AlertCircle className="size-4" /> 暂时没能加载更多帖子
          </div>
          <Button variant="outline" size="sm" onClick={() => void loadMore()}>
            <RotateCcw className="size-3.5" /> 重试
          </Button>
        </div>
      )}

      {/* Empty state */}
      {posts.length === 0 && (
        <div className="flex flex-col items-center rounded-2xl border border-dashed bg-card/50 px-4 py-14 text-center">
          <Layers3 className="size-9 text-muted-foreground/40" />
          <p className="mt-3 font-medium">暂无帖子</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {q ? '换个关键词试试，或稍后再来看看。' : '这里还没有内容，欢迎发布第一篇帖子。'}
          </p>
        </div>
      )}
    </div>
  );
}
