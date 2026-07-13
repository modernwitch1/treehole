'use client';

import * as React from 'react';
import Image from 'next/image';
import { CheckCircle2, Clock3, ImagePlus, PackageCheck } from 'lucide-react';
import {
  createMerchantPost,
  createMerchantProduct,
  getMerchantContext,
  listMerchantPosts,
  listMerchantProducts,
  listMerchantReviews,
  merchantLogout,
  replyMerchantReview,
  submitMerchantProduct,
  uploadMerchantFoodImage,
  updateMerchantProduct,
  updateMerchantProfile,
  updateMerchantPost,
  updateMerchantWindow,
  type MerchantContext,
  type MerchantPost,
  type MerchantProduct,
  type MerchantReview,
} from '@/lib/api';

const statusLabels: Record<string, string> = {
  draft: '草稿',
  pending_review: '审核中',
  published: '已上线',
  hidden: '已下架',
  deleted: '已删除',
};

export default function MerchantDashboard() {
  const [context, setContext] = React.useState<MerchantContext | null>(null);
  const [selectedId, setSelectedId] = React.useState('');
  const [products, setProducts] = React.useState<MerchantProduct[]>([]);
  const [posts, setPosts] = React.useState<MerchantPost[]>([]);
  const [reviews, setReviews] = React.useState<MerchantReview[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [message, setMessage] = React.useState('');
  const [error, setError] = React.useState('');

  const merchant = context?.merchants.find((item) => item.id === selectedId) ?? null;
  const canWrite = merchant?.role === 'owner' || merchant?.role === 'editor';
  const reportError = React.useCallback((error: unknown) => {
    setError(error instanceof Error ? error.message : '操作失败，请稍后重试');
  }, []);

  const loadContext = React.useCallback(async () => {
    try {
      const next = await getMerchantContext();
      setContext(next);
      setSelectedId((current) => current || next.merchants[0]?.id || '');
    } catch (err) {
      setError(err instanceof Error ? err.message : '无法加载商家信息，请重新登录');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadData = React.useCallback(async () => {
    if (!selectedId) return;
    try {
      const [nextProducts, nextPosts, nextReviews] = await Promise.all([
        listMerchantProducts(selectedId),
        listMerchantPosts(selectedId),
        listMerchantReviews(selectedId),
      ]);
      setProducts(nextProducts);
      setPosts(nextPosts);
      setReviews(nextReviews);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载店铺数据失败');
    }
  }, [selectedId]);

  React.useEffect(() => void loadContext(), [loadContext]);
  React.useEffect(() => void loadData(), [loadData]);

  async function logout() {
    await merchantLogout().catch(() => {});
    window.location.href = '/login';
  }

  if (loading)
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        加载商家后台…
      </div>
    );
  if (error && !context) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
        <p className="text-sm text-danger">{error}</p>
        <a
          href="/login"
          className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
        >
          返回登录
        </a>
      </div>
    );
  }
  if (!merchant && context?.account.isPlatformAdmin)
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-4 text-center">
        <p className="text-lg font-semibold">平台商家后台已登录</p>
        <p className="max-w-md text-sm leading-6 text-muted-foreground">
          当前还没有已启用的商家。请先在论坛管理员后台创建并启用店铺，之后这里会显示全部商家。
        </p>
        <button
          type="button"
          onClick={logout}
          className="rounded-lg border px-3 py-2 text-sm hover:bg-muted"
        >
          退出
        </button>
      </div>
    );
  if (!merchant)
    return (
      <div className="flex min-h-screen items-center justify-center px-4 text-sm text-muted-foreground">
        当前账号没有有效店铺权限。
      </div>
    );

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b bg-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              Merchant Console
            </p>
            <h1 className="mt-1 text-xl font-bold">{merchant.name}</h1>
          </div>
          <div className="flex items-center gap-3 text-sm">
            {context && context.merchants.length > 1 && (
              <select
                value={selectedId}
                onChange={(event) => setSelectedId(event.target.value)}
                className="h-9 rounded-lg border bg-background px-2"
              >
                {context.merchants.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            )}
            <span className="hidden text-muted-foreground sm:inline">
              {context?.account.displayName}
            </span>
            <button
              type="button"
              onClick={logout}
              className="rounded-lg border px-3 py-2 hover:bg-muted"
            >
              退出
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6">
        {message && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            {message}
          </div>
        )}
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}
        <section className="grid gap-4 md:grid-cols-3">
          <StatCard label="产品" value={products.length} detail="管理菜单和在售状态" />
          <StatCard label="宣传内容" value={posts.length} detail="新品、促销和公告" />
          <StatCard label="用户评价" value={reviews.length} detail="只显示本店窗口评价" />
        </section>
        {context?.account.isPlatformAdmin && (
          <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
            当前以平台超级管理员身份登录，可管理所有已启用商家；论坛帖子、私信和聊天仍不在此后台展示。
          </div>
        )}
        <ProfileCard
          merchant={merchant}
          canWrite={merchant.role === 'owner'}
          onError={reportError}
          onSaved={async () => {
            await loadContext();
            setMessage('店铺资料已保存');
          }}
        />
        {canWrite && (
          <ProductForm
            merchant={merchant}
            onError={reportError}
            onCreated={async () => {
              await loadData();
              setMessage('产品已提交审核');
            }}
          />
        )}
        {canWrite && (
          <PostForm
            merchant={merchant}
            onError={reportError}
            onCreated={async () => {
              await loadData();
              setMessage('宣传内容已提交审核');
            }}
          />
        )}
        <WindowList
          merchant={merchant}
          canWrite={canWrite}
          onError={reportError}
          onUpdated={async () => {
            await loadContext();
            setMessage('窗口信息已更新');
          }}
        />
        <ProductList
          products={products}
          merchant={merchant}
          canWrite={canWrite}
          onError={reportError}
          onUpdated={async () => {
            await loadData();
            setMessage('产品信息已更新');
          }}
        />
        <PostList
          posts={posts}
          merchant={merchant}
          canWrite={canWrite}
          onError={reportError}
          onUpdated={async () => {
            await loadData();
            setMessage('宣传内容已更新');
          }}
        />
        <ReviewList
          reviews={reviews}
          canWrite={canWrite}
          onError={reportError}
          onReplied={async () => {
            await loadData();
            setMessage('回复已提交审核');
          }}
        />
      </main>
    </div>
  );
}

