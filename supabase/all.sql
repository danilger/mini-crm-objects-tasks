-- =============================================================================
-- ONE-SHOT: paste into Supabase → SQL Editor → Run
-- =============================================================================

-- Mini-CRM: objects, tasks, roles, RLS, status transitions, immutable history

create extension if not exists pgcrypto;

create type public.user_role as enum ('manager', 'worker');
create type public.task_status as enum (
  'new',
  'in_progress',
  'in_review',
  'rework',
  'accepted'
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text not null default '',
  role public.user_role not null,
  created_at timestamptz not null default now()
);

create table public.objects (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  address text not null default '',
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  object_id uuid not null references public.objects (id) on delete cascade,
  title text not null,
  description text not null default '',
  assignee_id uuid not null references public.profiles (id),
  author_id uuid not null references public.profiles (id),
  status public.task_status not null default 'new',
  created_at timestamptz not null default now()
);

create table public.task_status_history (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  from_status public.task_status,
  to_status public.task_status not null,
  changed_by uuid not null references public.profiles (id),
  comment text,
  created_at timestamptz not null default now()
);

create index tasks_object_id_idx on public.tasks (object_id);
create index tasks_assignee_id_idx on public.tasks (assignee_id);
create index task_status_history_task_id_idx on public.task_status_history (task_id);

create or replace function public.current_role()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_manager()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'manager'
  );
$$;

create or replace function public.can_see_task(p_task_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.tasks t
    where t.id = p_task_id
      and (
        public.is_manager()
        or t.assignee_id = auth.uid()
      )
  );
$$;

create or replace function public.enforce_task_status_via_rpc()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    if current_setting('app.allow_status_transition', true) is distinct from 'on' then
      raise exception 'Status can only be changed via transition_task()';
    end if;
  end if;

  if tg_op = 'INSERT' and new.status is distinct from 'new' then
    raise exception 'New tasks must start with status new';
  end if;

  return new;
end;
$$;

create trigger tasks_enforce_status_via_rpc
before insert or update on public.tasks
for each row
execute function public.enforce_task_status_via_rpc();

create or replace function public.log_task_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.task_status_history (
    task_id, from_status, to_status, changed_by, comment
  ) values (
    new.id, null, new.status, new.author_id, null
  );
  return new;
end;
$$;

create trigger tasks_log_created
after insert on public.tasks
for each row
execute function public.log_task_created();

create or replace function public.transition_task(
  p_task_id uuid,
  p_new_status public.task_status,
  p_comment text default null
)
returns public.tasks
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task public.tasks;
  v_from public.task_status;
  v_uid uuid := auth.uid();
  v_is_manager boolean := public.is_manager();
  v_allowed boolean := false;
  v_comment text := nullif(trim(coalesce(p_comment, '')), '');
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_task
  from public.tasks
  where id = p_task_id
  for update;

  if not found then
    raise exception 'Task not found';
  end if;

  v_from := v_task.status;

  if v_from = p_new_status then
    raise exception 'Task is already in status %', p_new_status;
  end if;

  if v_from = 'new' and p_new_status = 'in_progress' then
    v_allowed := (v_task.assignee_id = v_uid);
  elsif v_from = 'in_progress' and p_new_status = 'in_review' then
    v_allowed := (v_task.assignee_id = v_uid);
  elsif v_from = 'in_review' and p_new_status = 'accepted' then
    v_allowed := v_is_manager;
  elsif v_from = 'in_review' and p_new_status = 'rework' then
    v_allowed := v_is_manager;
    if v_comment is null then
      raise exception 'Comment is required when returning a task for rework';
    end if;
  elsif v_from = 'rework' and p_new_status = 'in_progress' then
    v_allowed := (v_task.assignee_id = v_uid);
  else
    v_allowed := false;
  end if;

  if not v_allowed then
    raise exception 'Transition from % to % is not allowed for current user',
      v_from, p_new_status;
  end if;

  perform set_config('app.allow_status_transition', 'on', true);

  update public.tasks
  set status = p_new_status
  where id = p_task_id
  returning * into v_task;

  insert into public.task_status_history (
    task_id, from_status, to_status, changed_by, comment
  ) values (
    p_task_id, v_from, p_new_status, v_uid, v_comment
  );

  return v_task;
