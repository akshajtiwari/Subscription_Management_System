export type User = {
  id: number;
  name: string;
  email: string;
  role: 'admin' | 'staff' | 'customer';
};
export type Row = {
  id: number;
  number?: string;
  name?: string;
  status?: string;
  version?: number;
  [key: string]: any;
};

export async function request(path: string, token = '', options: RequestInit = {}) {
  const response = await fetch(`/api/v1/${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.detail?.code || result.detail || 'Request failed');
  return result;
}

export function actionHeaders(version?: number) {
  return {
    'Idempotency-Key': crypto.randomUUID(),
    ...(version ? { 'If-Match': String(version) } : {}),
  };
}