function StatCard({ label, value, detail }: { label: string; value: number; detail: string }) {
  return (
    <div className="rounded-2xl border bg-card p-5">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-2 text-3xl font-bold">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

function ProfileCard({
  merchant,
  canWrite,
  onError,
  onSaved,
}: {
  merchant: NonNullable<MerchantContext['merchants']>[number];
  canWrite: boolean;
  onError: (error: unknown) => void;
  onSaved: () => Promise<void>;
}) {
  const [name, setName] = React.useState(merchant.name);
  const [description, setDescription] = React.useState(merchant.description ?? '');
  const [contactDisplay, setContactDisplay] = React.useState(merchant.contactDisplay ?? '');
  const [saving, setSaving] = React.useState(false);
  React.useEffect(() => {
    setName(merchant.name);
    setDescription(merchant.description ?? '');
    setContactDisplay(merchant.contactDisplay ?? '');
  }, [merchant]);
  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await updateMerchantProfile(merchant.id, { name, description, contactDisplay });
      await onSaved();
    } catch (error) {
      onError(error);
    } finally {
      setSaving(false);
    }
  }
  return (
    <section className="rounded-2xl border bg-card p-5">
      <div className="mb-4">
        <h2 className="text-lg font-bold">店铺资料</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          店铺资料由店主维护，发布后会展示在美食模块。
        </p>
      </div>
      <form onSubmit={save} className="grid gap-3 md:grid-cols-3">
        <input
          disabled={!canWrite}
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="h-10 rounded-lg border bg-background px-3 text-sm"
          placeholder="店铺名称"
        />
        <input
          disabled={!canWrite}
          value={contactDisplay}
          onChange={(event) => setContactDisplay(event.target.value)}
          className="h-10 rounded-lg border bg-background px-3 text-sm"
          placeholder="联系方式（可选）"
        />
        <input
          disabled={!canWrite}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          className="h-10 rounded-lg border bg-background px-3 text-sm md:col-span-3"
          placeholder="店铺简介"
        />
        {canWrite && (
          <button
            type="submit"
            disabled={saving}
            className="h-10 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground md:w-fit"
          >
            {saving ? '保存中…' : '保存资料'}
          </button>
        )}
      </form>
    </section>
  );
}

