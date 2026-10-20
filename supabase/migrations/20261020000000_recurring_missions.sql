-- Add recurring daily/weekly mission series.
alter table public.missions
  add column if not exists recurrence_id uuid;

create index if not exists missions_user_recurrence_idx
  on public.missions(user_id, recurrence_id, due_date);

-- Keep recurrence_id immutable from the client after creation.
grant update (title, category, difficulty, duration_minutes, mission_type, due_date, note) on public.missions to authenticated;

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
  v_next_due date;
  v_next_id uuid;
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

  if v_m.recurrence_id is not null then
    v_next_due := greatest(
      v_m.due_date + case when v_m.mission_type = 'weekly' then 7 else 1 end,
      current_date + case when v_m.mission_type = 'weekly' then 7 else 1 end
    );
    insert into public.missions (user_id, title, category, difficulty, duration_minutes, mission_type, due_date, note, recurrence_id)
    values (v_uid, v_m.title, v_m.category, v_m.difficulty, v_m.duration_minutes, v_m.mission_type, v_next_due, v_m.note, v_m.recurrence_id)
    returning id into v_next_id;
  end if;

  select total_xp into v_new_level from public.profiles where id = v_uid;
  return jsonb_build_object(
    'already_completed', false,
    'mission_id', v_m.id,
    'xp_awarded', v_xp,
    'coins_awarded', v_coins,
    'next_mission_id', v_next_id,
    'next_due_date', v_next_due,
    'total_xp', v_new_level
  );
end;
$$;

revoke all on function private._complete_mission(uuid) from public, anon;
grant execute on function private._complete_mission(uuid) to authenticated;
