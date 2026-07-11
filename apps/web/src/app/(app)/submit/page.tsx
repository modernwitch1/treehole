'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { ImagePlus, Loader2, X } from 'lucide-react';
import { createPost, listBoards, uploadPostImage } from '@/lib/api';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import type { Board } from '@/types/api';

export default function SubmitPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const boardParam = searchParams.get('board') ?? '';

  const [title, setTitle] = React.useState('');
  const [content, setContent] = React.useState('');
  const [selectedBoard, setSelectedBoard] = React.useState(boardParam);
  const [boards, setBoards] = React.useState<Board[]>([]);
  const [loadingBoards, setLoadingBoards] = React.useState(true);
  const [files, setFiles] = React.useState<File[]>([]);
  const [submitting, setSubmitting] = React.useState(false);
  const [isAnonymous, setIsAnonymous] = React.useState(true);

  React.useEffect(() => {
    listBoards()
      .then(setBoards)
      .catch(() => toast.error('加载板块列表失败'))
      .finally(() => setLoadingBoards(false));
  }, []);

  React.useEffect(() => {
    if (boardParam) {
      setSelectedBoard(boardParam);
    }
  }, [boardParam]);

  const contentLength = content.trim().length;
  const currentBoard = boards.find((b) => b.slug === selectedBoard);
  const publishAnonymously = Boolean(currentBoard?.allowsAnonymous && isAnonymous);

  React.useEffect(() => {
    if (currentBoard) setIsAnonymous(currentBoard.allowsAnonymous);
  }, [currentBoard]);

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

    setSubmitting(true);
    try {
      const imageUrls = files.length
        ? await Promise.all(files.map((file) => uploadPostImage(file).then((res) => res.url)))
        : [];
      const post = await createPost({
        title: title.trim(),
        contentMd: content.trim(),
        boardSlug: selectedBoard,
        isAnonymous: publishAnonymously,
        imageUrls,
      });
      toast.success('发布成功');
      router.push(`/p/${post.id}`);
    } catch {
      toast.error('发布失败，请重试');
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
                      <p className="truncate text-xs text-muted-foreground">
                        {board.allowsAnonymous ? '可选匿名' : '公开用户名'}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">发布身份</CardTitle>
            <CardDescription>
              {currentBoard
                ? currentBoard.allowsAnonymous
                  ? '这个板块允许你选择匿名昵称或公开账号用户名。'
                  : '这个板块要求公开账号用户名，校园邮箱和真实姓名仍不会展示。'
                : '选择板块后即可确认发布身份。'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
              <div className="min-w-0">
                <label htmlFor="anonymous-post" className="text-sm font-medium">
                  {publishAnonymously ? '匿名发布' : '公开用户名发布'}
                </label>
                <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                  {publishAnonymously
                    ? '使用同帖稳定、跨帖不可关联的匿名昵称。'
                    : '帖子会显示你的账号用户名，但不会显示校园邮箱或真实姓名。'}
                </p>
              </div>
              <Switch
                id="anonymous-post"
                checked={publishAnonymously}
                onCheckedChange={setIsAnonymous}
                disabled={!currentBoard?.allowsAnonymous}
                aria-label="匿名发布"
              />
            </div>
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
            <p className="text-xs text-muted-foreground">
              {!currentBoard
                ? '选择板块后会在这里显示发布身份说明。'
                : publishAnonymously
                  ? '本帖将以匿名昵称展示。'
                  : currentBoard.allowsAnonymous
                    ? '你已选择公开账号用户名发布。'
                    : '该板块要求公开账号用户名发布。'}
            </p>
          </CardContent>
        </Card>

        <Separator />

        <div className="flex items-center justify-end gap-3">
          <Button type="button" variant="outline" onClick={() => router.back()}>
            取消
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting && <Loader2 className="mr-2 size-4 animate-spin" />}
            {submitting ? '发布中…' : '发布帖子'}
          </Button>
        </div>
      </form>
    </div>
  );
}