function ProductForm({
  merchant,
  onError,
  onCreated,
}: {
  merchant: MerchantContext['merchants'][number];
  onError: (error: unknown) => void;
  onCreated: () => Promise<void>;
}) {
  const [name, setName] = React.useState('');
  const [category, setCategory] = React.useState('主食');
  const [description, setDescription] = React.useState('');
  const [price, setPrice] = React.useState('');
  const [imageFile, setImageFile] = React.useState<File | null>(null);
  const [windowId, setWindowId] = React.useState(
    merchant.windows.find((item) => item.isActive !== false)?.id ?? '',
  );
  const [saving, setSaving] = React.useState(false);
  React.useEffect(() => {
    setWindowId(merchant.windows.find((item) => item.isActive !== false)?.id ?? '');
    setName('');
    setCategory('主食');
    setDescription('');
    setPrice('');
    setImageFile(null);
  }, [merchant.id, merchant.windows]);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const parsedPrice = price.trim() ? Number(price) : undefined;
    if (parsedPrice !== undefined && (!Number.isFinite(parsedPrice) || parsedPrice < 0)) {
      onError(new Error('请输入有效的商品价格'));
      return;
    }
    setSaving(true);
    try {
      const uploaded = imageFile ? await uploadMerchantFoodImage(imageFile) : null;
      await createMerchantProduct({
        name: name.trim(),
        category: category.trim() || '其他',
        description: description.trim(),
        windowId,
        priceCents: parsedPrice === undefined ? undefined : Math.round(parsedPrice * 100),
        imageUrl: uploaded?.url,
      });
      setName('');
      setCategory('主食');
      setDescription('');
      setPrice('');
      setImageFile(null);
      await onCreated();
    } catch (error) {
      onError(error);
    } finally {
      setSaving(false);
    }
  }
  return (
    <section className="overflow-hidden rounded-2xl border bg-card">
      <div className="border-b bg-gradient-to-r from-orange-50 to-amber-50 px-5 py-4">
        <div className="flex items-center gap-2">
          <PackageCheck className="size-5 text-primary" />
          <h2 className="text-lg font-bold">上线商品</h2>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          填写菜单信息并提交审核；平台管理员通过后，商品会出现在学生端菜单。
        </p>
      </div>
      <form onSubmit={submit} className="grid gap-5 p-5 md:grid-cols-[150px_minmax(0,1fr)]">
        <label className="flex aspect-square cursor-pointer flex-col items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-orange-200 bg-orange-50/60 text-center hover:border-primary">
          {imageFile ? (
            <span className="flex flex-col items-center gap-2 p-3 text-xs text-primary">
              <ImagePlus className="size-7" />
              <span className="line-clamp-2 break-all">{imageFile.name}</span>
            </span>
          ) : (
            <span className="flex flex-col items-center gap-2 p-3 text-xs text-muted-foreground">
              <ImagePlus className="size-8 text-primary/70" />
              上传商品图片
              <span>建议 1:1，最大 8MB</span>
            </span>
          )}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="sr-only"
            onChange={(event) => setImageFile(event.target.files?.[0] ?? null)}
          />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <input
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="h-11 rounded-xl border bg-background px-3 text-sm sm:col-span-2"
            placeholder="商品名称，例如：鸡腿饭"
            maxLength={120}
          />
          <input
            value={price}
            onChange={(event) => setPrice(event.target.value)}
            type="number"
            min="0"
            step="0.01"
            className="h-11 rounded-xl border bg-background px-3 text-sm"
            placeholder="售价（元）"
          />
          <input
            list="merchant-food-categories"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            className="h-11 rounded-xl border bg-background px-3 text-sm"
            placeholder="商品分类"
          />
          <datalist id="merchant-food-categories">
            <option value="主食" />
            <option value="小吃" />
            <option value="饮品" />
            <option value="套餐" />
            <option value="其他" />
          </datalist>
          <select
            required
            value={windowId}
            onChange={(event) => setWindowId(event.target.value)}
            className="h-11 rounded-xl border bg-background px-3 text-sm"
          >
            {merchant.windows
              .filter((item) => item.isActive !== false)
              .map((item) => (
                <option key={item.id} value={item.id}>
                  {item.canteen.name} · {item.name}
                </option>
              ))}
          </select>
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            className="min-h-24 rounded-xl border bg-background px-3 py-2 text-sm sm:col-span-2"
            placeholder="商品介绍、规格、口味说明（可选）"
            maxLength={2000}
          />
          <div className="flex flex-wrap items-center justify-between gap-3 sm:col-span-2">
            <span className="text-xs text-muted-foreground">商品审核通过后才会对学生端可见。</span>
            <button
              type="submit"
              disabled={saving || !windowId || !name.trim()}
              className="inline-flex h-11 items-center justify-center rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? '提交中…' : '提交审核并上架'}
            </button>
          </div>
        </div>
      </form>
    </section>
  );
}

function PostForm({
  merchant,
  onError,
  onCreated,
}: {
  merchant: MerchantContext['merchants'][number];
  onError: (error: unknown) => void;
  onCreated: () => Promise<void>;
}) {
  const [type, setType] = React.useState<MerchantPost['type']>('new_product');
  const [title, setTitle] = React.useState('');
  const [contentMd, setContentMd] = React.useState('');
  const [windowId, setWindowId] = React.useState(
    merchant.windows.find((item) => item.isActive !== false)?.id ?? '',
  );
  const [saving, setSaving] = React.useState(false);
  React.useEffect(() => {
    setWindowId(merchant.windows.find((item) => item.isActive !== false)?.id ?? '');
    setTitle('');
    setContentMd('');
  }, [merchant.id, merchant.windows]);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await createMerchantPost({ type, title, contentMd, windowId });
      setTitle('');
      setContentMd('');
      await onCreated();
    } catch (error) {
      onError(error);
    } finally {
      setSaving(false);
    }
  }
  return (
    <section className="rounded-2xl border bg-card p-5">
      <h2 className="text-lg font-bold">发布新品 / 广告</h2>
      <p className="mt-1 text-sm text-muted-foreground">所有宣传内容发布前由平台管理员审核。</p>
      <form onSubmit={submit} className="mt-4 space-y-3">
        <div className="grid gap-3 md:grid-cols-3">
          <select
            value={type}
            onChange={(event) => setType(event.target.value as MerchantPost['type'])}
            className="h-10 rounded-lg border bg-background px-3 text-sm"
          >
            <option value="new_product">新品</option>
            <option value="promotion">促销</option>
            <option value="advertisement">广告</option>
            <option value="notice">公告</option>
          </select>
          <input
            required
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className="h-10 rounded-lg border bg-background px-3 text-sm md:col-span-2"
            placeholder="标题"
          />
        </div>
        <select
          required
          value={windowId}
          onChange={(event) => setWindowId(event.target.value)}
          className="h-10 w-full rounded-lg border bg-background px-3 text-sm"
        >
          {merchant.windows
            .filter((item) => item.isActive !== false)
            .map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
        </select>
        <textarea
          required
          value={contentMd}
          onChange={(event) => setContentMd(event.target.value)}
          className="min-h-28 w-full rounded-lg border bg-background px-3 py-2 text-sm"
          placeholder="宣传内容"
        />
        <button
          type="submit"
          disabled={saving || !windowId}
          className="h-10 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground"
        >
          {saving ? '提交中…' : '提交审核'}
        </button>
      </form>
    </section>
  );
}

