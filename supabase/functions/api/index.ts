// Supabase Edge Function "api": the receivers' pull API (see handler.ts). Deployed with
// verify_jwt = false (supabase/config.toml): receivers use their API key, not a Supabase sign-in.
// It calls the database as anon; api_item_requests and api_ack check the key themselves.
import { makeHandler, type Rpc } from './handler.ts';

declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (req: Request) => Promise<Response>): void;
};

const url = Deno.env.get('SUPABASE_URL')!;
const anon = Deno.env.get('SUPABASE_ANON_KEY')!;

const rpc: Rpc = async (fn, args) => {
  const res = await fetch(`${url}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: anon, authorization: `Bearer ${anon}`, 'content-type': 'application/json' },
    body: JSON.stringify(args),
  });
  const body = await res.json().catch(() => null);
  if (res.ok) return { data: body, error: null };
  return { data: null, error: { message: body?.message ?? res.statusText, code: body?.code } };
};

Deno.serve(makeHandler(rpc));
