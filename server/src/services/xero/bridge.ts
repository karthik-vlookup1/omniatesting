/**
 * Client for Sam's Omnia Xero OHL bridge (closed REST surface, X-Api-Key). The bridge owns Xero auth
 * and is bound to ONE org; it dedupes pushes on externalRef for 30 days. See the Recon app's
 * docs/specs/xero-bridge-contract.md. The URL and key are never logged.
 */

export type TargetEnv = 'demo' | 'live';

export interface XeroConfig {
  url: string | null;
  key: string | null;
  /** 'demo' only when XERO_TARGET_ENV is exactly "demo"; anything else (unset included) is live. */
  targetEnv: TargetEnv;
}

export function loadXeroConfig(env: NodeJS.ProcessEnv = process.env): XeroConfig {
  const url = env.XERO_BRIDGE_URL?.trim() || null;
  const key = env.XERO_BRIDGE_RECON_KEY?.trim() || null;
  if (url && !/^https:\/\//.test(url) && env.NODE_ENV === 'production') {
    throw new Error('XERO_BRIDGE_URL must be https');
  }
  return {
    url,
    key,
    targetEnv: env.XERO_TARGET_ENV?.trim() === 'demo' ? 'demo' : 'live',
  };
}

export interface BridgeLineItem {
  description: string;
  quantity: number;
  unitAmount: number;
  accountCode: string;
  taxType: string;
  itemCode?: string;
  tracking?: { name: string; option: string }[];
}

export interface BridgeInvoice {
  externalRef: string;
  contactId: string;
  date: string;
  dueDate: string;
  status: 'AUTHORISED';
  lineItems: BridgeLineItem[];
  invoiceNumber?: string;
  reference?: string;
}

export interface BridgeInvoiceResult {
  invoiceId: string;
  invoiceNumber: string | null;
  status: string | null;
  deduped: boolean;
}

export interface XeroBridge {
  health(): Promise<{ status: string; tenantId: string | null }>;
  upsertContact(name: string): Promise<{ contactId: string; created: boolean }>;
  createInvoice(invoice: BridgeInvoice): Promise<BridgeInvoiceResult>;
}

/** A bridge call that failed; `status` is the HTTP status (0 = network / timeout). */
export class BridgeError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'BridgeError';
  }
}

export function createHttpBridge(
  { url, key }: { url: string; key: string },
  { timeoutMs = 20_000, fetchImpl = fetch }: { timeoutMs?: number; fetchImpl?: typeof fetch } = {},
): XeroBridge {
  const base = url.replace(/\/+$/, '');

  async function call<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    let res: Response;
    try {
      res = await fetchImpl(`${base}${path}`, {
        method,
        headers: {
          'X-Api-Key': key,
          Accept: 'application/json',
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      throw new BridgeError(
        `Xero bridge unreachable: ${(err as Error).name === 'TimeoutError' ? 'timed out' : 'network error'}`,
        0,
      );
    }
    const text = await res.text();
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      // fall through: a non-JSON body is reported by status
    }
    if (!res.ok) {
      const msg = (json as { error?: unknown } | null)?.error;
      throw new BridgeError(
        `Xero bridge ${path} answered ${res.status}: ${typeof msg === 'string' ? msg.slice(0, 300) : 'error'}`,
        res.status,
      );
    }
    return json as T;
  }

  return {
    async health() {
      const r = await call<{ status?: string; tenantId?: string }>('GET', '/health');
      return { status: r?.status ?? 'unknown', tenantId: r?.tenantId ?? null };
    },
    async upsertContact(name) {
      const r = await call<{ contactId?: string; created?: boolean }>('POST', '/api/contacts', { name, email: null });
      if (!r?.contactId) throw new BridgeError('Xero bridge returned no contactId', 502);
      return { contactId: r.contactId, created: Boolean(r.created) };
    },
    async createInvoice(invoice) {
      const r = await call<{
        invoice?: {
          invoiceId?: string;
          invoiceNumber?: string;
          status?: string;
        };
        deduped?: boolean;
      }>('POST', '/api/invoices', invoice);
      if (!r?.invoice?.invoiceId) throw new BridgeError('Xero bridge returned no invoiceId', 502);
      return {
        invoiceId: r.invoice.invoiceId,
        invoiceNumber: r.invoice.invoiceNumber ?? null,
        status: r.invoice.status ?? null,
        deduped: Boolean(r.deduped),
      };
    },
  };
}