function WindowList({
  merchant,
  canWrite,
  onError,
  onUpdated,
}: {
  merchant: MerchantContext['merchants'][number];
  canWrite: boolean;
  onError: (error: unknown) => void;
  onUpdated: () => Promise<void>;
}) {
  const [editingId, setEditingId] = React.useState('');
  const [drafts, setDrafts] = React.useState<
    Record<string, { name: string; windowNumber: string; locationDescription: string }>
  >({});
  const [savingId, setSavingId] = React.useState('');

  function startEditing(window: MerchantContext['merchants'][number]['windows'][number]) {
    setEditingId(window.id);
    setDrafts((current) => ({
      ...current,
      [window.id]: {
        name: window.name,
        windowNumber: window.windowNumber ?? '',
        locationDescription: window.locationDescription ?? '',
      },
    }));
  }

  async function save(windowId: string) {
    const draft = drafts[windowId];
    if (!draft) return;
    setSavingId(windowId);
    try {
      await updateMerchantWindow(windowId, draft);
      setEditingId('');
      await onUpdated();
    } catch (error) {
      onError(error);
    } finally {
      setSavingId('');
    }
  }

  async function toggle(window: MerchantContext['merchants'][number]['windows'][number]) {
    setSavingId(window.id);
    try {
      await updateMerchantWindow(window.id, { isActive: window.isActive === false });
      await onUpdated();
    } catch (error) {
      onError(error);
    } finally {
      setSavingId('');
    }
  }

  return (
    <section className="rounded-2xl border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">经营窗口</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            窗口停用后，学生端不会展示新产品和新宣传内容；历史评价仍保留。
          </p>
        </div>
        <span className="rounded-full bg-muted px-2.5 py-1 text-xs">
          共 {merchant.windows.length} 个窗口
        </span>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {merchant.windows.length === 0 ? (
          <p className="text-sm text-muted-foreground">管理员还没有为此商家配置窗口。</p>
        ) : (
          merchant.windows.map((window) => {
            const draft = drafts[window.id];
            const editing = editingId === window.id;
            const saving = savingId === window.id;
            return (
              <article key={window.id} className="rounded-xl border p-4">
                {editing && draft ? (
                  <div className="space-y-3">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <input
                        value={draft.name}
                        onChange={(event) =>
                          setDrafts((current) => ({
                            ...current,
                            [window.id]: { ...draft, name: event.target.value },
                          }))
                        }
                        className="h-10 rounded-lg border bg-background px-3 text-sm"
                        placeholder="窗口名称"
                      />
                      <input
                        value={draft.windowNumber}
                        onChange={(event) =>
                          setDrafts((current) => ({
                            ...current,
                            [window.id]: { ...draft, windowNumber: event.target.value },
                          }))
                        }
                        className="h-10 rounded-lg border bg-background px-3 text-sm"
                        placeholder="窗口编号"
                      />
                    </div>
                    <input
                      value={draft.locationDescription}
                      onChange={(event) =>
                        setDrafts((current) => ({
                          ...current,
                          [window.id]: { ...draft, locationDescription: event.target.value },
                        }))
                      }
                      className="h-10 w-full rounded-lg border bg-background px-3 text-sm"
                      placeholder="位置说明（可选）"
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={saving || !draft.name.trim()}
                        onClick={() => void save(window.id)}
                        className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground"
                      >
                        {saving ? '保存中…' : '保存'}
                      </button>
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => setEditingId('')}
                        className="rounded-lg border px-3 py-2 text-sm hover:bg-muted"
                      >
                        取消
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="font-semibold">{window.name}</h3>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {window.canteen.name} · {window.floor} 楼
                          {window.windowNumber ? ` · ${window.windowNumber}` : ''}
                        </p>
                        {window.locationDescription && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            {window.locationDescription}
                          </p>
                        )}
                      </div>
                      <span
                        className={`rounded-full px-2 py-1 text-xs ${
                          window.isActive === false
                            ? 'bg-muted text-muted-foreground'
                            : 'bg-emerald-100 text-emerald-700'
                        }`}
                      >
                        {window.isActive === false ? '已停用' : '运营中'}
                      </span>
                    </div>
                    {canWrite && (
                      <div className="mt-3 flex gap-2">
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => startEditing(window)}
                          className="rounded-lg border px-3 py-2 text-xs font-medium hover:bg-muted"
                        >
                          编辑
                        </button>
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => void toggle(window)}
                          className="rounded-lg border px-3 py-2 text-xs font-medium hover:bg-muted"
                        >
                          {window.isActive === false ? '重新启用' : '暂停窗口'}
                        </button>
                      </div>
                    )}
                  </>
                )}
              </article>
            );
          })
        )}
      </div>
    </section>
  );
}

