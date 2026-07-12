'use client';

import * as React from 'react';
import Link from 'next/link';
import { Bookmark, Copy, ExternalLink, Flag, MoreHorizontal, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ReportDialog } from '@/components/report-dialog';
import { toggleBookmark } from '@/lib/api';
import { toast } from 'sonner';
import type { UserRole } from '@/types/api';

const ADMIN_URL =
  process.env.NEXT_PUBLIC_ADMIN_URL ??
  (process.env.NODE_ENV === 'production'
    ? 'https://manage.unidating.top'
    : 'http://localhost:3002');

interface PostMoreMenuProps {
  postId: string;
  authorIsAnonymous: boolean;
  currentUserRole?: UserRole | null;
  isPinned?: boolean;
  isLocked?: boolean;
}

/** "更多" 下拉,普通用户看见举报/收藏/复制链接;管理员额外看到后台入口 */
export function PostMoreMenu({ postId, currentUserRole }: PostMoreMenuProps) {
  const isMod =
    currentUserRole === 'superadmin' ||
    currentUserRole === 'admin' ||
    currentUserRole === 'moderator';

  async function copyLink() {
    await navigator.clipboard.writeText(`${window.location.origin}/p/${postId}`);
    toast.success('链接已复制');
  }

  async function bookmark() {
    const result = await toggleBookmark(postId);
    toast.success(result.bookmarked ? '已收藏' : '已取消收藏');
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="ml-auto size-7 rounded-full text-muted-foreground"
          aria-label="更多"
          onClick={(e) => e.stopPropagation()}
        >
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-44" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuItem onClick={bookmark}>
          <Bookmark /> 收藏
        </DropdownMenuItem>
        <DropdownMenuItem onClick={copyLink}>
          <Copy /> 复制链接
        </DropdownMenuItem>
        <ReportDialog
          targetType="post"
          targetId={postId}
          trigger={
            <DropdownMenuItem
              onSelect={(e) => e.preventDefault()}
              onClick={(e) => e.stopPropagation()}
            >
              <Flag /> 举报
            </DropdownMenuItem>
          }
        />

        {isMod && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="flex items-center gap-1.5 text-xs">
              <Shield className="size-3" /> 管理员操作
            </DropdownMenuLabel>
            <DropdownMenuItem asChild>
              <Link href={`${ADMIN_URL}/content?tab=posts#${postId}`} target="_blank">
                <ExternalLink /> 在后台打开
              </Link>
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
