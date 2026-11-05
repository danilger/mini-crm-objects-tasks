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
