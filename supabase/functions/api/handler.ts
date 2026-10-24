// Pull API for receiving systems (FR-REQ-07, docs/PROCUREMENT_HANDOFF.md section 4).
//
//   GET  /api/v1/item-requests?status=approved|sent&since=ISO   approved: take and mark sent (one batch)
//   POST /api/v1/item-requests/{id or number}/ack               {"external_ref", "status", "note"}
//
// The API key goes in the X-Api-Key header (or "Authorization: Bearer tgk_..."). All checks are in the
// database (api_item_requests, api_ack); this module only routes. Plain TypeScript so it is tested with
// Vitest; index.ts runs it on the Supabase Edge Runtime.

export type RpcResult = { data: unknown; error: { message: string; code?: string } | null };
export type Rpc = (fn: string, args: Record<string, unknown>) => Promise<RpcResult>;

const STATUS_BY_CODE: Record<string, number> = {
  '28000': 401,
  '22023': 400,
  P0002: 404,
  '42501': 403,
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

export function apiKeyOf(req: Request): string | null {
  const direct = req.headers.get('x-api-key');
  if (direct) return direct.trim();
  const auth = req.headers.get('authorization') ?? '';
  const m = /^Bearer\s+(tgk_[0-9a-f]+)$/i.exec(auth.trim());
  return m ? m[1]! : null;
}

function fromRpc(r: RpcResult): Response {
  if (!r.error) return json(200, r.data);
  const status = STATUS_BY_CODE[r.error.code ?? ''] ?? 500;
  // Server errors keep their detail out of the response.
  return json(status, { error: status === 500 ? 'internal error' : r.error.message });
}

export function makeHandler(rpc: Rpc) {
  return async (req: Request): Promise<Response> => {
    const url = new URL(req.url);
    const m = /\/v1\/item-requests(?:\/([^/]+)\/ack)?\/?$/.exec(url.pathname);
    if (!m) return json(404, { error: 'not found' });
    const key = apiKeyOf(req);
    if (!key) return json(401, { error: 'API key required (X-Api-Key header)' });

    if (!m[1]) {
      if (req.method !== 'GET') return json(405, { error: 'use GET' });
      const status = url.searchParams.get('status') ?? 'approved';
      const since = url.searchParams.get('since');
      if (since && Number.isNaN(Date.parse(since)))
        return json(400, { error: 'since must be an ISO date or time' });
      return fromRpc(
        await rpc('api_item_requests', { p_key: key, p_status: status, p_since: since }),
      );
    }

    if (req.method !== 'POST') return json(405, { error: 'use POST' });
    let body: { external_ref?: unknown; status?: unknown; note?: unknown };
    try {
      body = (await req.json()) as typeof body;
    } catch {
      return json(400, { error: 'body must be JSON' });
    }
    const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
    return fromRpc(
      await rpc('api_ack', {
        p_key: key,
        p_request: decodeURIComponent(m[1]),
        p_external_ref: str(body.external_ref),
        p_status: str(body.status) ?? 'acknowledged',
        p_note: str(body.note),
      }),
    );
  };
}