function ProductList({
  products,
  merchant,
  canWrite,
  onError,
  onUpdated,
}: {
  products: MerchantProduct[];
  merchant: MerchantContext['merchants'][number];
  canWrite: boolean;
  onError: (error: unknown) => void;
  onUpdated: () => Promise<void>;
}) {
  type ProductDraft = {
    name: string;
    category: string;
    description: string;
    price: string;
    windowId: string;
    imageUrl: string | null;
    imageFile: File | null;
  };

  const [editingId, setEditingId] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState<'all' | MerchantProduct['status']>('all');
  const [drafts, setDrafts] = React.useState<Record<string, ProductDraft>>({});
  const [savingId, setSavingId] = React.useState('');
  const visibleProducts = React.useMemo(
    () =>
      statusFilter === 'all'
        ? products
        : products.filter((product) => product.status === statusFilter),
    [products, statusFilter],
  );

  function startEditing(product: MerchantProduct) {
    setEditingId(product.id);
    setDrafts((current) => ({
      ...current,
      [product.id]: {
        name: product.name,
        category: product.category ?? '其他',
        description: product.description ?? '',
        price: product.priceCents === null ? '' : (product.priceCents / 100).toFixed(2),
        windowId:
          product.window?.id ?? merchant.windows.find((item) => item.isActive !== false)?.id ?? '',
        imageUrl: product.imageUrl,
        imageFile: null,
      },
    }));
  }

  async function save(product: MerchantProduct) {
    const draft = drafts[product.id];
    if (!draft) return;
    const parsedPrice = draft.price.trim() ? Number(draft.price) : null;
    if (
      parsedPrice !== null &&
      (!Number.isFinite(parsedPrice) || parsedPrice < 0 || parsedPrice > 10_000)
    ) {
      onError(new Error('请输入 0 至 10000 元之间的有效价格'));
      return;
    }
    setSavingId(product.id);
    try {
      let imageUrl = draft.imageUrl;
      if (draft.imageFile) {
        const uploaded = await uploadMerchantFoodImage(draft.imageFile);
        imageUrl = uploaded.url;
      }
      await updateMerchantProduct(product.id, {
        name: draft.name.trim(),
        category: draft.category.trim() || null,
        description: draft.description.trim(),
        priceCents: parsedPrice === null ? null : Math.round(parsedPrice * 100),
        imageUrl,
        ...(draft.windowId !== product.window?.id ? { windowId: draft.windowId } : {}),
      });
      await submitMerchantProduct(product.id);
      setEditingId('');
      await onUpdated();
    } catch (error) {
      onError(error);
    } finally {
      setSavingId('');
    }
  }

  async function toggle(product: MerchantProduct) {
    setSavingId(product.id);
    try {
      await updateMerchantProduct(product.id, { isAvailable: !product.isAvailable });
      await onUpdated();
    } catch (error) {
      onError(error);
    } finally {
      setSavingId('');
    }
  }

  async function submit(product: MerchantProduct) {
    setSavingId(product.id);
    try {
      await submitMerchantProduct(product.id);
      await onUpdated();
    } catch (error) {
      onError(error);
    } finally {
      setSavingId('');
    }
  }

  function statusIcon(status: MerchantProduct['status']) {
    if (status === 'published') return <CheckCircle2 className="size-3.5" />;
    if (status === 'pending_review') return <Clock3 className="size-3.5" />;
    return null;
  }

  return (
    <section className="rounded-2xl border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">商品管理</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            管理菜单图片、分类、价格和售卖状态；修改商品资料后会重新进入平台审核。
          </p>
        </div>
        <span className="rounded-full bg-muted px-2.5 py-1 text-xs">共 {products.length} 件</span>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {(['all', 'published', 'pending_review', 'hidden', 'draft', 'deleted'] as const).map(
          (status) => (
            <button
              key={status}
              type="button"
              onClick={() => setStatusFilter(status)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                statusFilter === status
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/70'
              }`}
            >
              {status === 'all' ? '全部' : statusLabels[status]}
              {status !== 'all' && (
                <span className="ml-1 opacity-70">
                  {products.filter((product) => product.status === status).length}
                </span>
              )}
            </button>
          ),
        )}
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {visibleProducts.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {products.length === 0 ? '还没有商品，请先在上方提交菜单。' : '当前筛选下没有商品。'}
          </p>
        ) : (
          visibleProducts.map((product) => {
            const draft = drafts[product.id];
            const editing = editingId === product.id;
            const saving = savingId === product.id;
            return (
              <article
                key={product.id}
                className="overflow-hidden rounded-2xl border bg-background"
              >
                {editing && draft ? (
                  <div className="space-y-3 p-4">
                    <label className="relative flex min-h-36 cursor-pointer items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-orange-200 bg-orange-50/60 text-center">
                      {draft.imageFile ? (
                        <span className="flex flex-col items-center gap-2 p-3 text-xs text-primary">
                          <ImagePlus className="size-7" />
                          <span className="line-clamp-2 break-all">{draft.imageFile.name}</span>
                        </span>
                      ) : draft.imageUrl ? (
                        <Image
                          src={draft.imageUrl}
                          alt=""
                          fill
                          unoptimized
                          sizes="(max-width: 768px) 100vw, 320px"
                          className="object-cover"
                        />
                      ) : (
                        <span className="flex flex-col items-center gap-2 p-3 text-xs text-muted-foreground">
                          <ImagePlus className="size-7 text-primary/70" />
                          上传商品图片
                        </span>
                      )}
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/gif"
                        className="sr-only"
                        onChange={(event) =>
                          setDrafts((current) => ({
                            ...current,
                            [product.id]: {
                              ...draft,
                              imageFile: event.target.files?.[0] ?? null,
                            },
                          }))
                        }
                      />
                    </label>
                    {(draft.imageUrl || draft.imageFile) && (
                      <button
                        type="button"
                        onClick={() =>
                          setDrafts((current) => ({
                            ...current,
                            [product.id]: { ...draft, imageUrl: null, imageFile: null },
                          }))
                        }
                        className="text-left text-xs text-danger hover:underline"
                      >
                        移除商品图片
                      </button>
                    )}
                    <div className="grid gap-3 sm:grid-cols-2">
                      <input
                        value={draft.name}
                        onChange={(event) =>
                          setDrafts((current) => ({
                            ...current,
                            [product.id]: { ...draft, name: event.target.value },
                          }))
                        }
                        className="h-10 rounded-lg border bg-background px-3 text-sm"
                        placeholder="产品名称"
                      />
                      <input
                        list={`merchant-product-categories-${product.id}`}
                        value={draft.category}
                        onChange={(event) =>
                          setDrafts((current) => ({
                            ...current,
                            [product.id]: { ...draft, category: event.target.value },
                          }))
                        }
                        className="h-10 rounded-lg border bg-background px-3 text-sm"
                        placeholder="商品分类"
                      />
                      <datalist id={`merchant-product-categories-${product.id}`}>
                        <option value="主食" />
                        <option value="小吃" />
                        <option value="饮品" />
                        <option value="套餐" />
                        <option value="其他" />
                      </datalist>
                      <input
                        value={draft.price}
                        onChange={(event) =>
                          setDrafts((current) => ({
                            ...current,
                            [product.id]: { ...draft, price: event.target.value },
                          }))
                        }
                        type="number"
                        min="0"
                        step="0.01"
                        className="h-10 rounded-lg border bg-background px-3 text-sm"
                        placeholder="价格（元）"
                      />
                    </div>
                    <select
                      value={draft.windowId}
                      onChange={(event) =>
                        setDrafts((current) => ({
                          ...current,
                          [product.id]: { ...draft, windowId: event.target.value },
                        }))
                      }
                      className="h-10 w-full rounded-lg border bg-background px-3 text-sm"
                    >
                      {merchant.windows
                        .filter((window) => window.isActive !== false)
                        .map((window) => (
                          <option key={window.id} value={window.id}>
                            {window.canteen.name} · {window.name}
                          </option>
                        ))}
                    </select>
                    <textarea
                      value={draft.description}
                      onChange={(event) =>
                        setDrafts((current) => ({
                          ...current,
                          [product.id]: { ...draft, description: event.target.value },
                        }))
                      }
                      className="min-h-20 w-full rounded-lg border bg-background px-3 py-2 text-sm"
                      placeholder="产品介绍"
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={saving || !draft.name.trim() || !draft.windowId}
                        onClick={() => void save(product)}
                        className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground"
                      >
                        {saving ? '保存中…' : '保存并重新审核'}
                      </button>
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => setEditingId('')}
                        className="rounded-lg border px-3 py-2 text-sm hover:bg-muted"
                      >
                        取消
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="relative aspect-[4/3] overflow-hidden bg-orange-50">
                      {product.imageUrl ? (
                        <Image
                          src={product.imageUrl}
                          alt={product.name}
                          fill
                          unoptimized
                          sizes="(max-width: 768px) 100vw, 33vw"
                          className="object-cover"
                        />
                      ) : (
                        <div className="flex h-full flex-col items-center justify-center gap-2 text-xs text-orange-400">
                          <ImagePlus className="size-8" />
                          暂无商品图片
                        </div>
                      )}
                    </div>
                    <div className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="font-semibold">{product.name}</h3>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {product.category ?? '其他'} · {product.window?.name ?? '未指定窗口'}
                            {product.priceCents !== null
                              ? ` · ¥${(product.priceCents / 100).toFixed(2)}`
                              : ''}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs ${
                              product.status === 'published'
                                ? 'bg-emerald-100 text-emerald-700'
                                : product.status === 'pending_review'
                                  ? 'bg-amber-100 text-amber-700'
                                  : 'bg-muted text-muted-foreground'
                            }`}
                          >
                            {statusIcon(product.status)}
                            {statusLabels[product.status] ?? product.status}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {product.isAvailable ? '在售' : '暂停售'}
                          </span>
                        </div>
                      </div>
                      {product.description && (
                        <p className="mt-3 line-clamp-3 whitespace-pre-wrap text-sm text-muted-foreground">
                          {product.description}
                        </p>
                      )}
                      {canWrite && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={saving}
                            onClick={() => startEditing(product)}
                            className="rounded-lg border px-3 py-2 text-xs font-medium hover:bg-muted"
                          >
                            编辑
                          </button>
                          {product.status === 'published' ? (
                            <button
                              type="button"
                              disabled={saving}
                              onClick={() => void toggle(product)}
                              className="rounded-lg border px-3 py-2 text-xs font-medium hover:bg-muted"
                            >
                              {product.isAvailable ? '暂停售卖' : '恢复售卖'}
                            </button>
                          ) : product.status !== 'pending_review' &&
                            product.status !== 'deleted' ? (
                            <button
                              type="button"
                              disabled={saving}
                              onClick={() => void submit(product)}
                              className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground"
                            >
                              {saving ? '提交中…' : '重新提交审核'}
                            </button>
                          ) : null}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </article>
            );
          })
        )}
      </div>
    </section>
  );
}

