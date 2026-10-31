export type Role = 'admin' | 'staff' | 'customer';
export type User = { id: number; name: string; email: string; role: Role; active?: boolean };
export type Row = {
  id: number;
  number?: string;
  name?: string;
  status?: string;
  version?: number;
  [key: string]: any;
};
export type FieldError = { field: string; message: string };

const messages: Record<string, string> = {
  invalid_credentials: 'Email or password is incorrect.',
  duplicate_email: 'This email is already registered.',
  password_rule: 'Use more than eight characters, uppercase, lowercase, and a special character.',
  invalid_reset_token: 'This reset link is expired or already used.',
  invalid_session: 'Your session ended. Sign in again.',
  forbidden: 'You do not have access to this action.',
  not_found: 'This record is unavailable.',
  precondition_failed: 'This record changed. Reload it before continuing.',
  invalid_transition: 'This action is unavailable for the current status.',
  action_unavailable: 'This action is unavailable for the current plan or status.',
  catalog_item_unavailable: 'A selected product is unavailable or uses a different currency.',
  minimum_quantity: 'The quantity is below the plan minimum.',
  plan_unavailable: 'The plan is unavailable for the selected dates.',
  discount_exhausted: 'The discount usage limit was reached. Recalculate this draft invoice.',
  invalid_report_dates: 'Choose a valid date range.',
  name_required: 'Enter a name.',
  deactivate_variants_instead: 'Deactivate variants instead of removing them.',
  invalid_payment: 'Enter a positive payment within the invoice balance and currency.',
  idempotency_conflict: 'The request changed. Close this form and try again.',
  invoice_unavailable: 'Confirm this invoice before downloading it.',
  validation_error: 'Check the highlighted fields.',
};

export class ApiError extends Error {
  constructor(
    public code: string,
    public status: number,
    public fields: FieldError[] = [],
  ) {
    super(messages[code] || code.replaceAll('_', ' '));
  }
}

export async function request<T = any>(
  path: string,
  token = '',
  options: RequestInit = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/v1/${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    });
  } catch (error) {
    if ((error as Error).name === 'AbortError') throw error;
    throw new Error('Connection failed. Try again.');
  }
  if (response.status === 204) return undefined as T;
  const result = await response.json();
  if (!response.ok) {
    const detail = result.detail || result.error;
    const fields = Array.isArray(detail)
      ? detail.map((item) => ({ field: item.loc.slice(1).join('.'), message: item.msg }))
      : detail?.fields || [];
    throw new ApiError(
      Array.isArray(detail) ? 'validation_error' : detail?.code || 'Request failed',
      response.status,
      fields,
    );
  }
  return result as T;
}

export function actionHeaders(version?: number, key = crypto.randomUUID()) {
  return { 'Idempotency-Key': key, ...(version ? { 'If-Match': String(version) } : {}) };
}

export async function downloadInvoice(id: number, token: string, filename: string) {
  const response = await fetch(`/api/v1/invoices/${id}/pdf`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error('Invoice PDF is unavailable.');
  const url = URL.createObjectURL(await response.blob());
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
