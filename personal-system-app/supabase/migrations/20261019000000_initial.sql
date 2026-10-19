-- PERSONAL SYSTEM: initial schema, ownership rules, and server-side reward RPCs.
-- Run in the Supabase SQL Editor or via Supabase CLI migrations.

create extension if not exists pgcrypto;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Player' check (char_length(display_name) between 1 and 35),
  avatar text not null default 'P' check (char_length(avatar) between 1 and 2),
  total_xp bigint not null default 0 check (total_xp >= 0),
  coins bigint not null default 0 check (coins >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.missions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 90),
  category text not null default 'personal' check (category in ('learning','programming','language','health','discipline','finance','personal')),
  difficulty text not null default 'normal' check (difficulty in ('easy','normal','hard','elite')),
  duration_minutes integer not null default 30 check (duration_minutes between 1 and 1440),
  mission_type text not null default 'daily' check (mission_type in ('daily','weekly')),
  due_date date not null default current_date,
  note text not null default '' check (char_length(note) <= 220),
  completed boolean not null default false,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists missions_user_date_idx on public.missions(user_id, due_date, created_at desc);

create table if not exists public.rewards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 90),
  description text not null default '' check (char_length(description) <= 220),
  icon text not null default '🎁' check (char_length(icon) <= 8),
  cost integer not null check (cost between 1 and 1000000),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.reward_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null check (event_type in ('mission_reward','reward_redemption','admin_adjustment')),
  mission_id uuid references public.missions(id) on delete set null,
  reward_id uuid references public.rewards(id) on delete set null,
  request_id uuid,
  xp_delta integer not null default 0,
  coins_delta integer not null default 0,
  label text not null check (char_length(label) between 1 and 180),
  created_at timestamptz not null default now()
);

create index if not exists reward_transactions_user_created_idx on public.reward_transactions(user_id, created_at desc);
create unique index if not exists one_reward_per_mission on public.reward_transactions(mission_id) where event_type = 'mission_reward' and mission_id is not null;
create unique index if not exists one_transaction_per_request on public.reward_transactions(user_id, request_id) where request_id is not null;

-- Create a profile automatically at sign-up. The client cannot set EXP or coins directly.
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, avatar)
  values (
    new.id,
    coalesce(nullif(left(new.raw_user_meta_data ->> 'display_name', 35), ''), 'Player'),
    coalesce(nullif(left(new.raw_user_meta_data ->> 'avatar', 2), ''), 'P')
  )
  on conflict (id) do nothing;

  insert into public.rewards (user_id, title, description, icon, cost, active)
  values
    (new.id, 'Giải trí 30 phút', 'Một khoảng nghỉ có chủ đích sau khi hoàn thành việc quan trọng.', '🎮', 50, true),
    (new.id, 'Một món ăn yêu thích', 'Tự thưởng một món nhỏ phù hợp với ngân sách.', '🍜', 80, true),
    (new.id, 'Thời gian cho sở thích', 'Dành thời gian cho một hoạt động bạn yêu thích.', '🎧', 35, true);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
after insert on auth.users
for each row execute procedure private.handle_new_user();
revoke all on function private.handle_new_user() from public, anon, authenticated;

alter table public.profiles enable row level security;
alter table public.missions enable row level security;
alter table public.rewards enable row level security;
alter table public.reward_transactions enable row level security;

-- Profiles: visible only to the owner; client can edit presentation fields, not balances.
drop policy if exists "profile_select_own" on public.profiles;
create policy "profile_select_own" on public.profiles for select to authenticated using (id = (select auth.uid()));
drop policy if exists "profile_update_own" on public.profiles;
create policy "profile_update_own" on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
revoke all on public.profiles from public, anon, authenticated;
grant select on public.profiles to authenticated;
grant update (display_name, avatar) on public.profiles to authenticated;

-- Missions: users can only CRUD their own tasks. Reward fields are controlled by RPCs.
drop policy if exists "missions_select_own" on public.missions;
create policy "missions_select_own" on public.missions for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "missions_insert_own_pending" on public.missions;
create policy "missions_insert_own_pending" on public.missions for insert to authenticated with check (user_id = (select auth.uid()) and completed = false and completed_at is null);
drop policy if exists "missions_update_own_pending" on public.missions;
create policy "missions_update_own_pending" on public.missions for update to authenticated using (user_id = (select auth.uid()) and completed = false) with check (user_id = (select auth.uid()) and completed = false and completed_at is null);
drop policy if exists "missions_delete_own_pending" on public.missions;
create policy "missions_delete_own_pending" on public.missions for delete to authenticated using (user_id = (select auth.uid()) and completed = false);
revoke all on public.missions from public, anon, authenticated;
grant select, insert, delete on public.missions to authenticated;
grant update (title, category, difficulty, duration_minutes, mission_type, due_date, note) on public.missions to authenticated;