function PostList({
  posts,
  merchant,
  canWrite,
  onError,
  onUpdated,
}: {
  posts: MerchantPost[];
  merchant: MerchantContext['merchants'][number];
  canWrite: boolean;
  onError: (error: unknown) => void;
  onUpdated: () => Promise<void>;
}) {
  const [editingId, setEditingId] = React.useState('');
  const [drafts, setDrafts] = React.useState<
    Record<
      string,
      { type: MerchantPost['type']; title: string; contentMd: string; windowId: string }
    >
  >({});
  const [savingId, setSavingId] = React.useState('');

  function startEditing(post: MerchantPost) {
    setEditingId(post.id);
    setDrafts((current) => ({
      ...current,
      [post.id]: {
        type: post.type,
        title: post.title,
        contentMd: post.contentMd,
        windowId: post.window?.id ?? '',
      },
    }));
  }

  async function save(post: MerchantPost) {
    const draft = drafts[post.id];
    if (!draft) return;
    setSavingId(post.id);
    try {
      await updateMerchantPost(post.id, {
        type: draft.type,
        title: draft.title.trim(),
        contentMd: draft.contentMd,
        ...(draft.windowId !== post.window?.id ? { windowId: draft.windowId } : {}),
      });
      setEditingId('');
      await onUpdated();
    } catch (error) {
      onError(error);
    } finally {
      setSavingId('');
    }
  }

  return (
    <section className="rounded-2xl border bg-card p-5">
      <h2 className="text-lg font-bold">发布记录</h2>
      <div className="mt-4 space-y-3">
        {posts.length === 0 ? (
          <p className="text-sm text-muted-foreground">还没有宣传内容。</p>
        ) : (
          posts.map((post) => {
            const draft = drafts[post.id];
            const editing = editingId === post.id;
            const saving = savingId === post.id;
            return (
              <article key={post.id} className="rounded-xl border p-4">
                {editing && draft ? (
                  <div className="space-y-3">
                    <div className="grid gap-3 sm:grid-cols-3">
                      <select
                        value={draft.type}
                        onChange={(event) =>
                          setDrafts((current) => ({
                            ...current,
                            [post.id]: {
                              ...draft,
                              type: event.target.value as MerchantPost['type'],
                            },
                          }))
                        }
                        className="h-10 rounded-lg border bg-background px-3 text-sm"
                      >
                        <option value="new_product">新品</option>
                        <option value="promotion">促销</option>
                        <option value="advertisement">广告</option>
                        <option value="notice">公告</option>
                      </select>
                      <input
                        value={draft.title}
                        onChange={(event) =>
                          setDrafts((current) => ({
                            ...current,
                            [post.id]: { ...draft, title: event.target.value },
                          }))
                        }
                        className="h-10 rounded-lg border bg-background px-3 text-sm sm:col-span-2"
                        placeholder="标题"
                      />
                    </div>
                    <select
                      value={draft.windowId}
                      onChange={(event) =>
                        setDrafts((current) => ({
                          ...current,
                          [post.id]: { ...draft, windowId: event.target.value },
                        }))
                      }
                      className="h-10 w-full rounded-lg border bg-background px-3 text-sm"
                    >
                      {merchant.windows.map((window) => (
                        <option
                          key={window.id}
                          value={window.id}
                          disabled={window.isActive === false}
                        >
                          {window.canteen.name} · {window.name}
                        </option>
                      ))}
                    </select>
                    <textarea
                      value={draft.contentMd}
                      onChange={(event) =>
                        setDrafts((current) => ({
                          ...current,
                          [post.id]: { ...draft, contentMd: event.target.value },
                        }))
                      }
                      className="min-h-28 w-full rounded-lg border bg-background px-3 py-2 text-sm"
                      placeholder="宣传内容"
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={
                          saving ||
                          !draft.title.trim() ||
                          !draft.contentMd.trim() ||
                          !draft.windowId
                        }
                        onClick={() => void save(post)}
                        className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground"
                      >
                        {saving ? '保存中…' : '保存并重新审核'}
                      </button>
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => setEditingId('')}
                        className="rounded-lg border px-3 py-2 text-sm hover:bg-muted"
                      >
                        取消
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="font-semibold">{post.title}</h3>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {post.window?.name ?? '未指定窗口'}
                          {post.publishAt
                            ? ` · 定时 ${new Date(post.publishAt).toLocaleString('zh-CN')}`
                            : ''}
                        </p>
                      </div>
                      <span className="rounded-full bg-muted px-2 py-1 text-xs">
                        {statusLabels[post.status]}
                      </span>
                    </div>
                    <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-sm text-muted-foreground">
                      {post.contentMd}
                    </p>
                    {canWrite && (
                      <button
                        type="button"
                        onClick={() => startEditing(post)}
                        className="mt-3 rounded-lg border px-3 py-2 text-xs font-medium hover:bg-muted"
                      >
                        编辑并重新提交
                      </button>
                    )}
                  </>
                )}
              </article>
            );
          })
        )}
      </div>
    </section>
  );
}

