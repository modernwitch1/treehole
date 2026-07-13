'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { MoreHorizontal, Flag, ShieldX, ArrowLeft, Hash } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ReportDialog } from '@/components/report-dialog';
import { blockConversation } from '@/lib/api';
import { toast } from 'sonner';
import type { Conversation } from '@/types/api';

interface ConversationHeaderProps {
  conversation: Conversation;
}

export function ConversationHeader({ conversation: c }: ConversationHeaderProps) {
  const router = useRouter();

  async function onBlock() {
    if (!confirm(`拉黑 ${c.partner.displayName}? 该会话将不能再发消息。`)) return;
    try {
      await blockConversation(c.id);
      toast.success('已拉黑对方');
      router.refresh();
    } catch (error) {
      toast.error((error as Error).message || '拉黑失败，请稍后重试');
    }
  }

  return (
    <header className="flex items-start gap-3 border-b pb-3">
      <Button variant="ghost" size="icon" className="size-8" asChild>
        <Link href="/messages" aria-label="返回收件箱">
          <ArrowLeft className="size-4" />
        </Link>
      </Button>

      <div
        className="flex size-10 shrink-0 items-center justify-center rounded-full text-base font-bold text-white"
        style={{ background: c.partner.color }}
        aria-hidden
      >
        {c.partner.conversationCode.slice(0, 1)}
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-base font-semibold">{c.partner.displayName}</p>
        {c.origin && (
          <Link
            href={`/p/${c.origin.postId}`}
            className="mt-0.5 inline-flex items-center gap-1 truncate text-xs text-muted-foreground hover:underline"
          >
            <Hash className="size-3 shrink-0" />
            <span className="truncate">
              来源帖子: {c.origin.postTitle} · {c.origin.tag}
            </span>
          </Link>
        )}
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="size-8" aria-label="更多">
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <ReportDialog
            targetType="conversation"
            targetId={c.id}
            title="举报本次私信会话"
            trigger={
              <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                <Flag /> 举报会话
              </DropdownMenuItem>
            }
          />
          <DropdownMenuItem onClick={onBlock} className="text-destructive focus:text-destructive">
            <ShieldX /> 拉黑会话
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
