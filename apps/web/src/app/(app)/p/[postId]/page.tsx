'use client';

import * as React from 'react';
import { notFound } from 'next/navigation';
import { getPost, listComments } from '@/lib/api';
import { PostCard } from '@/components/post-card';
import { CommentTree } from '@/components/comment-tree';
import { CommentComposer } from '@/components/comment-composer';
import { LoadMoreButton } from '@/components/load-more-button';
import type { Post, Comment } from '@/types/api';

interface PageProps {
  params: Promise<{
    postId: string;
  }>;
}

export default function PostPage({ params }: PageProps) {
  const { postId } = React.use(params);

  const [post, setPost] = React.useState<Post | null | undefined>(undefined);
  const [comments, setComments] = React.useState<Comment[]>([]);
  const [nextCursor, setNextCursor] = React.useState<string | undefined>(undefined);
  const [hasMore, setHasMore] = React.useState(false);
  const [isLoadingMore, setIsLoadingMore] = React.useState(false);
  const [error, setError] = React.useState(false);

  const reload = React.useCallback(() => {
    setError(false);
    Promise.all([getPost(postId), listComments(postId)])
      .then(([p, c]) => {
        setPost(p ?? null);
        setComments(c.items);
        setNextCursor(c.nextCursor);
        setHasMore(!!c.nextCursor);
      })
      .catch(() => {
        setError(true);
        setPost(null);
      });
  }, [postId]);

  React.useEffect(() => {
    reload();
  }, [reload]);

  const loadMore = React.useCallback(async () => {
    if (isLoadingMore || !nextCursor) return;
    setIsLoadingMore(true);
    try {
      const result = await listComments(postId, { cursor: nextCursor });
      setComments((prev) => [...prev, ...result.items]);
      setNextCursor(result.nextCursor);
      setHasMore(!!result.nextCursor);
    } catch (error) {
      console.error('Failed to load more comments:', error);
    } finally {
      setIsLoadingMore(false);
    }
  }, [isLoadingMore, nextCursor, postId]);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center p-8 gap-3">
        <p className="text-sm text-muted-foreground">加载失败，请稍后重试</p>
        <button
          type="button"
          onClick={reload}
          className="text-sm text-primary underline hover:no-underline"
        >
          重试
        </button>
      </div>
    );
  }

  if (post === undefined) {
    return (
      <div className="flex items-center justify-center p-8 text-sm text-muted-foreground">
        加载中…
      </div>
    );
  }

  if (!post) {
    notFound();
    return null;
  }

  return (
    <div className="flex-1 w-full max-w-full">
      <div className="py-6 px-4 md:px-6">
        <PostCard post={post} />

        <div className="mt-8">
          <h3 className="text-lg font-medium mb-4">评论</h3>
          <CommentComposer postId={postId} onCreated={reload} />

          <div className="mt-8">
            <CommentTree comments={comments} postId={postId} onChanged={reload} />
            <LoadMoreButton
              hasMore={hasMore}
              isLoading={isLoadingMore}
              onLoadMore={loadMore}
              label="加载更多评论"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
