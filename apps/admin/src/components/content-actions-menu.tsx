'use client';

import * as React from 'react';
import {
  MoreHorizontal,
  EyeOff,
  Eye,
  Pin,
  Lock,
  Trash2,
  ExternalLink,
  UserSearch,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { applyContentAction, revealContentAuthor } from '@/lib/api';
import { WEB_APP_URL } from '@/lib/site-urls';
import type { ContentStatus } from '@/types/admin';

interface ContentActionsMenuProps {
  kind: 'post' | 'comment';
  id: string;
  postId?: string;
  boardSlug?: string;
  status: ContentStatus;
  isPinned?: boolean;
  isLocked?: boolean;
  /** 操作后回调，由父组件刷新列表 */
  onChanged?: () => void;
}

type Action = 'hide' | 'restore' | 'pin' | 'unpin' | 'lock' | 'unlock' | 'delete' | null;

const LABELS: Record<Exclude<Action, null>, string> = {
  hide: '已隐藏',
  restore: '已恢复',
  pin: '已置顶',
  unpin: '已取消置顶',
  lock: '已锁定',
  unlock: '已解锁',
  delete: '已删除',
};

export function ContentActionsMenu({
  kind,
  id,
  postId,
  boardSlug,
  status,
  isPinned,
  isLocked,
  onChanged,
}: ContentActionsMenuProps) {
  const [pending, setPending] = React.useState<Action>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [revealing, setRevealing] = React.useState(false);

  async function confirm() {
    if (!pending) return;
    setSubmitting(true);
    try {
      await applyContentAction(kind, id, pending);
      toast.success(LABELS[pending]);
      setPending(null);
      onChanged?.();
    } catch (err) {
      toast.error((err as Error).message ?? '操作失败');
    } finally {
      setSubmitting(false);
    }
  }

  async function revealAuthor() {
    setRevealing(true);
    try {
      const identity = await revealContentAuthor(kind, id);
      toast.success(`真实作者: ${identity.username}`, {
        description: `${identity.email} · ID ${identity.id}`,
      });
    } catch (err) {
      toast.error((err as Error).message ?? '无法查看真实作者');
    } finally {
      setRevealing(false);
    }
  }

  const isHidden = status === 'hidden' || status === 'pending_review';
  const isDeleted = status === 'deleted';

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="size-8">
            <MoreHorizontal className="size-4" />
            <span className="sr-only">操作</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuLabel>{kind === 'post' ? '帖子' : '评论'}操作</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {boardSlug && (
            <DropdownMenuItem asChild>
              <a
                href={`${WEB_APP_URL}/p/${kind === 'comment' && postId ? postId : id}`}
                target="_blank"
                rel="noopener"
              >
                <ExternalLink /> 查看原文
              </a>
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={() => void revealAuthor()} disabled={revealing}>
            <UserSearch /> 查看真实作者
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {!isHidden && !isDeleted && (
            <DropdownMenuItem
              onClick={() => setPending('hide')}
              className="text-[color:var(--warning)] focus:text-[color:var(--warning)]"
            >
              <EyeOff /> 隐藏
            </DropdownMenuItem>
          )}
          {isHidden && !isDeleted && (
            <DropdownMenuItem onClick={() => setPending('restore')}>
              <Eye /> 恢复显示
            </DropdownMenuItem>
          )}
          {kind === 'post' && (
            <>
              <DropdownMenuItem onClick={() => setPending(isPinned ? 'unpin' : 'pin')}>
                <Pin /> {isPinned ? '取消置顶' : '置顶'}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setPending(isLocked ? 'unlock' : 'lock')}>
                <Lock /> {isLocked ? '解锁评论' : '锁定评论'}
              </DropdownMenuItem>
            </>
          )}
          <DropdownMenuSeparator />
          {!isDeleted && (
            <DropdownMenuItem
              onClick={() => setPending('delete')}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 /> 删除
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={pending !== null} onOpenChange={(o) => !o && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pending === 'delete'
                ? '确认删除?'
                : `确认${LABELS[pending ?? 'hide']?.replace('已', '') ?? ''}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pending === 'hide' && '内容将不在公开列表显示,作者会看到「审核中」提示。'}
              {pending === 'restore' && '内容将重新公开显示。'}
              {pending === 'delete' &&
                '软删除 90 天后才会真正硬删。期间作者和管理员仍可看到,可恢复。'}
              {pending === 'pin' && '该帖子将固定在标签顶部。'}
              {pending === 'unpin' && '取消置顶后该帖子回到正常排序。'}
              {pending === 'lock' && '锁定后无人能评论。'}
              {pending === 'unlock' && '解锁后用户可继续评论。'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>取消</AlertDialogCancel>
            <AlertDialogAction
              disabled={submitting}
              onClick={(e) => {
                e.preventDefault();
                void confirm();
              }}
              className={
                pending === 'delete' || pending === 'hide'
                  ? 'bg-destructive hover:bg-destructive/90'
                  : ''
              }
            >
              {submitting ? '处理中…' : '确认'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
