'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  MoreHorizontal,
  EyeOff,
  Eye,
  Pin,
  Lock,
  Trash2,
  ExternalLink,
  UserSearch,
  ShieldAlert,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { applyContentAction, revealContentAuthor, type RevealedIdentity } from '@/lib/api';
import { WEB_APP_URL } from '@/lib/site-urls';
import type { ContentStatus } from '@/types/admin';

interface ContentActionsMenuProps {
  kind: 'post' | 'comment';
  id: string;
  postId?: string;
  boardSlug?: string;
  status: ContentStatus;
  isAnonymous?: boolean;
  isPinned?: boolean;
  isLocked?: boolean;
  canRevealIdentity?: boolean;
  canDelete?: boolean;
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
  isAnonymous = false,
  isPinned,
  isLocked,
  canRevealIdentity = false,
  canDelete = false,
  onChanged,
}: ContentActionsMenuProps) {
  const [pending, setPending] = React.useState<Action>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [revealing, setRevealing] = React.useState(false);
  const [identityOpen, setIdentityOpen] = React.useState(false);
  const [identity, setIdentity] = React.useState<RevealedIdentity | null>(null);

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
      const revealed = await revealContentAuthor(kind, id);
      setIdentity(revealed);
      toast.success('身份信息已调阅，本次查看已自动写入审计日志');
    } catch (err) {
      toast.error((err as Error).message ?? '无法查看真实作者');
    } finally {
      setRevealing(false);
    }
  }

  function closeIdentityDialog() {
    if (revealing) return;
    setIdentityOpen(false);
    setIdentity(null);
  }

  const isPendingReview = status === 'pending_review';
  const isHidden = status === 'hidden';
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
          {canRevealIdentity && isAnonymous && (
            <>
              <DropdownMenuItem onClick={() => setIdentityOpen(true)} disabled={revealing}>
                <UserSearch /> 查看真实作者
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}
          {isPendingReview && (
            <DropdownMenuItem asChild>
              <Link href="/moderation?status=pending">
                <ShieldAlert /> 前往审核案件
              </Link>
            </DropdownMenuItem>
          )}
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
          {!isDeleted && canDelete && (
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
              {pending === 'hide' && '内容将立即从公开列表隔离，并保留处理与审计记录。'}
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

      <Dialog
        open={identityOpen}
        onOpenChange={(open) => {
          if (!open && revealing) return;
          if (open) setIdentityOpen(true);
          else closeIdentityDialog();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>查看真实作者</DialogTitle>
            <DialogDescription>
              仅超级管理员可直接调阅。每次读取都会自动记录管理员账号、来源 IP、目标与时间。
            </DialogDescription>
          </DialogHeader>
          {identity ? (
            <div className="space-y-3">
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
                <p className="text-xs font-medium text-destructive">敏感身份信息，请勿复制或外传</p>
                <p className="mt-3 text-sm font-semibold">{identity.username}</p>
                <p className="mt-1 font-mono text-sm">{identity.email}</p>
                <p className="mt-1 font-mono text-xs text-muted-foreground">UID {identity.id}</p>
              </div>
              <p className="text-xs text-muted-foreground">关闭窗口后本页面不再保留该信息。</p>
            </div>
          ) : (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm leading-6">
              确认后将立即显示该匿名内容作者的账号、邮箱与 UID。请只在确有管理需要时调阅，
              不得复制、传播或用于平台治理之外的用途。
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" disabled={revealing} onClick={closeIdentityDialog}>
              {identity ? '关闭并清除' : '取消'}
            </Button>
            {!identity && (
              <Button
                variant="destructive"
                disabled={revealing}
                onClick={() => void revealAuthor()}
              >
                {revealing ? '读取中…' : '确认查看并自动留痕'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
