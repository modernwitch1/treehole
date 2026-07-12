'use client';

import * as React from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  ExternalLink,
  RefreshCw,
  Scale,
  ShieldAlert,
  UserSearch,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Pagination } from '@/components/pagination';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  claimModerationCase,
  decideModerationCase,
  getCurrentAdmin,
  listModerationCases,
  revealModerationCaseAuthor,
  type RevealedIdentity,
} from '@/lib/api';
import { relativeTime } from '@/lib/format';
import { WEB_APP_URL } from '@/lib/site-urls';
import type {
  AdminModerationCase,
  ModerationCaseStatus,
  ModerationDecision,
  ModerationSurface,
} from '@/types/admin';

const SURFACE_LABEL: Record<ModerationSurface, string> = {
  post: '帖子',
  comment: '评论',
  direct_message: '私信',
  chatroom_message: '聊天房消息',
  upload: '图片',
};

const STATUS_LABEL: Record<ModerationCaseStatus, string> = {
  pending: '待认领',
  in_review: '审核中',
  resolved: '已处置',
  dismissed: '已放行',
};

const DECISION_LABEL: Record<ModerationDecision, string> = {
  allow: '放行内容',
  warn: '放行并警告',
  hide: '隐藏内容',
  delete: '删除内容',
  suspend: '暂停账号',
  ban: '永久封禁',
};

const REASON_LABEL: Record<string, string> = {
  obfuscated_sensitive_term: '规避敏感词检测',
  link_flood: '大量外部链接',
  contact_solicitation: '联系方式引流',
  personal_data_exposure: '可能泄露个人信息',
  obfuscated_mask_rule: '规避脱敏规则',
  suspicious_link: '可疑短链、IDN 或 IP 链接',
  duplicate_content_burst: '短时重复发布相同内容',
  image_pending_review: '关联图片等待审核',
  manual_admin_flag: '管理员巡查标记',
  legacy_manual_flag: '历史巡查标记',
};

const RISK_LEVEL_GUIDE = [
  { level: 0, label: '无明显信号', detail: '未命中当前自动风控规则' },
  { level: 1, label: '自动脱敏', detail: '仅命中可自动遮蔽的低风险规则' },
  { level: 2, label: '媒体待审', detail: '图片或其他媒体等待人工确认' },
  { level: 3, label: '人工复核', detail: '隐私、可疑链接、引流或重复发布等信号' },
  { level: 4, label: '严重风险', detail: '硬拦截规则或严重分类，需要重点复核' },
] as const;

