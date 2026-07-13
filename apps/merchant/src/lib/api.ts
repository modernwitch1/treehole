export type MerchantRole = 'owner' | 'editor' | 'viewer';
export type ContentStatus = 'published' | 'pending_review' | 'hidden' | 'deleted';
export type ProductStatus = 'draft' | 'pending_review' | 'published' | 'hidden' | 'deleted';

export interface MerchantWindow {
  id: string;
  floor: number;
  name: string;
  windowNumber: string | null;
  locationDescription: string | null;
  isActive?: boolean;
  canteen: { id: string; slug: string; name: string };
}

export interface MerchantSummary {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  logoUrl: string | null;
  contactDisplay: string | null;
  status: string;
  role: MerchantRole;
  windows: MerchantWindow[];
}

export interface MerchantContext {
  account: { id: string; email: string; displayName: string; isPlatformAdmin: boolean };
  merchants: MerchantSummary[];
}

export interface MerchantProduct {
  id: string;
  merchantId: string;
  name: string;
  category: string | null;
  description: string | null;
  priceCents: number | null;
  imageUrl: string | null;
  status: ProductStatus;
  isAvailable: boolean;
  sortOrder: number;
  window: MerchantWindow | null;
  createdAt: string;
  updatedAt: string;
}

export interface MerchantPost {
  id: string;
  type: 'new_product' | 'promotion' | 'advertisement' | 'notice';
  title: string;
  contentMd: string;
  contentHtml: string;
  status: ContentStatus;
  coverUrl: string | null;
  publishAt: string | null;
  expiresAt: string | null;
  isPinned: boolean;
  merchant: { id: string; slug: string; name: string; logoUrl: string | null };
  window: MerchantWindow | null;
  createdAt: string;
  updatedAt: string;
}

export interface MerchantReview {
  id: string;
  type: 'taste_review' | 'suggestion';
  tasteScore: number | null;
  contentMd: string;
  status: ContentStatus;
  author: { type: 'anonymous'; displayName: string };
  window: MerchantWindow;
  replies: Array<{
    id: string;
    contentMd: string;
    status: ContentStatus;
    createdAt: string;
  }>;
  createdAt: string;
}

let refreshPromise: Promise<boolean> | null = null;

async function refreshMerchantSession(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = fetch('/api/v1/merchant/auth/refresh', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    })
      .then((response) => response.ok)
      .catch(() => false)
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

async function request<T>(path: string, init?: RequestInit, canRefresh = true): Promise<T> {
  const isMultipart = typeof FormData !== 'undefined' && init?.body instanceof FormData;
  const response = await fetch(`/api/v1${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      ...(isMultipart ? {} : { 'Content-Type': 'application/json' }),
      ...(init?.headers ?? {}),
    },
  });
  const isAuthEndpoint = path.startsWith('/merchant/auth/');
  if (response.status === 401 && canRefresh && !isAuthEndpoint) {
    if (await refreshMerchantSession()) {
      return request<T>(path, init, false);
    }
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? '请求失败，请稍后重试');
  }
  return response.json() as Promise<T>;
}

export async function merchantLogin(email: string, password: string) {
  return request<{ status: 'approved'; account: MerchantContext['account'] }>(
    '/merchant/auth/login',
    {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    },
  );
}

export async function acceptMerchantInvitation(data: {
  token: string;
  displayName: string;
  password: string;
  acceptTerms: boolean;
}) {
  return request<{
    status: 'approved';
    account: MerchantContext['account'];
    merchant: MerchantSummary;
  }>('/merchant/auth/invitations/accept', { method: 'POST', body: JSON.stringify(data) });
}

export async function merchantLogout() {
  return request<{ ok: true }>('/merchant/auth/logout', { method: 'POST' });
}

export async function getMerchantContext() {
  return request<MerchantContext>('/merchant/me');
}

export async function listMerchantProducts(merchantId: string) {
  return request<MerchantProduct[]>(
    `/merchant/products?merchantId=${encodeURIComponent(merchantId)}`,
  );
}

export async function createMerchantProduct(data: {
  name: string;
  category?: string;
  description?: string;
  priceCents?: number;
  windowId: string;
  imageUrl?: string | null;
  isAvailable?: boolean;
}) {
  return request<MerchantProduct>('/merchant/products', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateMerchantProduct(
  id: string,
  data: Partial<{
    name: string;
    category: string | null;
    description: string;
    priceCents: number | null;
    imageUrl: string | null;
    windowId: string;
    isAvailable: boolean;
    sortOrder: number;
  }>,
) {
  return request<MerchantProduct>(`/merchant/products/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function submitMerchantProduct(id: string) {
  return request<MerchantProduct>(`/merchant/products/${id}/submit`, { method: 'POST' });
}

export async function uploadMerchantFoodImage(file: File) {
  const formData = new FormData();
  formData.append('file', file);
  return request<{ url: string; moderationStatus: string }>('/merchant/uploads/food-image', {
    method: 'POST',
    body: formData,
  });
}

export async function updateMerchantProfile(merchantId: string, data: Record<string, string>) {
  return request<MerchantSummary>(`/merchant/merchants/${merchantId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function updateMerchantWindow(
  id: string,
  data: Partial<{
    name: string;
    windowNumber: string;
    locationDescription: string;
    isActive: boolean;
  }>,
) {
  return request<MerchantWindow>(`/merchant/windows/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function listMerchantPosts(merchantId: string) {
  return request<MerchantPost[]>(`/merchant/posts?merchantId=${encodeURIComponent(merchantId)}`);
}

export async function createMerchantPost(data: {
  type: MerchantPost['type'];
  title: string;
  contentMd: string;
  windowId: string;
}) {
  return request<MerchantPost>('/merchant/posts', { method: 'POST', body: JSON.stringify(data) });
}

export async function updateMerchantPost(
  id: string,
  data: Partial<{
    type: MerchantPost['type'];
    title: string;
    contentMd: string;
    windowId: string;
    coverUrl: string;
    publishAt: string;
    expiresAt: string;
  }>,
) {
  return request<MerchantPost>(`/merchant/posts/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function listMerchantReviews(merchantId: string) {
  return request<MerchantReview[]>(
    `/merchant/reviews?merchantId=${encodeURIComponent(merchantId)}`,
  );
}

export async function replyMerchantReview(reviewId: string, contentMd: string) {
  return request(`/merchant/reviews/${reviewId}/replies`, {
    method: 'POST',
    body: JSON.stringify({ contentMd }),
  });
}
