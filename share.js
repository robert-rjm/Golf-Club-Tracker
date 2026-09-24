// Live round sharing through Supabase, used by index.html and view.html.
// Fill in from Supabase: Project Settings → API. The publishable (anon) key is meant to be
// public; the table is only reachable through the functions in supabase.sql.
const SUPABASE_URL = 'https://rtzewnwviszidnbobsdz.supabase.co';
const SUPABASE_KEY = 'sb_publishable_EOsCT7vRJhYoPIkn2hbJxA_5VFIWtrp';

const shareEnabled = () => Boolean(SUPABASE_URL && SUPABASE_KEY);

async function supabaseRpc(fn, args) {
  const headers = { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' };
  // Legacy anon keys are JWTs and go in Authorization too; the newer publishable keys don't
  if (SUPABASE_KEY.startsWith('eyJ')) headers.Authorization = `Bearer ${SUPABASE_KEY}`;
  const res = await fetch(`${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/rpc/${fn}`, {
    method: 'POST', headers, body: JSON.stringify(args)
  });
  if (!res.ok) throw new Error(`${fn} failed (${res.status})`);
  return res.json();
}

// 6 characters, no 0/O or 1/I, shown as ABC-123
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function randomCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, b => CODE_CHARS[b % CODE_CHARS.length]).join('');
}
function randomSecret() {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('');
}
const formatCode = code => code.slice(0, 3) + '-' + code.slice(3);
const normaliseCode = input => String(input).toUpperCase().replace(/[^A-Z0-9]/g, '');