export default function ModerationPage() {
  const params = useSearchParams();
  const requestedStatus = params.get('status');
  const requestedCaseId = params.get('caseId')?.trim() || undefined;
  const initialStatus: ModerationCaseStatus | 'all' =
    requestedStatus === 'all' ||
    requestedStatus === 'pending' ||
    requestedStatus === 'in_review' ||
    requestedStatus === 'resolved' ||
    requestedStatus === 'dismissed'
      ? requestedStatus
      : 'pending';
  const [items, setItems] = React.useState<AdminModerationCase[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [adminId, setAdminId] = React.useState<string | null>(null);
  const [canUsePermanentActions, setCanUsePermanentActions] = React.useState(false);
  const [isSuperadmin, setIsSuperadmin] = React.useState(false);
  const [status, setStatus] = React.useState<ModerationCaseStatus | 'all'>(initialStatus);
  const [surface, setSurface] = React.useState<ModerationSurface | 'all'>('all');
  const [minRisk, setMinRisk] = React.useState(0);
  const [assignedToMe, setAssignedToMe] = React.useState(false);
  const [page, setPage] = React.useState(1);
  const [total, setTotal] = React.useState(0);
  const [totalPages, setTotalPages] = React.useState(0);
  const [claimingId, setClaimingId] = React.useState<string | null>(null);
  const [decisionCase, setDecisionCase] = React.useState<AdminModerationCase | null>(null);
  const [decision, setDecision] = React.useState<ModerationDecision>('allow');
  const [note, setNote] = React.useState('');
  const [sanctionDays, setSanctionDays] = React.useState(7);
  const [submitting, setSubmitting] = React.useState(false);
  const [identityCase, setIdentityCase] = React.useState<AdminModerationCase | null>(null);
  const [revealedIdentity, setRevealedIdentity] = React.useState<RevealedIdentity | null>(null);
  const [revealingIdentity, setRevealingIdentity] = React.useState(false);
  const sequence = React.useRef(0);

  const reload = React.useCallback(() => {
    const request = ++sequence.current;
    setLoading(true);
    Promise.all([
      listModerationCases(
        requestedCaseId
          ? {
              // 从申诉进入时案件 ID 是唯一筛选条件，避免被页面残留的
              // 状态/风险/认领人筛选掉，尤其是已结案的旧处罚案件。
              caseId: requestedCaseId,
              page: 1,
              pageSize: 20,
            }
          : {
              status: status === 'all' ? undefined : status,
              surface: surface === 'all' ? undefined : surface,
              minRisk: minRisk || undefined,
              assignedToMe,
              page,
              pageSize: 20,
            },
      ),
      getCurrentAdmin(),
    ])
      .then(([result, admin]) => {
        if (request !== sequence.current) return;
        setItems(result.items);
        setTotal(result.total);
        setTotalPages(result.totalPages);
        setAdminId(admin?.id ?? null);
        setCanUsePermanentActions(admin?.role === 'superadmin');
        setIsSuperadmin(admin?.role === 'superadmin');
        if (!requestedCaseId && result.items.length === 0 && page > 1) setPage(page - 1);
      })
      .catch((error: unknown) => {
        if (request === sequence.current) {
          toast.error((error as Error).message || '审核案件加载失败');
        }
      })
      .finally(() => {
        if (request === sequence.current) setLoading(false);
      });
  }, [assignedToMe, minRisk, page, requestedCaseId, status, surface]);

  React.useEffect(() => {
    reload();
  }, [reload]);

  React.useEffect(() => {
    if (loading || !window.location.hash) return;
    const target = document.getElementById(window.location.hash.slice(1));
    target?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [items, loading]);

  function updateFilter(callback: () => void) {
    setPage(1);
    callback();
  }

  async function claim(item: AdminModerationCase) {
    setClaimingId(item.id);
    try {
      await claimModerationCase(item.id, item.version);
      toast.success('案件已认领');
      setPage(1);
      setStatus('in_review');
      setAssignedToMe(true);
    } catch (error) {
      toast.error((error as Error).message || '认领失败，案件可能已被其他管理员更新');
      reload();
    } finally {
      setClaimingId(null);
    }
  }

  function openDecision(item: AdminModerationCase) {
    setDecisionCase(item);
    setDecision('allow');
    setNote('');
    setSanctionDays(7);
  }

  async function submitDecision() {
    if (!decisionCase) return;
    if (note.trim().length < 3) {
      toast.error('请填写至少 3 个字的处理说明');
      return;
    }
    setSubmitting(true);
    try {
      await decideModerationCase(decisionCase.id, {
        version: decisionCase.version,
        decision,
        note: note.trim(),
        sanctionDays: decision === 'suspend' ? sanctionDays : undefined,
      });
      toast.success(`案件已处理：${DECISION_LABEL[decision]}`);
      setDecisionCase(null);
      reload();
    } catch (error) {
      toast.error((error as Error).message || '处理失败，案件可能已被其他管理员更新');
      setDecisionCase(null);
      reload();
    } finally {
      setSubmitting(false);
    }
  }

  function closeIdentityDialog() {
    setIdentityCase(null);
    setRevealedIdentity(null);
    setRevealingIdentity(false);
  }

  async function revealIdentity() {
    if (!identityCase) return;
    setRevealingIdentity(true);
    try {
      const identity = await revealModerationCaseAuthor(identityCase.id);
      setRevealedIdentity(identity);
      toast.success('身份信息已调阅，本次查看已自动写入安全审计');
    } catch (error) {
      toast.error((error as Error).message || '无法查看案件关联身份');
    } finally {
      setRevealingIdentity(false);
    }
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">统一审核案件</h1>
          <p className="text-sm text-muted-foreground">
            自动风控命中的帖子、评论、私信与聊天消息统一排队 · 先认领再处置，防止并发覆盖
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={reload} disabled={loading}>
          <RefreshCw className={loading ? 'animate-spin' : ''} /> 刷新
        </Button>
      </header>

      {requestedCaseId && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-sm">
          正在定位关联案件 <strong className="font-mono">#{requestedCaseId}</strong>
          <Button size="sm" variant="ghost" className="ml-auto" asChild>
            <Link href="/moderation?status=all">清除定位</Link>
          </Button>
        </div>
      )}

      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="flex items-start gap-2">
            <ShieldAlert className="mt-0.5 size-4 shrink-0 text-primary" />
            <div>
              <p className="text-sm font-medium">自动风险等级如何判定</p>
              <p className="text-xs leading-5 text-muted-foreground">
                风险评分只用于发布拦截和审核分流，不是违规或处罚结论；语境、引用、讽刺及医学教育内容仍需人工判断。
              </p>
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
            {RISK_LEVEL_GUIDE.map((item) => (
              <div key={item.level} className="rounded-md border bg-muted/20 p-2.5">
                <div className="flex items-center gap-2">
                  <RiskBadge level={item.level} />
                  <span className="text-xs font-medium">{item.label}</span>
                </div>
                <p className="mt-1.5 text-[11px] leading-4 text-muted-foreground">{item.detail}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 p-4">
          <div className="min-w-36 space-y-1.5">
            <Label>案件状态</Label>
            <Select
              value={status}
              onValueChange={(value) =>
                updateFilter(() => setStatus(value as ModerationCaseStatus | 'all'))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部状态</SelectItem>
                <SelectItem value="pending">待认领</SelectItem>
                <SelectItem value="in_review">审核中</SelectItem>
                <SelectItem value="resolved">已处置</SelectItem>
                <SelectItem value="dismissed">已放行</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-40 space-y-1.5">
            <Label>内容场景</Label>
            <Select
              value={surface}
              onValueChange={(value) =>
                updateFilter(() => setSurface(value as ModerationSurface | 'all'))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部场景</SelectItem>
                {Object.entries(SURFACE_LABEL).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-36 space-y-1.5">
            <Label>最低风险</Label>
            <Select
              value={String(minRisk)}
              onValueChange={(value) => updateFilter(() => setMinRisk(Number(value)))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">全部等级</SelectItem>
                  <SelectItem value="1">1 级及以上</SelectItem>
                  <SelectItem value="2">2 级及以上</SelectItem>
                <SelectItem value="3">3 级及以上</SelectItem>
                <SelectItem value="4">仅 4 级</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <label className="flex h-9 cursor-pointer items-center gap-2 rounded-md border px-3 text-sm">
            <input
              type="checkbox"
              checked={assignedToMe}
              onChange={(event) => updateFilter(() => setAssignedToMe(event.target.checked))}
              className="size-4 accent-primary"
            />
            只看我认领的
          </label>
          <div className="ml-auto text-sm text-muted-foreground">共 {total} 个案件</div>
        </CardContent>
      </Card>

      {loading ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            加载中…
          </CardContent>
        </Card>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center text-sm text-muted-foreground">
            <CheckCircle2 className="size-9 text-[color:var(--success)]/50" />
            当前筛选下没有审核案件
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            const isOpen = item.status === 'pending' || item.status === 'in_review';
            const isMine = item.assignedTo?.id === adminId;
            const isAssignedElsewhere = Boolean(item.assignedTo && !isMine);
            const reasonCodes = reasonTokens(item.reasonCodes);
            const matchedRules = matchTokens(item.matchedRules);
            return (
              <Card
                id={`case-${item.id}`}
                key={item.id}
                className={item.riskLevel >= 4 ? 'border-destructive/40' : ''}
              >
                <CardContent className="space-y-3 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <RiskBadge level={item.riskLevel} />
                    <Badge variant="muted">{SURFACE_LABEL[item.surface]}</Badge>
                    <Badge
                      variant={
                        item.status === 'pending'
                          ? 'warning'
                          : item.status === 'in_review'
                            ? 'default'
                            : 'muted'
                      }
                    >
                      {STATUS_LABEL[item.status]}
                    </Badge>
                    {item.legalHold && <Badge variant="destructive">证据保全</Badge>}
                    <span className="text-xs text-muted-foreground">
                      <Clock3 className="mr-1 inline size-3" />
                      {relativeTime(item.createdAt)}
                    </span>
                    <span className="ml-auto font-mono text-xs text-muted-foreground">
                      案件 #{item.id} · v{item.version}
                    </span>
                  </div>

                  <div className="rounded-lg border bg-muted/20 p-3">
                    <p className="whitespace-pre-wrap break-words text-sm">
                      {item.contentExcerpt || '无可展示的内容摘要（证据仍在服务端保全）'}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-xs text-muted-foreground">命中原因（reasonCodes）：</span>
                      {reasonCodes.length > 0 ? (
                        reasonCodes.map((reason, index) => (
                          <Badge key={`${reason}-${index}`} variant="warning" title={reason}>
                            {REASON_LABEL[reason] ?? reason}
                            {REASON_LABEL[reason] && (
                              <span className="ml-1 font-mono text-[10px] opacity-70">{reason}</span>
                            )}
                          </Badge>
                        ))
                      ) : (
                        <span className="text-xs text-muted-foreground">无记录</span>
                      )}
                    </div>
                    {matchedRules.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-xs text-muted-foreground">命中规则：</span>
                        {matchedRules.map((match, index) => (
                          <Badge key={`${match}-${index}`} variant="outline">
                            {match}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 border-t pt-3">
                    {item.assignedTo ? (
                      <span className="text-xs text-muted-foreground">
                        审核人：
                        <span className="font-medium text-foreground">
                          {item.assignedTo.username}
                        </span>
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">尚未认领</span>
                    )}
                    {item.surface === 'post' && item.targetId && (
                      <Button size="sm" variant="ghost" asChild>
                        <a
                          href={`${WEB_APP_URL}/p/${item.targetId}`}
                          target="_blank"
                          rel="noopener"
                        >
                          查看原文 <ExternalLink />
                        </a>
                      </Button>
                    )}
                    {isSuperadmin && item.canRevealIdentity && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setIdentityCase(item);
                          setRevealedIdentity(null);
                        }}
                      >
                        <UserSearch /> 案件溯源
                      </Button>
                    )}
                    {item.surface === 'upload' && (
                      <Button className="ml-auto" size="sm" variant="outline" asChild>
                        <a href="/uploads">前往图片专用审核</a>
                      </Button>
                    )}
                    {item.surface !== 'upload' && isOpen && !item.assignedTo && (
                      <Button
                        className="ml-auto"
                        size="sm"
                        variant="outline"
                        disabled={claimingId === item.id}
                        onClick={() => void claim(item)}
                      >
                        <Scale /> {claimingId === item.id ? '认领中…' : '认领案件'}
                      </Button>
                    )}
                    {item.surface !== 'upload' && isOpen && isMine && (
                      <Button className="ml-auto" size="sm" onClick={() => openDecision(item)}>
                        <ShieldAlert /> 作出处置
                      </Button>
                    )}
                    {item.surface !== 'upload' && isOpen && isAssignedElsewhere && (
                      <span className="ml-auto text-xs text-muted-foreground">
                        已由其他管理员锁定处理
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {!requestedCaseId && totalPages > 1 && (
        <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
      )}

      <Dialog open={decisionCase !== null} onOpenChange={(open) => !open && setDecisionCase(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>处置审核案件 #{decisionCase?.id}</DialogTitle>
            <DialogDescription>
              决定会立即作用于内容；警告、暂停或封禁还会生成处罚记录。处理说明将提供给后续复核与申诉。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>处理决定</Label>
              <Select
                value={decision}
                onValueChange={(value) => setDecision(value as ModerationDecision)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(DECISION_LABEL)
                    .filter(
                      ([value]) =>
                        !['ban', 'delete'].includes(value) || canUsePermanentActions,
                    )
                    .filter(
                      ([value]) =>
                        Boolean(decisionCase?.targetId) || !['hide', 'delete'].includes(value),
                    )
                    .map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            {decision === 'suspend' && (
              <div className="space-y-2">
                <Label htmlFor="sanction-days">暂停天数（1–30 天）</Label>
                <Input
                  id="sanction-days"
                  type="number"
                  min={1}
                  max={30}
                  value={sanctionDays}
                  onChange={(event) =>
                    setSanctionDays(Math.min(30, Math.max(1, Number(event.target.value) || 1)))
                  }
                />
              </div>
            )}
            {(decision === 'suspend' || decision === 'ban') && (
              <div className="flex gap-2 rounded-md bg-destructive/10 p-3 text-xs text-destructive">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                该决定会撤销目标用户的现有登录会话。永久封禁仅超级管理员可执行。
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="moderation-note">处理说明（必填）</Label>
              <Textarea
                id="moderation-note"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="说明命中的规则、判断依据及处置必要性"
                rows={4}
                maxLength={1000}
                className="resize-none"
              />
              <p className="text-right text-xs text-muted-foreground">
                {note.trim().length}/1000（至少 3 字）
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" disabled={submitting} onClick={() => setDecisionCase(null)}>
              取消
            </Button>
            <Button
              variant={
                ['hide', 'delete', 'suspend', 'ban'].includes(decision) ? 'destructive' : 'default'
              }
              disabled={submitting || note.trim().length < 3}
              onClick={() => void submitDecision()}
            >
              {submitting ? '处理中…' : '确认并写入审计'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={identityCase !== null}
        onOpenChange={(open) => {
          if (!open && revealingIdentity) return;
          if (!open) closeIdentityDialog();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>案件 #{identityCase?.id} 身份溯源</DialogTitle>
            <DialogDescription>
              仅超级管理员可直接调阅。每次读取都会自动记录管理员账号、来源 IP、案件与时间。
            </DialogDescription>
          </DialogHeader>
          {revealedIdentity ? (
            <div className="space-y-3">
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
                <p className="text-xs font-medium text-destructive">敏感身份信息，请勿复制或外传</p>
                <p className="mt-3 text-sm font-semibold">{revealedIdentity.username}</p>
                <p className="mt-1 font-mono text-sm">{revealedIdentity.email}</p>
                <p className="mt-1 font-mono text-xs text-muted-foreground">
                  UID {revealedIdentity.id}
                </p>
              </div>
              <p className="text-xs text-muted-foreground">关闭窗口后，本页面会立即清除身份信息。</p>
            </div>
          ) : (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm leading-6">
              确认后将立即显示该案件关联账号的用户名、邮箱与 UID。请仅用于平台治理或依法协查，
              不得复制或向无关人员披露。
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" disabled={revealingIdentity} onClick={closeIdentityDialog}>
              {revealedIdentity ? '关闭并清除' : '取消'}
            </Button>
            {!revealedIdentity && (
              <Button
                variant="destructive"
                disabled={revealingIdentity}
                onClick={() => void revealIdentity()}
              >
                {revealingIdentity ? '读取中…' : '确认查看并自动留痕'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RiskBadge({ level }: { level: number }) {
  return (
    <Badge variant={level >= 4 ? 'destructive' : level >= 3 ? 'warning' : 'muted'}>
      风险 {level} 级
    </Badge>
  );
}

function reasonTokens(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string').slice(0, 8);
}

function matchTokens(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
      const record = item as Record<string, unknown>;
      const category = typeof record.category === 'string' ? record.category : '敏感内容';
      const action = typeof record.action === 'string' ? record.action : 'review';
      return `${category}/${action}${record.obfuscated === true ? '/规避' : ''}`;
    })
    .filter((item): item is string => Boolean(item))
    .slice(0, 8);
}