function ReviewList({
  reviews,
  canWrite,
  onError,
  onReplied,
}: {
  reviews: MerchantReview[];
  canWrite: boolean;
  onError: (error: unknown) => void;
  onReplied: () => Promise<void>;
}) {
  const [drafts, setDrafts] = React.useState<Record<string, string>>({});
  const [savingId, setSavingId] = React.useState('');
  async function reply(id: string) {
    const content = drafts[id]?.trim();
    if (!content) return;
    setSavingId(id);
    try {
      await replyMerchantReview(id, content);
      setDrafts((current) => ({ ...current, [id]: '' }));
      await onReplied();
    } catch (error) {
      onError(error);
    } finally {
      setSavingId('');
    }
  }
  return (
    <section className="rounded-2xl border bg-card p-5">
      <h2 className="text-lg font-bold">用户评价与意见</h2>
      <p className="mt-1 text-sm text-muted-foreground">用户身份在商家后台统一匿名显示。</p>
      <div className="mt-4 space-y-3">
        {reviews.length === 0 ? (
          <p className="text-sm text-muted-foreground">暂时没有评价。</p>
        ) : (
          reviews.map((review) => (
            <article key={review.id} className="rounded-xl border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="font-medium">
                  匿名同学 ·{' '}
                  {review.type === 'taste_review' ? `${review.tasteScore ?? '—'} 星` : '意见反馈'}
                </span>
                <span className="text-xs text-muted-foreground">
                  {review.window.name} · {new Date(review.createdAt).toLocaleDateString('zh-CN')}
                </span>
              </div>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-6">{review.contentMd}</p>
              {review.replies.map((reply) => (
                <div key={reply.id} className="mt-3 rounded-lg bg-muted p-3 text-sm">
                  <span className="font-medium text-primary">
                    官方回复 · {statusLabels[reply.status]}
                  </span>
                  <p className="mt-1 whitespace-pre-wrap">{reply.contentMd}</p>
                </div>
              ))}
              {canWrite && (
                <div className="mt-3 flex gap-2">
                  <input
                    value={drafts[review.id] ?? ''}
                    onChange={(event) =>
                      setDrafts((current) => ({ ...current, [review.id]: event.target.value }))
                    }
                    className="h-10 min-w-0 flex-1 rounded-lg border bg-background px-3 text-sm"
                    placeholder="回复这条评价"
                  />
                  <button
                    type="button"
                    disabled={savingId === review.id || !drafts[review.id]?.trim()}
                    onClick={() => void reply(review.id)}
                    className="rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground"
                  >
                    {savingId === review.id ? '发送中…' : '回复'}
                  </button>
                </div>
              )}
            </article>
          ))
        )}
      </div>
    </section>
  );
}
