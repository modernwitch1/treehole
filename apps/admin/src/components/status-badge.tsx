import { Badge } from '@/components/ui/badge';
import type { ContentStatus, ReportStatus, UserRole, UserStatus } from '@/types/admin';

const USER_STATUS: Record<
  UserStatus,
  { label: string; variant: 'success' | 'warning' | 'destructive' }
> = {
  active: { label: '正常', variant: 'success' },
  suspended: { label: '禁言中', variant: 'warning' },
  banned: { label: '已封禁', variant: 'destructive' },
};

const USER_ROLE: Record<UserRole, { label: string; variant: 'muted' | 'warning' | 'default' }> = {
  user: { label: '用户', variant: 'muted' },
  moderator: { label: '版主', variant: 'warning' },
  admin: { label: '管理员', variant: 'default' },
};

const CONTENT_STATUS: Record<
  ContentStatus,
  { label: string; variant: 'success' | 'warning' | 'muted' | 'destructive' }
> = {
  published: { label: '已发布', variant: 'success' },
  pending_review: { label: '待审核', variant: 'warning' },
  hidden: { label: '已隐藏', variant: 'muted' },
  deleted: { label: '已删除', variant: 'destructive' },
};

const REPORT_STATUS: Record<
  ReportStatus,
  { label: string; variant: 'warning' | 'success' | 'muted' }
> = {
  open: { label: '待处理', variant: 'warning' },
  resolved: { label: '已处理', variant: 'success' },
  rejected: { label: '已驳回', variant: 'muted' },
};

export function UserStatusBadge({ status }: { status: UserStatus }) {
  const { label, variant } = USER_STATUS[status];
  return <Badge variant={variant}>{label}</Badge>;
}

export function UserRoleBadge({ role }: { role: UserRole }) {
  const { label, variant } = USER_ROLE[role];
  return <Badge variant={variant}>{label}</Badge>;
}

export function ContentStatusBadge({ status }: { status: ContentStatus }) {
  const { label, variant } = CONTENT_STATUS[status];
  return <Badge variant={variant}>{label}</Badge>;
}

export function ReportStatusBadge({ status }: { status: ReportStatus }) {
  const { label, variant } = REPORT_STATUS[status];
  return <Badge variant={variant}>{label}</Badge>;
}
