'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { ImagePlus, Loader2, Quote, X } from 'lucide-react';
import { createPost, getPost, listBoards, uploadPostImage } from '@/lib/api';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import type { Board, Post } from '@/types/api';
import { CommunitySafetyNotice } from '@/components/community-safety-notice';

export default function SubmitPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const boardParam = searchParams.get('board') ?? '';
  const quotedPostId = searchParams.get('quote') ?? '';

  const [title, setTitle] = React.useState('');
  const [content, setContent] = React.useState('');
  const [selectedBoard, setSelectedBoard] = React.useState(boardParam);
  const [boards, setBoards] = React.useState<Board[]>([]);
  const [loadingBoards, setLoadingBoards] = React.useState(true);
  const [files, setFiles] = React.useState<File[]>([]);
  const [submitting, setSubmitting] = React.useState(false);
  const [quotedPost, setQuotedPost] = React.useState<Post | null>(null);
  const [rulesAcknowledged, setRulesAcknowledged] = React.useState(false);

  React.useEffect(() => {
    listBoards()
      .then(setBoards)
      .catch(() => toast.error('加载板块列表失败'))
      .finally(() => setLoadingBoards(false));
  }, []);

  React.useEffect(() => {
    if (!quotedPostId) return;
    getPost(quotedPostId)
      .then((post) => {
        setQuotedPost(post ?? null);
        if (post && !boardParam) setSelectedBoard(post.board.slug);
      })
      .catch(() => toast.error('无法加载引用的帖子'));
  }, [boardParam, quotedPostId]);

  React.useEffect(() => {
    if (boardParam) {
      setSelectedBoard(boardParam);
    }
  }, [boardParam]);

  const contentLength = content.trim().length;

  function addFiles(list: FileList | null) {
    if (!list) return;
    const images = Array.from(list).filter((file) => file.type.startsWith('image/'));
    setFiles((prev) => [...prev, ...images].slice(0, 4));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedBoard) {
      toast.error('请选择一个板块');
      return;
    }
    if (!title.trim()) {
      toast.error('请填写标题');
      return;
    }
    if (!content.trim()) {
      toast.error('请填写内容');
      return;
    }
    if (contentLength > 5000) {
      toast.error('内容最多 5000 字');
      return;
    }
    if (!rulesAcknowledged) {
      toast.error('请先确认已阅读并遵守社区规则');
      return;
    }

    setSubmitting(true);
    try {
      const imageUrls = files.length
        ? await Promise.all(files.map((file) => uploadPostImage(file).then((res) => res.url)))
        : [];
      const post = await createPost({
        title: title.trim(),
        contentMd: content.trim(),
        boardSlug: selectedBoard,
        isAnonymous: true,
        imageUrls,
        quotedPostId: quotedPost?.id,
        rulesAcknowledged,
      });
      if (post.status === 'pending_review') {
        toast.success('内容已提交审核', {
          description: '审核通过前不会公开显示，请勿重复发布。',
        });
        router.push('/');
      } else {
        toast.success('发布成功');
        router.push(`/p/${post.id}`);
      }
    } catch (error) {
      toast.error((error as Error).message || '发布失败，请重试');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">发布帖子</h1>
        <p className="text-sm text-muted-foreground">
          分享你的想法、问题或见闻。选择一个板块，让帖子被感兴趣的人看到。
        </p>
      </header>
      <Separator />
      <CommunitySafetyNotice />

      {quotedPost && (
        <Card className="border-primary/20 bg-primary/[0.03]">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base"><Quote className="size-4" /> 引用帖子发起讨论</CardTitle>
            <CardDescription>你的新帖子会保留指向原帖的引用卡片</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="font-semibold">{quotedPost.title}</p>
            {quotedPost.contentExcerpt && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{quotedPost.contentExcerpt}</p>}
          </CardContent>
        </Card>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">选择板块 *</CardTitle>
            <CardDescription>选择一个合适的板块发布你的帖子</CardDescription>
          </CardHeader>
          <CardContent>
            {loadingBoards ? (
              <div className="text-sm text-muted-foreground">加载中...</div>
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {boards.map((board) => (
                  <button
                    key={board.slug}
                    type="button"
                    onClick={() => setSelectedBoard(board.slug)}
                    className={cn(
                      'flex items-center gap-2 rounded-lg border p-3 text-left transition-colors',
                      selectedBoard === board.slug
                        ? 'border-primary bg-primary/5'
                        : 'hover:border-primary/30 hover:bg-muted/50',
                    )}
                  >
                    <span className="text-xl">{board.icon ?? '📋'}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{board.name}</p>
                      <p className="truncate text-xs text-muted-foreground">固定匿名发布</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">标题 *</CardTitle>
          </CardHeader>
          <CardContent>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="一句话概括你的帖子…"
              maxLength={200}
              required
              className="block w-full rounded-lg border border-input bg-transparent px-4 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">内容 *</CardTitle>
            <CardDescription>最多 5000 字，支持 Markdown 语法</CardDescription>
          </CardHeader>
          <CardContent>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="写点什么…（支持 Markdown）"
              rows={12}
              maxLength={5000}
              required
              className="block w-full resize-y rounded-lg border border-input bg-transparent px-4 py-3 text-sm leading-relaxed placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <p className="mt-2 text-xs text-muted-foreground tabular-nums">
              {content.length} / 5000
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">图片</CardTitle>
            <CardDescription>最多附加 4 张图片</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => document.getElementById('post-images')?.click()}
                disabled={files.length >= 4}
              >
                <ImagePlus className="size-4" />
                选择图片
              </Button>
              <input
                id="post-images"
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  addFiles(e.target.files);
                  e.target.value = '';
                }}
              />
              <span className="text-xs text-muted-foreground">{files.length} / 4</span>
            </div>
            {files.length > 0 && (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {files.map((file, index) => (
                  <div key={`${file.name}-${index}`} className="relative rounded-lg border p-2">
                    <p className="truncate pr-6 text-xs">{file.name}</p>
                    <button
                      type="button"
                      onClick={() => setFiles((prev) => prev.filter((_, i) => i !== index))}
                      className="absolute right-1 top-1 rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                      aria-label="移除图片"
                    >
                      <X className="size-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground">所有帖子固定匿名发布，公开名称统一显示为“浙小商”。</p>
          </CardContent>
        </Card>

        <CommunitySafetyNotice />

        <label className="flex cursor-pointer items-start gap-2 rounded-lg border p-3 text-sm">
          <input
            type="checkbox"
            checked={rulesAcknowledged}
            onChange={(event) => setRulesAcknowledged(event.target.checked)}
            className="mt-0.5"
          />
          <span>
            我确认内容不含违法低俗、诈骗广告、攻击造谣或隐私泄露信息，并理解匿名展示不等于不可追溯。
          </span>
        </label>

        <Separator />

        <div className="flex items-center justify-end gap-3">
          <Button type="button" variant="outline" onClick={() => router.back()}>
            取消
          </Button>
          <Button type="submit" disabled={submitting || !rulesAcknowledged}>
            {submitting && <Loader2 className="mr-2 size-4 animate-spin" />}
            {submitting ? '发布中…' : '发布帖子'}
          </Button>
        </div>
      </form>
    </div>
  );
}
