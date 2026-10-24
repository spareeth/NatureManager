import { describe, expect, it, vi } from 'vitest';
import { apiKeyOf, makeHandler, type Rpc } from '../../../../supabase/functions/api/handler';

const BASE = 'http://localhost:54321/functions/v1/api/v1/item-requests';
const KEY = 'tgk_0123abcd';

describe('pull API handler (Edge Function)', () => {
  it('reads the key from X-Api-Key or a Bearer header', () => {
    expect(apiKeyOf(new Request(BASE, { headers: { 'x-api-key': KEY } }))).toBe(KEY);
    expect(apiKeyOf(new Request(BASE, { headers: { authorization: `Bearer ${KEY}` } }))).toBe(KEY);
    expect(
      apiKeyOf(new Request(BASE, { headers: { authorization: 'Bearer eyJhbGciOi' } })),
    ).toBeNull();
  });

  it('GET passes status and since to api_item_requests', async () => {
    const rpc = vi
      .fn<Rpc>()
      .mockResolvedValue({ data: { batch_id: 'b1', item_requests: [] }, error: null });
    const res = await makeHandler(rpc)(
      new Request(`${BASE}?status=sent&since=2026-11-01`, { headers: { 'x-api-key': KEY } }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ batch_id: 'b1', item_requests: [] });
    expect(rpc).toHaveBeenCalledWith('api_item_requests', {
      p_key: KEY,
      p_status: 'sent',
      p_since: '2026-11-01',
    });
  });

  it('POST ack passes the request, reference and status', async () => {
    const rpc = vi.fn<Rpc>().mockResolvedValue({ data: { status: 'acknowledged' }, error: null });
    const res = await makeHandler(rpc)(
      new Request(`${BASE}/IR-2026-000042/ack`, {
        method: 'POST',
        headers: { 'x-api-key': KEY, 'content-type': 'application/json' },
        body: JSON.stringify({ external_ref: ' PR-778 ' }),
      }),
    );
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith('api_ack', {
      p_key: KEY,
      p_request: 'IR-2026-000042',
      p_external_ref: 'PR-778',
      p_status: 'acknowledged',
      p_note: null,
    });
  });

  it('maps database refusals to HTTP status codes and hides server errors', async () => {
    const h = (code: string) =>
      makeHandler(
        vi.fn<Rpc>().mockResolvedValue({ data: null, error: { message: `msg ${code}`, code } }),
      )(new Request(BASE, { headers: { 'x-api-key': KEY } }));
    expect((await h('28000')).status).toBe(401);
    expect((await h('22023')).status).toBe(400);
    expect((await h('P0002')).status).toBe(404);
    const err = await h('XX000');
    expect(err.status).toBe(500);
    expect(await err.json()).toEqual({ error: 'internal error' });
  });

  it('rejects requests without a key, bad paths, methods and dates', async () => {
    const rpc = vi.fn<Rpc>();
    const h = makeHandler(rpc);
    expect((await h(new Request(BASE))).status).toBe(401);
    expect(
      (
        await h(
          new Request(`${BASE.replace('item-requests', 'other')}`, {
            headers: { 'x-api-key': KEY },
          }),
        )
      ).status,
    ).toBe(404);
    expect(
      (await h(new Request(BASE, { method: 'DELETE', headers: { 'x-api-key': KEY } }))).status,
    ).toBe(405);
    expect(
      (await h(new Request(`${BASE}?since=yesterday`, { headers: { 'x-api-key': KEY } }))).status,
    ).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });
});
