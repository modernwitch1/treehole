'use client';

import * as React from 'react';
import Image from 'next/image';
import {
  Check,
  Copy,
  Loader2,
  Mail,
  Plus,
  RefreshCw,
  ShieldOff,
  Store,
  UserRound,
  Utensils,
  X,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import {
  applyFoodContentAction,
  createFoodCanteenAdmin,
  createMerchantPortalInvitationAdmin,
  createFoodMerchantAdmin,
  createFoodWindowAdmin,
  getFoodStatsAdmin,
  listFoodCanteensAdmin,
  listFoodInvitationsAdmin,
  listFoodMerchantsAdmin,
  listFoodPostsAdmin,
  listFoodProductsAdmin,
  listFoodRepliesAdmin,
  listFoodReviewsAdmin,
  listFoodStaffAdmin,
  revokeFoodInvitationAdmin,
  revokeFoodStaffAdmin,
  updateFoodCanteenAdmin,
  updateFoodMerchantAdmin,
  updateFoodStaffAdmin,
  updateFoodWindowAdmin,
} from '@/lib/api';
import type {
  AdminFoodCanteen,
  AdminFoodInvitation,
  AdminFoodMerchant,
  AdminFoodPost,
  AdminFoodProduct,
  AdminFoodReply,
  AdminFoodReview,
  AdminFoodStaff,
  AdminFoodStats,
  ContentStatus,
} from '@/types/admin';

type FoodModerationKind = 'posts' | 'products' | 'reviews' | 'replies';

export default function FoodAdminPage() {
  const [merchants, setMerchants] = React.useState<AdminFoodMerchant[]>([]);
  const [posts, setPosts] = React.useState<AdminFoodPost[]>([]);
  const [products, setProducts] = React.useState<AdminFoodProduct[]>([]);
  const [reviews, setReviews] = React.useState<AdminFoodReview[]>([]);
  const [replies, setReplies] = React.useState<AdminFoodReply[]>([]);
  const [canteens, setCanteens] = React.useState<AdminFoodCanteen[]>([]);
  const [staff, setStaff] = React.useState<AdminFoodStaff[]>([]);
  const [invitations, setInvitations] = React.useState<AdminFoodInvitation[]>([]);
  const [stats, setStats] = React.useState<AdminFoodStats | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [message, setMessage] = React.useState('');
  const [queueStatus, setQueueStatus] = React.useState<ContentStatus>('pending_review');
  const [queuePage, setQueuePage] = React.useState(1);
  const [queueQuery, setQueueQuery] = React.useState('');
  const [queueInput, setQueueInput] = React.useState('');
  const [queueMeta, setQueueMeta] = React.useState({
    posts: 0,
    products: 0,
    reviews: 0,
    replies: 0,
  });
  const [selected, setSelected] = React.useState<Record<string, boolean>>({});
  const [editingMerchantId, setEditingMerchantId] = React.useState('');
  const [merchantDraft, setMerchantDraft] = React.useState({
    name: '',
    description: '',
    contactDisplay: '',
  });
  const [editingCanteenId, setEditingCanteenId] = React.useState('');
  const [canteenDraft, setCanteenDraft] = React.useState({ name: '', description: '' });
  const [editingWindowId, setEditingWindowId] = React.useState('');
  const [windowDraft, setWindowDraft] = React.useState({
    name: '',
    windowNumber: '',
    floor: '2',
    locationDescription: '',
  });
  const [newMerchant, setNewMerchant] = React.useState({ slug: '', name: '' });
  const [newCanteen, setNewCanteen] = React.useState({ slug: '', name: '' });
  const [invite, setInvite] = React.useState<{
    merchantId: string;
    email: string;
    role: 'owner' | 'editor' | 'viewer';
  }>({ merchantId: '', email: '', role: 'editor' });
  const [windowForm, setWindowForm] = React.useState({
    merchantId: '',
    canteenId: '',
    name: '',
    windowNumber: '',
    locationDescription: '',
    floor: '2',
  });
  const [inviteUrl, setInviteUrl] = React.useState('');
  const [formBusy, setFormBusy] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const [
        merchantResult,
        postResult,
        productResult,
        reviewResult,
        replyResult,
        canteenItems,
        statsItem,
        staffResult,
        invitationResult,
      ] = await Promise.all([
        listFoodMerchantsAdmin({ pageSize: 50 }),
        listFoodPostsAdmin({
          status: queueStatus,
          q: queueQuery || undefined,
          page: queuePage,
          pageSize: 20,
        }),
        listFoodProductsAdmin({
          status: queueStatus,
          q: queueQuery || undefined,
          page: queuePage,
          pageSize: 20,
        }),
        listFoodReviewsAdmin({
          status: queueStatus,
          q: queueQuery || undefined,
          page: queuePage,
          pageSize: 20,
        }),
        listFoodRepliesAdmin({
          status: queueStatus,
          q: queueQuery || undefined,
          page: queuePage,
          pageSize: 20,
        }),
        listFoodCanteensAdmin(),
        getFoodStatsAdmin(),
        listFoodStaffAdmin({ pageSize: 50 }),
        listFoodInvitationsAdmin({ status: 'pending', pageSize: 50 }),
      ]);
      setMerchants(merchantResult.items);
      setPosts(postResult.items);
      setProducts(productResult.items);
      setReviews(reviewResult.items);
      setReplies(replyResult.items);
      setCanteens(canteenItems);
      setStats(statsItem);
      setStaff(staffResult.items);
      setInvitations(invitationResult.items);
      setQueueMeta({
        posts: postResult.totalPages,
        products: productResult.totalPages,
        reviews: reviewResult.totalPages,
        replies: replyResult.totalPages,
      });
      setSelected({});
      setInvite((current) => ({
        ...current,
        merchantId: current.merchantId || merchantResult.items[0]?.id || '',
      }));
      setWindowForm((current) => ({
        ...current,
        merchantId: current.merchantId || merchantResult.items[0]?.id || '',
        canteenId: current.canteenId || canteenItems[0]?.id || '',
      }));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '加载美食管理数据失败');
    } finally {
      setLoading(false);
    }
  }, [queuePage, queueQuery, queueStatus]);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function handleCreateMerchant(event: React.FormEvent) {
    event.preventDefault();
    if (formBusy) return;
    setFormBusy('merchant');
    try {
      await createFoodMerchantAdmin(newMerchant);
      setNewMerchant({ slug: '', name: '' });
      setMessage('商家创建成功');
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '创建失败');
    } finally {
      setFormBusy(null);
    }
  }

  async function handleCreateCanteen(event: React.FormEvent) {
    event.preventDefault();
    if (formBusy) return;
    setFormBusy('canteen');
    try {
      await createFoodCanteenAdmin(newCanteen);
      setNewCanteen({ slug: '', name: '' });
      setMessage('食堂创建成功');
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '创建失败');
    } finally {
      setFormBusy(null);
    }
  }

  async function handleInvite(event: React.FormEvent) {
    event.preventDefault();
    if (formBusy) return;
    setFormBusy('invite');
    try {
      const result = await createMerchantPortalInvitationAdmin(invite.merchantId, {
        email: invite.email,
        role: invite.role,
      });
      setInviteUrl(result.inviteUrl);
      setMessage('商家后台邀请已生成，请复制链接交给员工');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '邀请失败');
    } finally {
      setFormBusy(null);
    }
  }

  async function handleCreateWindow(event: React.FormEvent) {
    event.preventDefault();
    if (formBusy) return;
    setFormBusy('window');
    try {
      await createFoodWindowAdmin(windowForm.merchantId, {
        canteenId: windowForm.canteenId,
        name: windowForm.name,
        windowNumber: windowForm.windowNumber || undefined,
        locationDescription: windowForm.locationDescription || undefined,
        floor: Number(windowForm.floor),
      });
      setWindowForm((current) => ({
        ...current,
        name: '',
        windowNumber: '',
        locationDescription: '',
      }));
      setMessage('窗口创建成功');
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '创建窗口失败');
    } finally {
      setFormBusy(null);
    }
  }

  async function action(kind: FoodModerationKind, id: string, value: 'approve' | 'hide') {
    try {
      await applyFoodContentAction(kind, id, value);
      setSelected((current) => ({ ...current, [`${kind}:${id}`]: false }));
      setMessage(value === 'approve' ? '内容已通过' : '内容已隐藏');
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '操作失败');
    }
  }

  function toggleSelection(kind: FoodModerationKind, id: string) {
    const key = `${kind}:${id}`;
    setSelected((current) => ({ ...current, [key]: !current[key] }));
  }

  function selectedIds(kind: FoodModerationKind) {
    return Object.entries(selected)
      .filter(([key, checked]) => checked && key.startsWith(`${kind}:`))
      .map(([key]) => key.slice(kind.length + 1));
  }

  async function bulkAction(kind: FoodModerationKind, value: 'approve' | 'hide') {
    const ids = selectedIds(kind);
    if (ids.length === 0) {
      setMessage('请先选择要处理的内容');
      return;
    }
    const results = await Promise.allSettled(
      ids.map((id) => applyFoodContentAction(kind, id, value)),
    );
    const succeeded = results.filter((result) => result.status === 'fulfilled').length;
    setMessage(`${succeeded}/${ids.length} 条内容已${value === 'approve' ? '通过' : '隐藏'}`);
    await load();
  }

  function submitQueueSearch(event: React.FormEvent) {
    event.preventDefault();
    setQueuePage(1);
    setQueueQuery(queueInput.trim());
  }

  const moderationPages = Math.max(
    queueMeta.posts,
    queueMeta.products,
    queueMeta.reviews,
    queueMeta.replies,
    1,
  );

  async function updateMerchantStatus(merchantId: string, status: AdminFoodMerchant['status']) {
    try {
      await updateFoodMerchantAdmin(merchantId, { status });
      setMessage('商家状态已更新');
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '更新商家状态失败');
    }
  }

  function startMerchantEdit(merchant: AdminFoodMerchant) {
    setEditingMerchantId(merchant.id);
    setMerchantDraft({
      name: merchant.name,
      description: merchant.description ?? '',
      contactDisplay: merchant.contactDisplay ?? '',
    });
  }

  async function saveMerchantEdit(merchantId: string) {
    try {
      await updateFoodMerchantAdmin(merchantId, merchantDraft);
      setEditingMerchantId('');
      setMessage('商家资料已更新');
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '更新商家资料失败');
    }
  }

  async function toggleCanteen(canteen: AdminFoodCanteen) {
    try {
      await updateFoodCanteenAdmin(canteen.id, { isActive: !canteen.isActive });
      setMessage(canteen.isActive ? '食堂已停用' : '食堂已启用');
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '更新食堂状态失败');
    }
  }

  function startCanteenEdit(canteen: AdminFoodCanteen) {
    setEditingCanteenId(canteen.id);
    setCanteenDraft({ name: canteen.name, description: canteen.description ?? '' });
  }

  async function saveCanteenEdit(canteenId: string) {
    try {
      await updateFoodCanteenAdmin(canteenId, canteenDraft);
      setEditingCanteenId('');
      setMessage('食堂资料已更新');
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '更新食堂资料失败');
    }
  }

  async function toggleWindow(window: AdminFoodCanteen['windows'][number]) {
    try {
      await updateFoodWindowAdmin(window.id, { isActive: !window.isActive });
      setMessage(window.isActive ? '窗口已停用' : '窗口已启用');
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '更新窗口状态失败');
    }
  }

  function startWindowEdit(window: AdminFoodCanteen['windows'][number]) {
    setEditingWindowId(window.id);
    setWindowDraft({
      name: window.name,
      windowNumber: window.windowNumber ?? '',
      floor: String(window.floor),
      locationDescription: window.locationDescription ?? '',
    });
  }

  async function saveWindowEdit(windowId: string) {
    try {
      await updateFoodWindowAdmin(windowId, {
        name: windowDraft.name,
        windowNumber: windowDraft.windowNumber,
        floor: Number(windowDraft.floor),
        locationDescription: windowDraft.locationDescription,
      });
      setEditingWindowId('');
      setMessage('窗口资料已更新');
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '更新窗口资料失败');
    }
  }

  async function revokeStaff(id: string) {
    if (!window.confirm('撤销后该员工会立即失去商家后台权限，确定继续吗？')) return;
    try {
      await revokeFoodStaffAdmin(id);
      setMessage('员工权限已撤销');
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '撤销员工失败');
    }
  }

  async function updateStaff(
    id: string,
    data: { role?: AdminFoodStaff['role']; status?: AdminFoodStaff['status'] },
  ) {
    try {
      await updateFoodStaffAdmin(id, data);
      setMessage(data.status === 'active' ? '员工权限已恢复' : '员工角色已更新');
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '更新员工权限失败');
    }
  }

  async function revokeInvitation(id: string) {
    try {
      await revokeFoodInvitationAdmin(id);
      setMessage('邀请已撤销');
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '撤销邀请失败');
    }
  }

  return (
    <div className="space-y-6 pb-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm text-primary">
            <Utensils className="size-4" /> 美食模块
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">商家与美食审核</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            维护食堂、窗口、商家后台账号和美食内容。
          </p>
        </div>
        {loading && <Loader2 className="size-5 animate-spin text-muted-foreground" />}
      </header>
      <div className="flex flex-wrap items-center justify-between gap-3">
        {message && (
          <div className="rounded-xl border bg-muted/40 px-4 py-3 text-sm">{message}</div>
        )}
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={loading ? 'size-4 animate-spin' : 'size-4'} />
          刷新数据
        </Button>
      </div>

      {stats && (
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <MetricCard label="启用商家" value={stats.merchants.active ?? 0} />
          <MetricCard label="待处理内容" value={stats.moderation.total} tone="warning" />
          <MetricCard label="活跃员工" value={stats.activeStaff} />
          <MetricCard label="待接受邀请" value={stats.pendingInvitations} />
          <MetricCard label="启用食堂" value={stats.activeCanteens} />
        </section>
      )}

      <div className="grid gap-4 xl:grid-cols-4">
        <ActionCard title="新增食堂" onSubmit={handleCreateCanteen} busy={formBusy === 'canteen'}>
          <Input
            value={newCanteen.slug}
            onChange={(event) => setNewCanteen({ ...newCanteen, slug: event.target.value })}
            placeholder="英文标识，例如 xingyun"
            required
          />
          <Input
            value={newCanteen.name}
            onChange={(event) => setNewCanteen({ ...newCanteen, name: event.target.value })}
            placeholder="食堂名称"
            required
          />
        </ActionCard>
        <ActionCard title="新增商家" onSubmit={handleCreateMerchant} busy={formBusy === 'merchant'}>
          <Input
            value={newMerchant.slug}
            onChange={(event) => setNewMerchant({ ...newMerchant, slug: event.target.value })}
            placeholder="商家英文标识"
            required
          />
          <Input
            value={newMerchant.name}
            onChange={(event) => setNewMerchant({ ...newMerchant, name: event.target.value })}
            placeholder="商家名称"
            required
          />
        </ActionCard>
        <ActionCard title="新增窗口" onSubmit={handleCreateWindow} busy={formBusy === 'window'}>
          <select
            required
            value={windowForm.merchantId}
            onChange={(event) => setWindowForm({ ...windowForm, merchantId: event.target.value })}
            className="h-10 rounded-md border bg-background px-3 text-sm"
          >
            <option value="">选择商家</option>
            {merchants.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          <select
            required
            value={windowForm.canteenId}
            onChange={(event) => setWindowForm({ ...windowForm, canteenId: event.target.value })}
            className="h-10 rounded-md border bg-background px-3 text-sm"
          >
            <option value="">选择食堂</option>
            {canteens.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          <Input
            value={windowForm.name}
            onChange={(event) => setWindowForm({ ...windowForm, name: event.target.value })}
            placeholder="窗口名称"
            required
          />
          <div className="grid grid-cols-2 gap-2">
            <Input
              value={windowForm.floor}
              onChange={(event) => setWindowForm({ ...windowForm, floor: event.target.value })}
              type="number"
              min="1"
              max="20"
              placeholder="楼层"
              required
            />
            <Input
              value={windowForm.windowNumber}
              onChange={(event) =>
                setWindowForm({ ...windowForm, windowNumber: event.target.value })
              }
              placeholder="窗口编号"
            />
          </div>
          <Input
            value={windowForm.locationDescription}
            onChange={(event) =>
              setWindowForm({ ...windowForm, locationDescription: event.target.value })
            }
            placeholder="位置说明（可选）"
          />
        </ActionCard>
        <ActionCard
          title="邀请商家后台员工"
          onSubmit={handleInvite}
          busy={formBusy === 'invite'}
          submitLabel="生成邀请"
        >
          <select
            required
            value={invite.merchantId}
            onChange={(event) => setInvite({ ...invite, merchantId: event.target.value })}
            className="h-10 rounded-md border bg-background px-3 text-sm"
          >
            <option value="">选择商家</option>
            {merchants.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          <Input
            type="email"
            value={invite.email}
            onChange={(event) => setInvite({ ...invite, email: event.target.value })}
            placeholder="员工邮箱"
            required
          />
          <select
            value={invite.role}
            onChange={(event) =>
              setInvite({
                ...invite,
                role: event.target.value as 'owner' | 'editor' | 'viewer',
              })
            }
            className="h-10 rounded-md border bg-background px-3 text-sm"
          >
            <option value="owner">店主：可维护店铺资料</option>
            <option value="editor">编辑：可管理产品和内容</option>
            <option value="viewer">只读：只能查看本店数据</option>
          </select>
          {inviteUrl && (
            <button
              type="button"
              onClick={() => {
                void (async () => {
                  try {
                    if (!navigator.clipboard) throw new Error('浏览器不支持剪贴板');
                    await navigator.clipboard.writeText(inviteUrl);
                    toast.success('邀请链接已复制');
                  } catch {
                    toast.error('复制失败，请手动复制邀请链接');
                  }
                })();
              }}
              className="flex items-center gap-1 text-left text-xs text-primary hover:underline"
            >
              <Copy className="size-3" />
              复制邀请链接
            </button>
          )}
        </ActionCard>
      </div>

      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Store className="size-5 text-primary" />
          商家列表
        </h2>
        {merchants.map((merchant) => (
          <Card key={merchant.id}>
            <CardContent className="space-y-3 p-4">
              {editingMerchantId === merchant.id ? (
                <div className="grid gap-2 md:grid-cols-3">
                  <Input
                    value={merchantDraft.name}
                    onChange={(event) =>
                      setMerchantDraft({ ...merchantDraft, name: event.target.value })
                    }
                    placeholder="商家名称"
                    required
                  />
                  <Input
                    value={merchantDraft.contactDisplay}
                    onChange={(event) =>
                      setMerchantDraft({ ...merchantDraft, contactDisplay: event.target.value })
                    }
                    placeholder="对外联系方式"
                  />
                  <Input
                    value={merchantDraft.description}
                    onChange={(event) =>
                      setMerchantDraft({ ...merchantDraft, description: event.target.value })
                    }
                    placeholder="商家简介"
                    className="md:col-span-3"
                  />
                  <div className="flex gap-2 md:col-span-3">
                    <Button
                      size="sm"
                      disabled={!merchantDraft.name.trim()}
                      onClick={() => void saveMerchantEdit(merchant.id)}
                    >
                      保存资料
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setEditingMerchantId('')}>
                      取消
                    </Button>
                  </div>
                </div>
              ) : null}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 font-medium">
                    {merchant.name}{' '}
                    <Badge variant={merchant.status === 'active' ? 'default' : 'secondary'}>
                      {merchant.status}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {merchant.windows.length} 个窗口 · {merchant.staffCount} 名员工 ·{' '}
                    {merchant.postCount} 条动态
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" onClick={() => startMerchantEdit(merchant)}>
                    编辑资料
                  </Button>
                  <select
                    value={merchant.status}
                    onChange={(event) =>
                      void updateMerchantStatus(
                        merchant.id,
                        event.target.value as AdminFoodMerchant['status'],
                      )
                    }
                    className="h-9 rounded-md border bg-background px-2 text-sm"
                  >
                    <option value="pending">待启用</option>
                    <option value="active">已启用</option>
                    <option value="suspended">已暂停</option>
                    <option value="closed">已关闭</option>
                  </select>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Utensils className="size-5 text-primary" />
          食堂与窗口
        </h2>
        {canteens.length === 0 ? (
          <Empty text="还没有食堂，请先创建食堂" />
        ) : (
          canteens.map((canteen) => (
            <Card key={canteen.id}>
              <CardContent className="space-y-3 p-4">
                {editingCanteenId === canteen.id && (
                  <div className="grid gap-2 md:grid-cols-3">
                    <Input
                      value={canteenDraft.name}
                      onChange={(event) =>
                        setCanteenDraft({ ...canteenDraft, name: event.target.value })
                      }
                      placeholder="食堂名称"
                    />
                    <Input
                      value={canteenDraft.description}
                      onChange={(event) =>
                        setCanteenDraft({ ...canteenDraft, description: event.target.value })
                      }
                      placeholder="食堂说明"
                      className="md:col-span-2"
                    />
                    <div className="flex gap-2 md:col-span-3">
                      <Button
                        size="sm"
                        disabled={!canteenDraft.name.trim()}
                        onClick={() => void saveCanteenEdit(canteen.id)}
                      >
                        保存资料
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setEditingCanteenId('')}>
                        取消
                      </Button>
                    </div>
                  </div>
                )}
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 font-medium">
                      {canteen.name}
                      <Badge variant={canteen.isActive ? 'default' : 'secondary'}>
                        {canteen.isActive ? '启用' : '停用'}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {canteen.slug} · {canteen.windows.length} 个窗口
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" onClick={() => startCanteenEdit(canteen)}>
                      编辑资料
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => void toggleCanteen(canteen)}>
                      {canteen.isActive ? '停用食堂' : '启用食堂'}
                    </Button>
                  </div>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {canteen.windows.map((window) => (
                    <div key={window.id} className="rounded-lg border p-3">
                      {editingWindowId === window.id ? (
                        <div className="space-y-2">
                          <div className="grid gap-2 sm:grid-cols-3">
                            <Input
                              value={windowDraft.name}
                              onChange={(event) =>
                                setWindowDraft({ ...windowDraft, name: event.target.value })
                              }
                              placeholder="窗口名称"
                            />
                            <Input
                              value={windowDraft.floor}
                              onChange={(event) =>
                                setWindowDraft({ ...windowDraft, floor: event.target.value })
                              }
                              type="number"
                              min="1"
                              max="20"
                              placeholder="楼层"
                            />
                            <Input
                              value={windowDraft.windowNumber}
                              onChange={(event) =>
                                setWindowDraft({ ...windowDraft, windowNumber: event.target.value })
                              }
                              placeholder="窗口编号"
                            />
                          </div>
                          <Input
                            value={windowDraft.locationDescription}
                            onChange={(event) =>
                              setWindowDraft({
                                ...windowDraft,
                                locationDescription: event.target.value,
                              })
                            }
                            placeholder="位置说明"
                          />
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              disabled={!windowDraft.name.trim()}
                              onClick={() => void saveWindowEdit(window.id)}
                            >
                              保存资料
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setEditingWindowId('')}
                            >
                              取消
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-medium">{window.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {window.floor} 楼
                              {window.windowNumber ? ` · ${window.windowNumber}` : ''}
                              {window.locationDescription ? ` · ${window.locationDescription}` : ''}
                            </p>
                          </div>
                          <div className="flex items-center gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => startWindowEdit(window)}
                            >
                              编辑
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => void toggleWindow(window)}
                            >
                              {window.isActive === false ? '启用' : '停用'}
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <UserRound className="size-5 text-primary" /> 商家员工权限
            </h2>
          </CardHeader>
          <CardContent className="space-y-2">
            {staff.length === 0 ? (
              <Empty text="暂无员工账号" />
            ) : (
              staff.map((item) => (
                <div
                  key={item.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
                >
                  <div>
                    <p className="text-sm font-medium">{item.account.displayName}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.account.email} · {item.merchant.name} · {roleLabel(item.role)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      value={item.role}
                      disabled={item.status !== 'active'}
                      onChange={(event) =>
                        void updateStaff(item.id, {
                          role: event.target.value as AdminFoodStaff['role'],
                        })
                      }
                      className="h-9 rounded-md border bg-background px-2 text-sm"
                    >
                      <option value="owner">店主</option>
                      <option value="editor">编辑</option>
                      <option value="viewer">只读</option>
                    </select>
                    {item.status === 'active' ? (
                      <Button size="sm" variant="outline" onClick={() => void revokeStaff(item.id)}>
                        <ShieldOff className="size-4" /> 撤销
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void updateStaff(item.id, { status: 'active' })}
                      >
                        恢复
                      </Button>
                    )}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <Mail className="size-5 text-primary" /> 待处理邀请
            </h2>
          </CardHeader>
          <CardContent className="space-y-2">
            {invitations.length === 0 ? (
              <Empty text="暂无待接受邀请" />
            ) : (
              invitations.map((item) => (
                <div
                  key={item.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
                >
                  <div>
                    <p className="text-sm font-medium">{item.email}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.merchant.name} · {roleLabel(item.role)} · 到期{' '}
                      {formatDate(item.expiresAt)}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void revokeInvitation(item.id)}
                  >
                    撤销邀请
                  </Button>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </section>

      <section className="rounded-2xl border bg-card p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">内容审核队列</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              支持按状态、标题或正文筛选；批量操作中的每一条内容都会单独写入审计日志。
            </p>
          </div>
          <form onSubmit={submitQueueSearch} className="flex flex-wrap gap-2">
            <select
              value={queueStatus}
              onChange={(event) => {
                setQueuePage(1);
                setQueueStatus(event.target.value as ContentStatus);
              }}
              className="h-9 rounded-md border bg-background px-2 text-sm"
            >
              <option value="pending_review">待审核</option>
              <option value="published">已通过</option>
              <option value="hidden">已隐藏</option>
              <option value="deleted">已删除</option>
            </select>
            <Input
              value={queueInput}
              onChange={(event) => setQueueInput(event.target.value)}
              className="h-9 w-48"
              placeholder="搜索标题、产品或评价"
            />
            <Button type="submit" size="sm" variant="outline">
              搜索
            </Button>
          </form>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t pt-3">
          <span className="text-xs text-muted-foreground">
            当前第 {queuePage} / {moderationPages} 页
          </span>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={loading || queuePage <= 1}
              onClick={() => setQueuePage((page) => Math.max(1, page - 1))}
            >
              上一页
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={loading || queuePage >= moderationPages}
              onClick={() => setQueuePage((page) => Math.min(moderationPages, page + 1))}
            >
              下一页
            </Button>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <ModerationSectionHeader
          title="产品审核"
          selectedCount={selectedIds('products').length}
          onApprove={() => void bulkAction('products', 'approve')}
          onHide={() => void bulkAction('products', 'hide')}
        />
        {products.length === 0 ? (
          <Empty text={`暂无${statusLabel(queueStatus)}产品`} />
        ) : (
          products.map((product) => (
            <ModerationCard
              key={product.id}
              title={`${product.name}${product.priceCents !== null ? ` · ¥${(product.priceCents / 100).toFixed(2)}` : ''}`}
              meta={`${product.merchant.name} · ${product.window?.canteen.name ?? ''}${product.window ? ` · ${product.window.name}` : ''}`}
              content={product.description || '商家未填写产品介绍'}
              category={product.category}
              imageUrl={product.imageUrl}
              selected={Boolean(selected[`products:${product.id}`])}
              onToggle={() => toggleSelection('products', product.id)}
              onApprove={() => void action('products', product.id, 'approve')}
              onHide={() => void action('products', product.id, 'hide')}
            />
          ))
        )}
      </section>

      <section className="space-y-3">
        <ModerationSectionHeader
          title="商家动态审核"
          selectedCount={selectedIds('posts').length}
          onApprove={() => void bulkAction('posts', 'approve')}
          onHide={() => void bulkAction('posts', 'hide')}
        />
        {posts.length === 0 ? (
          <Empty text={`暂无${statusLabel(queueStatus)}动态`} />
        ) : (
          posts.map((post) => (
            <ModerationCard
              key={post.id}
              title={post.title}
              meta={`${post.merchant.name} · ${post.authorUsername}`}
              content={post.contentMd}
              selected={Boolean(selected[`posts:${post.id}`])}
              onToggle={() => toggleSelection('posts', post.id)}
              onApprove={() => void action('posts', post.id, 'approve')}
              onHide={() => void action('posts', post.id, 'hide')}
            />
          ))
        )}
      </section>

      <section className="space-y-3">
        <ModerationSectionHeader
          title="用户评价审核"
          selectedCount={selectedIds('reviews').length}
          onApprove={() => void bulkAction('reviews', 'approve')}
          onHide={() => void bulkAction('reviews', 'hide')}
        />
        {reviews.length === 0 ? (
          <Empty text={`暂无${statusLabel(queueStatus)}评价`} />
        ) : (
          reviews.map((review) => (
            <ModerationCard
              key={review.id}
              title={`${review.window.name} · ${review.type === 'taste_review' ? `${review.tasteScore ?? '-'} 星评价` : '意见反馈'}`}
              meta={review.isAnonymous ? '匿名用户' : review.authorUsername}
              content={review.contentMd}
              selected={Boolean(selected[`reviews:${review.id}`])}
              onToggle={() => toggleSelection('reviews', review.id)}
              onApprove={() => void action('reviews', review.id, 'approve')}
              onHide={() => void action('reviews', review.id, 'hide')}
            />
          ))
        )}
      </section>

      <section className="space-y-3">
        <ModerationSectionHeader
          title="商家回复审核"
          selectedCount={selectedIds('replies').length}
          onApprove={() => void bulkAction('replies', 'approve')}
          onHide={() => void bulkAction('replies', 'hide')}
        />
        {replies.length === 0 ? (
          <Empty text={`暂无${statusLabel(queueStatus)}回复`} />
        ) : (
          replies.map((reply) => (
            <ModerationCard
              key={reply.id}
              title={`${reply.window.name} · ${reply.merchant.name}`}
              meta={`${reply.authorUsername} · ${reply.window.canteen.name}`}
              content={reply.contentMd}
              selected={Boolean(selected[`replies:${reply.id}`])}
              onToggle={() => toggleSelection('replies', reply.id)}
              onApprove={() => void action('replies', reply.id, 'approve')}
              onHide={() => void action('replies', reply.id, 'hide')}
            />
          ))
        )}
      </section>
    </div>
  );
}

function ActionCard({
  title,
  children,
  onSubmit,
  busy = false,
  submitLabel = '保存',
}: {
  title: string;
  children: React.ReactNode;
  onSubmit: (event: React.FormEvent) => void;
  busy?: boolean;
  submitLabel?: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Plus className="size-4 text-primary" />
          {title}
        </h2>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-2">
          {children}
          <Button type="submit" size="sm" className="w-full" disabled={busy}>
            {busy ? `${submitLabel}中…` : submitLabel}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function ModerationSectionHeader({
  title,
  selectedCount,
  onApprove,
  onHide,
}: {
  title: string;
  selectedCount: number;
  onApprove: () => void;
  onHide: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="flex items-center gap-2">
        {selectedCount > 0 && (
          <span className="text-xs text-muted-foreground">已选 {selectedCount} 条</span>
        )}
        <Button size="sm" variant="outline" disabled={selectedCount === 0} onClick={onHide}>
          批量隐藏
        </Button>
        <Button size="sm" disabled={selectedCount === 0} onClick={onApprove}>
          批量通过
        </Button>
      </div>
    </div>
  );
}

function ModerationCard({
  title,
  meta,
  content,
  category,
  imageUrl,
  selected,
  onToggle,
  onApprove,
  onHide,
}: {
  title: string;
  meta: string;
  content: string;
  category?: string | null;
  imageUrl?: string | null;
  selected: boolean;
  onToggle: () => void;
  onApprove: () => void;
  onHide: () => void;
}) {
  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start gap-3">
          {imageUrl && (
            <div className="relative size-16 shrink-0 overflow-hidden rounded-xl bg-orange-50">
              <Image src={imageUrl} alt="" fill unoptimized sizes="64px" className="object-cover" />
            </div>
          )}
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggle}
            aria-label={`选择${title}`}
            className="mt-1 size-4 rounded border"
          />
          <div>
            <h3 className="font-medium">{title}</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {category ? `${category} · ` : ''}
              {meta}
            </p>
          </div>
        </div>
        <p className="whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{content}</p>
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="outline" onClick={onHide}>
            <X className="size-4" />
            隐藏
          </Button>
          <Button size="sm" onClick={onApprove}>
            <Check className="size-4" />
            通过
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
      {text}
    </div>
  );
}

function MetricCard({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: number;
  tone?: 'default' | 'warning';
}) {
  return (
    <div
      className={`rounded-2xl border p-4 ${tone === 'warning' ? 'border-amber-200 bg-amber-50' : 'bg-card'}`}
    >
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
    </div>
  );
}

function roleLabel(role: 'owner' | 'editor' | 'viewer') {
  return { owner: '店主', editor: '编辑', viewer: '只读' }[role];
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('zh-CN');
}

function statusLabel(status: ContentStatus) {
  return {
    pending_review: '待审核',
    published: '已通过',
    hidden: '已隐藏',
    deleted: '已删除',
  }[status];
}
