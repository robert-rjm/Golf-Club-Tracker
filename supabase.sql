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

-- Courses saved in the app's course editor, sent here to be added to courses.js.
-- The app can only add rows. Read them in Table Editor → course_submissions and paste `snippet`.
create table if not exists public.course_submissions (
  id         bigint generated always as identity primary key,
  name       text not null,
  snippet    text not null,
  data       jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.course_submissions enable row level security;
revoke all on public.course_submissions from anon, authenticated;

create or replace function public.submit_course(p_name text, p_snippet text, p_data jsonb)
returns boolean
language plpgsql security definer set search_path = public
as $$
begin
  if length(p_name) not between 1 and 100 or length(p_snippet) > 20000
     or pg_column_size(p_data) > 20000 then
    return false;
  end if;
  -- Crude flood guard, since the key is public
  if (select count(*) from course_submissions where created_at > now() - interval '1 hour') >= 50 then
    return false;
  end if;

  insert into course_submissions (name, snippet, data) values (p_name, p_snippet, p_data);
  return true;
end $$;

revoke all on function public.submit_course(text, text, jsonb) from public;
grant execute on function public.submit_course(text, text, jsonb) to anon, authenticated;