end;
$$;

alter table public.profiles enable row level security;
alter table public.objects enable row level security;
alter table public.tasks enable row level security;
alter table public.task_status_history enable row level security;

create policy profiles_select_authenticated
  on public.profiles for select
  to authenticated
  using (true);

create policy objects_select_manager
  on public.objects for select
  to authenticated
  using (public.is_manager());

create policy objects_select_worker
  on public.objects for select
  to authenticated
  using (
    exists (
      select 1 from public.tasks t
      where t.object_id = objects.id
        and t.assignee_id = auth.uid()
    )
  );

create policy objects_insert_manager
  on public.objects for insert
  to authenticated
  with check (public.is_manager() and created_by = auth.uid());

create policy objects_update_manager
  on public.objects for update
  to authenticated
  using (public.is_manager())
  with check (public.is_manager());

create policy objects_delete_manager
  on public.objects for delete
  to authenticated
  using (public.is_manager());

create policy tasks_select_manager
  on public.tasks for select
  to authenticated
  using (public.is_manager());

create policy tasks_select_assignee
  on public.tasks for select
  to authenticated
  using (assignee_id = auth.uid());

create policy tasks_insert_manager
  on public.tasks for insert
  to authenticated
  with check (
    public.is_manager()
    and author_id = auth.uid()
    and status = 'new'
  );

create policy tasks_update_manager
  on public.tasks for update
  to authenticated
  using (public.is_manager())
  with check (public.is_manager());

create policy tasks_delete_manager
  on public.tasks for delete
  to authenticated
  using (public.is_manager());

create policy history_select_visible
  on public.task_status_history for select
  to authenticated
  using (public.can_see_task(task_id));

grant usage on schema public to anon, authenticated;

grant select on table public.profiles to authenticated;
grant select, insert, update, delete on table public.objects to authenticated;
grant select, insert, update, delete on table public.tasks to authenticated;
grant select on table public.task_status_history to authenticated;

grant execute on function public.current_role() to authenticated;
grant execute on function public.is_manager() to authenticated;
grant execute on function public.can_see_task(uuid) to authenticated;
grant execute on function public.transition_task(uuid, public.task_status, text) to authenticated;

revoke all on table public.profiles from anon;
revoke all on table public.objects from anon;
revoke all on table public.tasks from anon;
revoke all on table public.task_status_history from anon;

-- =============================================================================
-- SEED
-- =============================================================================

-- Run AFTER init migration, in SQL Editor (role postgres).
-- Expects exactly the Auth users you already created.
-- First created user → manager (постановщик), the rest → workers (исполнители).

insert into public.profiles (id, email, full_name, role)
select
  s.id,
  s.email,
  case
    when s.rn = 1 then 'Постановщик'
    else 'Исполнитель ' || (s.rn - 1)::text
  end,
  case
    when s.rn = 1 then 'manager'::public.user_role
    else 'worker'::public.user_role
  end
from (
  select
    id,
    coalesce(email, id::text) as email,
    row_number() over (order by created_at) as rn
  from auth.users
) s
on conflict (id) do update
set
  email = excluded.email,
  full_name = excluded.full_name,
  role = excluded.role;

-- Demo objects + tasks in different statuses
do $$
declare
  v_manager uuid;
  v_w1 uuid;
  v_w2 uuid;
  v_obj1 uuid;
  v_obj2 uuid;
  v_obj3 uuid;
  v_t uuid;
  v_workers uuid[];
