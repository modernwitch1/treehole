export interface ApiErrorBody {
  code?: string;
  message?: string;
  requestId?: string;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
    public readonly requestId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function requestJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(url, {
    ...init,
    credentials: init.credentials ?? 'include',
    headers,
  });
  const text = await response.text();
  const body = parseBody(text);

  if (!response.ok) {
    const error = isApiErrorBody(body) ? body : undefined;
    throw new ApiError(
      error?.message || response.statusText || `HTTP ${response.status}`,
      response.status,
      error?.code ?? 'UNKNOWN',
      error?.requestId ?? response.headers.get('X-Request-Id') ?? undefined,
    );
  }

  return (body ?? {}) as T;
}

function parseBody(text: string): unknown {
  if (!text) {
    return undefined;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function isApiErrorBody(value: unknown): value is ApiErrorBody {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
