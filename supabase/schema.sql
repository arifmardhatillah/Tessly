-- Tessly (AI Token Tracker): skema Supabase
-- Jalankan seluruh file ini di Supabase > SQL Editor, lalu jalankan bagian "KUNCI TIM" di paling bawah.
--
-- Tabel tidak bisa diakses langsung oleh kunci anon/publishable (RLS aktif tanpa policy + REVOKE).
-- Semua baca/tulis lewat dua fungsi yang memeriksa kunci tim: tm_push (agen) dan tm_get (dashboard).

create table if not exists public.machines (
  machine_id   text primary key,
  machine_name text not null,
  os_user      text not null,
  app_version  text,
  last_seen    timestamptz not null default now()
);

create table if not exists public.token_usage (
  machine_id         text   not null references public.machines (machine_id) on delete cascade,
  day                date   not null,
  model              text   not null,
  input_tokens       bigint not null default 0,
  output_tokens      bigint not null default 0,
  cache_write_tokens bigint not null default 0,
  cache_read_tokens  bigint not null default 0,
  messages           integer not null default 0,
  updated_at         timestamptz not null default now(),
  primary key (machine_id, day, model)
);

create index if not exists token_usage_day_idx on public.token_usage (day);

create table if not exists public.app_secret (
  id            smallint primary key default 1 check (id = 1),
  team_key_hash text not null
);

alter table public.machines    enable row level security;
alter table public.token_usage enable row level security;
alter table public.app_secret  enable row level security;

revoke all on public.machines, public.token_usage, public.app_secret from anon, authenticated;

-- Pemeriksa kunci tim (hanya dipanggil dari fungsi lain, tidak bisa dipanggil klien).
create or replace function public._tm_check_key(p_key text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_key is null or length(p_key) < 8 or p_key = 'GANTI-DENGAN-KUNCI-TIM' or not exists (
    select 1 from public.app_secret s
    where s.team_key_hash = encode(sha256(convert_to(p_key, 'UTF8')), 'hex')
  ) then
    raise exception 'Kunci tim salah' using errcode = '28000';
  end if;
end;
$$;

-- Agen di tiap komputer mengirim total per (tanggal, model).
-- GREATEST: total tidak pernah turun walau Claude Code menghapus log lama (default 30 hari).
create or replace function public.tm_push(p_key text, p_machine jsonb, p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id text := p_machine ->> 'id';
  v_n  integer;
begin
  perform public._tm_check_key(p_key);
  if coalesce(v_id, '') = '' or length(v_id) > 64 then
    raise exception 'ID perangkat tidak valid';
  end if;
  if jsonb_typeof(coalesce(p_rows, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_rows, '[]'::jsonb)) > 1000 then
    raise exception 'Data terlalu besar (maks 1000 baris per kiriman)';
  end if;

  insert into public.machines as m (machine_id, machine_name, os_user, app_version, last_seen)
  values (
    v_id,
    left(coalesce(nullif(p_machine ->> 'name', ''), '?'), 100),
    left(coalesce(nullif(p_machine ->> 'user', ''), '?'), 100),
    left(p_machine ->> 'version', 20),
    now()
  )
  on conflict (machine_id) do update
    set machine_name = excluded.machine_name,
        os_user      = excluded.os_user,
        app_version  = excluded.app_version,
        last_seen    = now();

  insert into public.token_usage as t
    (machine_id, day, model, input_tokens, output_tokens, cache_write_tokens, cache_read_tokens, messages, updated_at)
  select v_id, r.d, left(r.mo, 100),
         greatest(coalesce(r.i, 0), 0), greatest(coalesce(r.o, 0), 0),
         greatest(coalesce(r.cw, 0), 0), greatest(coalesce(r.cr, 0), 0),
         greatest(coalesce(r.n, 0), 0), now()
  from jsonb_to_recordset(coalesce(p_rows, '[]'::jsonb))
       as r(d date, mo text, i bigint, o bigint, cw bigint, cr bigint, n integer)
  where r.d is not null and coalesce(r.mo, '') <> ''
  on conflict (machine_id, day, model) do update
    set input_tokens       = greatest(t.input_tokens, excluded.input_tokens),
        output_tokens      = greatest(t.output_tokens, excluded.output_tokens),
        cache_write_tokens = greatest(t.cache_write_tokens, excluded.cache_write_tokens),
        cache_read_tokens  = greatest(t.cache_read_tokens, excluded.cache_read_tokens),
        messages           = greatest(t.messages, excluded.messages),
        updated_at         = now();

  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- Dashboard: perangkat, harian (sejak p_daily_since), dan bulanan (semua waktu).
-- Dikembalikan sebagai satu jsonb agar tidak terpotong batas 1000 baris PostgREST.
create or replace function public.tm_get(p_key text, p_daily_since date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public._tm_check_key(p_key);
  return jsonb_build_object(
    'server_time', now(),
    'machines', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.machine_id, 'name', m.machine_name, 'user', m.os_user,
        'version', m.app_version, 'last_seen', m.last_seen))
      from public.machines m), '[]'::jsonb),
    'daily', coalesce((
      select jsonb_agg(jsonb_build_object(
        'm', u.machine_id, 'd', u.day, 'mo', u.model,
        'i', u.input_tokens, 'o', u.output_tokens,
        'cw', u.cache_write_tokens, 'cr', u.cache_read_tokens, 'n', u.messages))
      from public.token_usage u
      where u.day >= p_daily_since), '[]'::jsonb),
    'monthly', coalesce((
      select jsonb_agg(jsonb_build_object(
        'm', x.machine_id, 'd', x.mon, 'mo', x.model,
        'i', x.i, 'o', x.o, 'cw', x.cw, 'cr', x.cr, 'n', x.n))
      from (
        select machine_id, to_char(day, 'YYYY-MM') as mon, model,
               sum(input_tokens) as i, sum(output_tokens) as o,
               sum(cache_write_tokens) as cw, sum(cache_read_tokens) as cr,
               sum(messages) as n
        from public.token_usage
        group by 1, 2, 3
      ) x), '[]'::jsonb)
  );
end;
$$;

-- Menghapus perangkat yang sudah tidak dipakai (beserta datanya).
create or replace function public.tm_remove_machine(p_key text, p_machine_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public._tm_check_key(p_key);
  delete from public.machines where machine_id = p_machine_id;
end;
$$;

revoke all on function public._tm_check_key(text) from public, anon, authenticated;
revoke all on function public.tm_push(text, jsonb, jsonb) from public;
revoke all on function public.tm_get(text, date) from public;
revoke all on function public.tm_remove_machine(text, text) from public;
grant execute on function public.tm_push(text, jsonb, jsonb) to anon, authenticated;
grant execute on function public.tm_get(text, date) to anon, authenticated;
grant execute on function public.tm_remove_machine(text, text) to anon, authenticated;

-- ============================================================
-- KUNCI TIM
-- Ganti GANTI-DENGAN-KUNCI-TIM dengan kunci panjang buatan Anda (min. 8 karakter, disarankan 24+),
-- lalu jalankan. Kunci yang sama dimasukkan di Pengaturan aplikasi Tessly di setiap komputer.
-- Jalankan lagi dengan kunci baru kapan saja untuk menggantinya.
-- ============================================================
insert into public.app_secret (id, team_key_hash)
values (1, encode(sha256(convert_to('GANTI-DENGAN-KUNCI-TIM', 'UTF8')), 'hex'))
on conflict (id) do update set team_key_hash = excluded.team_key_hash;