begin
  select id into v_manager
  from public.profiles
  where role = 'manager'
  order by created_at
  limit 1;

  if v_manager is null then
    raise exception 'No manager profile. Create Auth users and re-run seed.';
  end if;

  select array_agg(id order by created_at)
  into v_workers
  from public.profiles
  where role = 'worker';

  if coalesce(array_length(v_workers, 1), 0) < 1 then
    raise exception 'Need at least one worker profile.';
  end if;

  v_w1 := v_workers[1];
  v_w2 := coalesce(v_workers[2], v_workers[1]);

  -- idempotent-ish: wipe previous demo rows if re-seeding
  delete from public.objects where title in ('ЖК Северный', 'БЦ Горизонт', 'Склад Логистик');

  insert into public.objects (title, address, created_by)
  values ('ЖК Северный', 'ул. Строителей, 1', v_manager)
  returning id into v_obj1;

  insert into public.objects (title, address, created_by)
  values ('БЦ Горизонт', 'пр. Мира, 15', v_manager)
  returning id into v_obj2;

  insert into public.objects (title, address, created_by)
  values ('Склад Логистик', 'промзона 4', v_manager)
  returning id into v_obj3;

  -- new
  insert into public.tasks (object_id, title, description, assignee_id, author_id, status)
  values (v_obj1, 'Разметка фундамента', 'Проверить оси на участке А', v_w1, v_manager, 'new');

  -- in_progress
  insert into public.tasks (object_id, title, description, assignee_id, author_id, status)
  values (v_obj1, 'Заливка бетона', 'Участок Б', v_w1, v_manager, 'new')
  returning id into v_t;
  perform set_config('app.allow_status_transition', 'on', true);
  update public.tasks set status = 'in_progress' where id = v_t;
  insert into public.task_status_history (task_id, from_status, to_status, changed_by, comment)
  values (v_t, 'new', 'in_progress', v_w1, null);

  -- in_review
  insert into public.tasks (object_id, title, description, assignee_id, author_id, status)
  values (v_obj2, 'Электромонтаж 2 этаж', 'Щитовая и стояки', v_w2, v_manager, 'new')
  returning id into v_t;
  perform set_config('app.allow_status_transition', 'on', true);
  update public.tasks set status = 'in_review' where id = v_t;
  insert into public.task_status_history (task_id, from_status, to_status, changed_by, comment)
  values
    (v_t, 'new', 'in_progress', v_w2, null),
    (v_t, 'in_progress', 'in_review', v_w2, null);

  -- rework
  insert into public.tasks (object_id, title, description, assignee_id, author_id, status)
  values (v_obj2, 'Гидроизоляция кровли', 'Парапет и примыкания', v_w2, v_manager, 'new')
  returning id into v_t;
  perform set_config('app.allow_status_transition', 'on', true);
  update public.tasks set status = 'rework' where id = v_t;
  insert into public.task_status_history (task_id, from_status, to_status, changed_by, comment)
  values
    (v_t, 'new', 'in_progress', v_w2, null),
    (v_t, 'in_progress', 'in_review', v_w2, null),
    (v_t, 'in_review', 'rework', v_manager, 'Не закрыты примыкания у вентиляционных шахт');

  -- accepted
  insert into public.tasks (object_id, title, description, assignee_id, author_id, status)
  values (v_obj3, 'Установка ворот', 'Въездная группа', v_w1, v_manager, 'new')
  returning id into v_t;
  perform set_config('app.allow_status_transition', 'on', true);
  update public.tasks set status = 'accepted' where id = v_t;
  insert into public.task_status_history (task_id, from_status, to_status, changed_by, comment)
  values
    (v_t, 'new', 'in_progress', v_w1, null),
    (v_t, 'in_progress', 'in_review', v_w1, null),
    (v_t, 'in_review', 'accepted', v_manager, null);
end $$;

-- Quick check
select id, email, full_name, role from public.profiles order by created_at;
select title, address from public.objects order by created_at;
select title, status from public.tasks order by created_at;