-- Rewards: each user manages their own reward shop.
drop policy if exists "rewards_select_own" on public.rewards;
create policy "rewards_select_own" on public.rewards for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "rewards_insert_own" on public.rewards;
create policy "rewards_insert_own" on public.rewards for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists "rewards_update_own" on public.rewards;
create policy "rewards_update_own" on public.rewards for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists "rewards_delete_own" on public.rewards;
create policy "rewards_delete_own" on public.rewards for delete to authenticated using (user_id = (select auth.uid()));
revoke all on public.rewards from public, anon, authenticated;
grant select, insert, update, delete on public.rewards to authenticated;

-- Transactions are read-only to the client. Only trusted database functions may write them.
drop policy if exists "transactions_select_own" on public.reward_transactions;
create policy "transactions_select_own" on public.reward_transactions for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.reward_transactions from public, anon, authenticated;
grant select on public.reward_transactions to authenticated;

create or replace function private._complete_mission(p_mission_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_m public.missions%rowtype;
  v_xp integer;
  v_coins integer;
  v_new_level bigint;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;

  select * into v_m
  from public.missions
  where id = p_mission_id and user_id = v_uid
  for update;

  if not found then raise exception 'Mission not found'; end if;
  if v_m.completed then
    return jsonb_build_object('already_completed', true, 'mission_id', v_m.id);
  end if;

  v_xp := case v_m.difficulty when 'easy' then 10 when 'normal' then 25 when 'hard' then 50 when 'elite' then 100 else 25 end;
  v_coins := case v_m.difficulty when 'easy' then 3 when 'normal' then 6 when 'hard' then 12 when 'elite' then 25 else 6 end;

  update public.missions set completed = true, completed_at = now()
  where id = v_m.id and user_id = v_uid;

  update public.profiles
  set total_xp = total_xp + v_xp, coins = coins + v_coins
  where id = v_uid;

  insert into public.reward_transactions(user_id, event_type, mission_id, xp_delta, coins_delta, label)
  values (v_uid, 'mission_reward', v_m.id, v_xp, v_coins, 'Hoàn thành: ' || v_m.title);

  select total_xp into v_new_level from public.profiles where id = v_uid;
  return jsonb_build_object('already_completed', false, 'mission_id', v_m.id, 'xp_awarded', v_xp, 'coins_awarded', v_coins, 'total_xp', v_new_level);
end;
$$;

create or replace function private._redeem_reward(p_reward_id uuid, p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_profile public.profiles%rowtype;
  v_reward public.rewards%rowtype;
  v_tx public.reward_transactions%rowtype;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if p_request_id is null then raise exception 'Request id is required'; end if;

  select * into v_tx from public.reward_transactions
  where user_id = v_uid and request_id = p_request_id;
  if found then return jsonb_build_object('already_processed', true, 'coins_delta', v_tx.coins_delta, 'label', v_tx.label); end if;

  select * into v_profile from public.profiles where id = v_uid for update;
  if not found then raise exception 'Profile not found'; end if;

  -- Recheck after locking the profile to make same-request retries idempotent.
  select * into v_tx from public.reward_transactions
  where user_id = v_uid and request_id = p_request_id;
  if found then return jsonb_build_object('already_processed', true, 'coins_delta', v_tx.coins_delta, 'label', v_tx.label); end if;

  select * into v_reward from public.rewards
  where id = p_reward_id and user_id = v_uid and active = true;
  if not found then raise exception 'Reward not found or inactive'; end if;
  if v_profile.coins < v_reward.cost then raise exception 'Insufficient coins'; end if;

  update public.profiles set coins = coins - v_reward.cost where id = v_uid;
  insert into public.reward_transactions(user_id, event_type, reward_id, request_id, coins_delta, label)
  values (v_uid, 'reward_redemption', v_reward.id, p_request_id, -v_reward.cost, 'Đổi thưởng: ' || v_reward.title);

  return jsonb_build_object('already_processed', false, 'coins_spent', v_reward.cost, 'label', v_reward.title);
end;
$$;

-- Keep SECURITY DEFINER functions in an unexposed schema; public RPCs are invoker wrappers.
revoke all on function private._complete_mission(uuid) from public, anon;
revoke all on function private._redeem_reward(uuid, uuid) from public, anon;
grant execute on function private._complete_mission(uuid) to authenticated;
grant execute on function private._redeem_reward(uuid, uuid) to authenticated;

create or replace function public.complete_mission(p_mission_id uuid)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private._complete_mission(p_mission_id);
$$;

create or replace function public.redeem_reward(p_reward_id uuid, p_request_id uuid)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private._redeem_reward(p_reward_id, p_request_id);
$$;

revoke all on function public.complete_mission(uuid) from public, anon;
revoke all on function public.redeem_reward(uuid, uuid) from public, anon;
grant execute on function public.complete_mission(uuid) to authenticated;
grant execute on function public.redeem_reward(uuid, uuid) to authenticated;
