-- 권한 확인용 내부 함수를 API에 노출되지 않는 private 스키마로 이동
create schema if not exists private;
grant usage on schema private to authenticated;
alter function public.share_level_of(uuid) set schema private;
alter function public.can_view_owner(uuid) set schema private;
alter function public.can_see_task(uuid) set schema private;
create or replace function public.set_deleg_state(p_task uuid, p_state public.deleg_state)
returns void language plpgsql security definer set search_path = '' as $$
declare t record;
begin
  select * into t from public.tasks where id = p_task for update;
  if not found then raise exception 'not_found'; end if;
  if not (t.owner_id = (select auth.uid())
          or (t.delegate_id = (select auth.uid()) and private.share_level_of(t.owner_id) = 'deleg')) then
    raise exception 'not_allowed';
  end if;
  update public.tasks set deleg_state = p_state,
    status = case when p_state = 'done' then 'done'::public.task_status else 'deleg'::public.task_status end
  where id = p_task;
end $$;
create or replace function public.weekly_summary(p_owner uuid, p_week_start date)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare r jsonb; today date := (now() at time zone 'Asia/Seoul')::date;
begin
  if not (p_owner = (select auth.uid()) or private.share_level_of(p_owner) in ('summary','comment')) then
    raise exception 'not_allowed';
  end if;
  select jsonb_build_object(
    'effective', count(*) filter (where status not in ('fwd','cancel')),
    'done',      count(*) filter (where status = 'done'),
    'a_effective', count(*) filter (where priority = 'A' and status not in ('fwd','cancel')),
    'a_done',    count(*) filter (where priority = 'A' and status = 'done')
  ) into r
  from public.tasks where owner_id = p_owner and plan_date between p_week_start and p_week_start + 6;
  r := r || jsonb_build_object(
    'by_day', coalesce((select jsonb_agg(d order by d->>'date') from (
        select jsonb_build_object('date', plan_date,
          'open', count(*) filter (where status='open'), 'progress', count(*) filter (where status='progress'),
          'done', count(*) filter (where status='done'), 'fwd', count(*) filter (where status='fwd'),
          'deleg', count(*) filter (where status='deleg'), 'cancel', count(*) filter (where status='cancel')) d
        from public.tasks where owner_id = p_owner and plan_date between p_week_start and p_week_start + 6
        group by plan_date) x), '[]'::jsonb),
    'overdue', (select count(*) from public.tasks where owner_id = p_owner and plan_date < today and status in ('open','progress')),
    'delegated', (select count(*) from public.tasks where owner_id = p_owner and status = 'deleg'));
  return r;
end $$;
