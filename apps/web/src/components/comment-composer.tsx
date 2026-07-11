'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Image as ImageIcon, AtSign, Bold, Italic, Link as LinkIcon, Quote } from 'lucide-react';
import { cn } from '@/lib/utils';
import { createComment } from '@/lib/api';
import { toast } from 'sonner';
import type { Comment } from '@/types/api';

interface CommentComposerProps {
  postId: string;
  parentId?: string;
  autoFocus?: boolean;
  placeholder?: string;
  onCreated?: (comment: Comment) => void;
  onCancel?: () => void;
}

export function CommentComposer({
  postId,
  parentId,
  autoFocus,
  placeholder = '说点什么…',
  onCreated,
  onCancel,
}: CommentComposerProps) {
  const [content, setContent] = React.useState('');
  const [focused, setFocused] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const ref = React.useRef<HTMLTextAreaElement>(null);

  React.useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);

  function autoresize() {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 320)}px`;
  }

  function wrap(before: string, after = before) {
    const el = ref.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selected = content.slice(start, end);
    const next = `${content.slice(0, start)}${before}${selected}${after}${content.slice(end)}`;
    setContent(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + before.length, start + before.length + selected.length);
      autoresize();
    });
  }

  async function submit() {
    const text = content.trim();
    if (!text || submitting) return;
    setSubmitting(true);
    try {
      const comment = await createComment({ postId, parentId, contentMd: text, isAnonymous: true });
      setContent('');
      onCreated?.(comment);
      toast.success(parentId ? '回复已发布' : '评论已发布');
    } catch (err) {
      toast.error((err as Error).message || '发布失败');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className={cn('transition-shadow', focused && 'ring-1 ring-ring')}>
      <CardContent className="p-3">
        <textarea
          ref={ref}
          value={content}
          onChange={(e) => {
            setContent(e.target.value);
            autoresize();
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={placeholder}
          className="block min-h-[60px] w-full resize-none bg-transparent text-sm leading-relaxed placeholder:text-muted-foreground focus:outline-none"
        />

        {(focused || content.length > 0) && (
          <div className="mt-2 flex items-center gap-1 border-t pt-2">
            <ToolbarButton aria-label="加粗" onClick={() => wrap('**')}>
              <Bold className="size-4" />
            </ToolbarButton>
            <ToolbarButton aria-label="斜体" onClick={() => wrap('*')}>
              <Italic className="size-4" />
            </ToolbarButton>
            <ToolbarButton aria-label="链接" onClick={() => wrap('[', '](https://)')}>
              <LinkIcon className="size-4" />
            </ToolbarButton>
            <ToolbarButton aria-label="引用" onClick={() => setContent((v) => `${v}\n> `)}>
              <Quote className="size-4" />
            </ToolbarButton>
            <ToolbarButton aria-label="图片" onClick={() => wrap('![图片描述](', ')')}>
              <ImageIcon className="size-4" />
            </ToolbarButton>
            <ToolbarButton aria-label="提及" onClick={() => setContent((v) => `${v}@`)}>
              <AtSign className="size-4" />
            </ToolbarButton>

            <div className="ml-auto flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setContent('');
                  onCancel?.();
                }}
                disabled={!content && !parentId}
              >
                取消
              </Button>
              <Button
                size="sm"
                disabled={!content.trim() || submitting}
                onClick={() => void submit()}
              >
                {submitting ? '发布中…' : '发布'}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ToolbarButton({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
      {...props}
    >
      {children}
    </button>
  );
}
