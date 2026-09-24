-- Live round sharing. Run once in the Supabase SQL editor.
-- The table has RLS on and no policies, so it's only reachable through the functions below.

create table if not exists public.shared_rounds (
  code        text primary key,
  secret_hash text not null,
  data        jsonb not null,
  updated_at  timestamptz not null default now()
);

alter table public.shared_rounds enable row level security;
revoke all on public.shared_rounds from anon, authenticated;

-- Creates a round under a new code, or updates it when the secret matches.
-- Returns false if the code is taken by someone else.
create or replace function public.share_round(p_code text, p_secret text, p_data jsonb)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare
  h text := encode(sha256(convert_to(p_secret, 'UTF8')), 'hex');
begin
  if p_code !~ '^[A-Z0-9]{6}$' or length(p_secret) < 16 or pg_column_size(p_data) > 100000 then
    return false;
  end if;

  delete from shared_rounds where updated_at < now() - interval '30 days';

  insert into shared_rounds (code, secret_hash, data)
  values (p_code, h, p_data)
  on conflict (code) do update
    set data = excluded.data, updated_at = now()
    where shared_rounds.secret_hash = excluded.secret_hash;

  return found;
end $$;

-- Returns { data, updated_at } for a code, or null.
create or replace function public.get_round(p_code text)
returns jsonb
language sql stable security definer set search_path = public
as $$
  select jsonb_build_object('data', data, 'updated_at', updated_at)
  from shared_rounds
  where code = upper(p_code) and updated_at > now() - interval '30 days';
$$;

create or replace function public.unshare_round(p_code text, p_secret text)
returns boolean
language plpgsql security definer set search_path = public
as $$
begin
  delete from shared_rounds
  where code = p_code and secret_hash = encode(sha256(convert_to(p_secret, 'UTF8')), 'hex');
  return found;
end $$;

revoke all on function public.share_round(text, text, jsonb) from public;
revoke all on function public.get_round(text) from public;
revoke all on function public.unshare_round(text, text) from public;
grant execute on function public.share_round(text, text, jsonb) to anon, authenticated;
grant execute on function public.get_round(text) to anon, authenticated;
grant execute on function public.unshare_round(text, text) to anon, authenticated;
