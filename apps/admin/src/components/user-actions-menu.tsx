'use client';

import * as React from 'react';
import { MoreHorizontal, UserX, Ban, RotateCcw, ShieldCheck, Eye, Mail } from 'lucide-react';
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
import { useRouter } from 'next/navigation';
import { suspendUser, banUser, unbanUser, setUserRole } from '@/lib/api';
import type { AdminUser } from '@/types/admin';

interface UserActionsMenuProps {
  user: AdminUser;
  /** 数据变更后回调，由父组件刷新列表 */
  onChanged?: () => void;
}

type Action = 'suspend' | 'ban' | 'unban' | 'promote' | 'demote' | null;

export function UserActionsMenu({ user, onChanged }: UserActionsMenuProps) {
  const [pending, setPending] = React.useState<Action>(null);
  const [reason, setReason] = React.useState('');
  const [days, setDays] = React.useState(7);
  const router = useRouter();

  function close() {
    setPending(null);
    setReason('');
    setDays(7);
  }

  async function confirm() {
    if (!pending) return;
    if (['suspend', 'ban', 'unban'].includes(pending) && reason.trim().length < 5) {
      toast.error('请填写至少 5 个字的具体依据');
      return;
    }
    try {
      switch (pending) {
        case 'suspend':
          await suspendUser(user.id, reason.trim(), days);
          break;
        case 'ban':
          await banUser(user.id, reason.trim());
          break;
        case 'unban':
          await unbanUser(user.id, reason.trim());
          break;
        case 'promote':
          await setUserRole(user.id, 'moderator');
          break;
        case 'demote':
          await setUserRole(user.id, 'user');
          break;
      }
      const labels: Record<Exclude<Action, null>, string> = {
        suspend: '已禁言',
        ban: '已封禁',
        unban: '已解封',
        promote: '已升级为版主',
        demote: '已降为普通用户',
      };
      toast.success(`${user.username} ${labels[pending]}`);
      close();
      if (onChanged) {
        onChanged();
      } else {
        router.refresh();
      }
    } catch (error) {
      toast.error((error as Error).message || '操作失败');
      close();
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="size-8">
            <MoreHorizontal className="size-4" />
            <span className="sr-only">操作</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuLabel>用户操作</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem>
            <Eye /> 查看主页
          </DropdownMenuItem>
          <DropdownMenuItem>
            <Mail /> 发送站内信
          </DropdownMenuItem>
          <DropdownMenuSeparator />

          {user.status === 'active' && (
            <>
              <DropdownMenuItem
                onClick={() => setPending('suspend')}
                className="text-[color:var(--warning)] focus:text-[color:var(--warning)]"
              >
                <UserX /> 禁言 7 天
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setPending('ban')}
                className="text-destructive focus:text-destructive"
              >
                <Ban /> 永久封禁
              </DropdownMenuItem>
            </>
          )}
          {(user.status === 'suspended' || user.status === 'banned') && (
            <DropdownMenuItem onClick={() => setPending('unban')}>
              <RotateCcw /> 解除限制
            </DropdownMenuItem>
          )}

          <DropdownMenuSeparator />
          {user.role === 'user' && (
            <DropdownMenuItem onClick={() => setPending('promote')}>
              <ShieldCheck /> 设为版主
            </DropdownMenuItem>
          )}
          {user.role === 'moderator' && (
            <DropdownMenuItem onClick={() => setPending('demote')}>
              <ShieldCheck /> 降为普通用户
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={pending !== null} onOpenChange={(o) => !o && close()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{getDialogTitle(pending, user.username)}</AlertDialogTitle>
            <AlertDialogDescription>{getDialogDesc(pending)}</AlertDialogDescription>
          </AlertDialogHeader>
          {pending && ['suspend', 'ban', 'unban'].includes(pending) && (
            <div className="space-y-3">
              {pending === 'suspend' && (
                <label className="block space-y-1.5 text-sm">
                  <span className="font-medium">暂停天数（1–30 天）</span>
                  <input
                    type="number"
                    min={1}
                    max={30}
                    value={days}
                    onChange={(event) =>
                      setDays(Math.min(30, Math.max(1, Number(event.target.value) || 1)))
                    }
                    className="h-9 w-full rounded-md border bg-background px-3"
                  />
                </label>
              )}
              <label className="block space-y-1.5 text-sm">
                <span className="font-medium">
                  {pending === 'unban' ? '解除限制依据' : '处罚事实与规则依据'}
                </span>
                <textarea
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  rows={4}
                  maxLength={1000}
                  placeholder="至少 5 个字；将写入处罚记录、审计日志并供申诉复核"
                  className="w-full resize-none rounded-md border bg-background p-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                />
                <span className="block text-right text-xs text-muted-foreground">
                  {reason.trim().length} / 1000
                </span>
              </label>
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              disabled={
                Boolean(pending && ['suspend', 'ban', 'unban'].includes(pending)) &&
                reason.trim().length < 5
              }
              onClick={(e) => {
                e.preventDefault();
                void confirm();
              }}
              className={
                pending === 'ban' || pending === 'suspend'
                  ? 'bg-destructive hover:bg-destructive/90'
                  : ''
              }
            >
              确认
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function getDialogTitle(action: Action, username: string): string {
  if (!action) return '';
  return (
    {
      suspend: `禁言 ${username}?`,
      ban: `永久封禁 ${username}?`,
      unban: `解除对 ${username} 的限制?`,
      promote: `设 ${username} 为版主?`,
      demote: `降 ${username} 为普通用户?`,
    } as const
  )[action];
}

function getDialogDesc(action: Action): string {
  if (!action) return '';
  return (
    {
      suspend: '该用户在 7 天内将无法发帖、评论、投票。操作会写入审计日志。',
      ban: '永久封禁后该用户邮箱将被加入黑名单,不可再注册。请谨慎操作。',
      unban: '用户将恢复全部权限。',
      promote: '该用户将获得隐藏帖子、锁帖、置顶、处理举报的权限。',
      demote: '该用户将失去版主权限,变成普通用户。',
    } as const
  )[action];
}
