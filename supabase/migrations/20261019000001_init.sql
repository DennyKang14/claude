-- Franklin Planner: schema, row-level security, functions, triggers
-- 권한 원칙: 모든 데이터는 owner_id(주인)를 갖고, 공유는 shares 테이블의 수준(summary/comment/deleg)으로만 열린다.

create extension if not exists pgcrypto;

-- ───────────── types ─────────────
create type public.task_status as enum ('open','progress','done','fwd','deleg','cancel');
create type public.share_level as enum ('summary','comment','deleg');
create type public.deleg_state as enum ('pending','accepted','working','done');

-- ───────────── tables ─────────────
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  name text not null default '',
  created_at timestamptz not null default now()
);

create table public.shares (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  grantee_email text not null,
  grantee_name text not null default '',
  grantee_id uuid references public.profiles(id) on delete cascade,
  level public.share_level not null,
  created_at timestamptz not null default now(),
  unique (owner_id, grantee_email),
  check (grantee_email = lower(grantee_email))
);
create index on public.shares (grantee_id);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  name text not null check (length(name) between 1 and 120),
  description text not null default '',
  archived boolean not null default false,
  created_at timestamptz not null default now()
);
create index on public.projects (owner_id);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  plan_date date not null,
  priority char(1) not null check (priority in ('A','B','C')),
  seq int not null default 1,
  title text not null check (length(title) between 1 and 300),
  status public.task_status not null default 'open',
  memo text not null default '',
  due_date date,
  project_id uuid references public.projects(id) on delete set null,
  checklist jsonb not null default '[]'::jsonb check (jsonb_typeof(checklist) = 'array'),
  from_task_id uuid references public.tasks(id) on delete set null,
  from_date date,
  fwd_to date,
  delegate_id uuid references public.profiles(id) on delete set null,
  deleg_state public.deleg_state,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.tasks (owner_id, plan_date);
create index on public.tasks (delegate_id);
create index on public.tasks (project_id);
create index on public.tasks (from_task_id);

create table public.task_links (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  owner_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  title text not null default '',
  url text not null check (url ~* '^https?://'),
  created_at timestamptz not null default now()
);
create index on public.task_links (task_id);

create table public.task_relations (
  task_id uuid not null references public.tasks(id) on delete cascade,
  related_id uuid not null references public.tasks(id) on delete cascade,
  owner_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  primary key (task_id, related_id),
  check (task_id <> related_id)
);
create index on public.task_relations (related_id);

create table public.task_history (
  id bigint generated always as identity primary key,
  task_id uuid not null references public.tasks(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  detail text not null default '',
  created_at timestamptz not null default now()
);
create index on public.task_history (task_id);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  owner_id uuid references public.profiles(id) on delete cascade,
  author_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  body text not null check (length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index on public.comments (task_id);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  event_date date not null,
  start_time time not null,
  end_time time,
  title text not null check (length(title) between 1 and 300),
  place text not null default '',
  source text not null default 'manual' check (source in ('manual','google','outlook')),
  external_id text,
  created_at timestamptz not null default now()
);
create index on public.events (owner_id, event_date);

create table public.daily_notes (
  owner_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  note_date date not null,
  body text not null default '',
  updated_at timestamptz not null default now(),
  primary key (owner_id, note_date)
);

create table public.compass_mission (
  owner_id uuid primary key default auth.uid() references public.profiles(id) on delete cascade,
  body text not null default '',
  updated_at timestamptz not null default now()
);

create table public.weekly_roles (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  week_start date not null,
  name text not null default '',
  goal text not null default '',
  done boolean not null default false,
  sort int not null default 0,
  created_at timestamptz not null default now()
);
create index on public.weekly_roles (owner_id, week_start);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  kind text not null,
  task_id uuid references public.tasks(id) on delete cascade,
  body text not null default '',
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.notifications (user_id, created_at desc);

-- ───────────── access helpers (security definer, no recursion through RLS) ─────────────
create or replace function public.share_level_of(p_owner uuid)
returns public.share_level language sql stable security definer set search_path = '' as $$
  select s.level from public.shares s
  where s.owner_id = p_owner and s.grantee_id = (select auth.uid())
  limit 1
$$;

create or replace function public.can_view_owner(p_owner uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_owner = (select auth.uid())
      or exists (select 1 from public.shares s
                 where s.owner_id = p_owner and s.grantee_id = (select auth.uid()) and s.level = 'comment')
$$;

-- 업무 열람: 주인, 보기+코멘트 권한자, 그 업무를 위임받은 위임 협업 권한자
create or replace function public.can_see_task(p_task uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.tasks t
    where t.id = p_task and (
      t.owner_id = (select auth.uid())
      or exists (select 1 from public.shares s where s.owner_id = t.owner_id and s.grantee_id = (select auth.uid()) and s.level = 'comment')
      or (t.delegate_id = (select auth.uid())
          and exists (select 1 from public.shares s where s.owner_id = t.owner_id and s.grantee_id = (select auth.uid()) and s.level = 'deleg'))
    ))
$$;

-- ───────────── RLS ─────────────
alter table public.profiles        enable row level security;
alter table public.shares          enable row level security;
alter table public.projects        enable row level security;
alter table public.tasks           enable row level security;
alter table public.task_links      enable row level security;
alter table public.task_relations  enable row level security;
alter table public.task_history    enable row level security;
alter table public.comments        enable row level security;
alter table public.events          enable row level security;
alter table public.daily_notes     enable row level security;
alter table public.compass_mission enable row level security;
alter table public.weekly_roles    enable row level security;
alter table public.notifications   enable row level security;

-- profiles: 본인 + 공유 관계가 있는 사람(이름 표시용)
create policy profiles_select on public.profiles for select to authenticated using (
  id = (select auth.uid())
  or exists (select 1 from public.shares s where
      (s.owner_id = (select auth.uid()) and s.grantee_id = profiles.id)
   or (s.grantee_id = (select auth.uid()) and s.owner_id = profiles.id))
);
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- shares: 공유한 사람이 관리, 받은 사람은 읽기
create policy shares_select on public.shares for select to authenticated
  using (owner_id = (select auth.uid()) or grantee_id = (select auth.uid()));
create policy shares_insert on public.shares for insert to authenticated with check (owner_id = (select auth.uid()));
create policy shares_update on public.shares for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy shares_delete on public.shares for delete to authenticated using (owner_id = (select auth.uid()));

-- 주인 전용 쓰기 + 보기 권한자 읽기 (projects, events, compass, weekly_roles)
create policy projects_select on public.projects for select to authenticated using (public.can_view_owner(owner_id)
  or exists (select 1 from public.tasks t where t.project_id = projects.id and t.delegate_id = (select auth.uid()) and public.share_level_of(t.owner_id) = 'deleg'));
create policy projects_write on public.projects for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

create policy events_select on public.events for select to authenticated using (public.can_view_owner(owner_id));
create policy events_write on public.events for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

create policy mission_select on public.compass_mission for select to authenticated using (public.can_view_owner(owner_id));
create policy mission_write on public.compass_mission for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

create policy roles_select on public.weekly_roles for select to authenticated using (public.can_view_owner(owner_id));
create policy roles_write on public.weekly_roles for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

-- daily_notes: 본인 전용 (어떤 공유 수준에도 열리지 않음)
create policy notes_owner on public.daily_notes for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

-- tasks
create policy tasks_select on public.tasks for select to authenticated using (
  owner_id = (select auth.uid())
  or public.share_level_of(owner_id) = 'comment'
  or (delegate_id = (select auth.uid()) and public.share_level_of(owner_id) = 'deleg')
);
create policy tasks_insert on public.tasks for insert to authenticated with check (
  owner_id = (select auth.uid())
  and (project_id is null or exists (select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid())))
  and (delegate_id is null or exists (select 1 from public.shares s where s.owner_id = (select auth.uid()) and s.grantee_id = delegate_id and s.level = 'deleg'))
);
create policy tasks_update on public.tasks for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (
    owner_id = (select auth.uid())
    and (project_id is null or exists (select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid())))
    and (delegate_id is null or exists (select 1 from public.shares s where s.owner_id = (select auth.uid()) and s.grantee_id = delegate_id and s.level = 'deleg'))
  );
create policy tasks_delete on public.tasks for delete to authenticated using (owner_id = (select auth.uid()));

-- links / relations: 업무를 볼 수 있으면 읽기, 주인만 쓰기
create policy links_select on public.task_links for select to authenticated using (public.can_see_task(task_id));
create policy links_write on public.task_links for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()) and exists (select 1 from public.tasks t where t.id = task_id and t.owner_id = (select auth.uid())));

create policy rel_select on public.task_relations for select to authenticated using (public.can_see_task(task_id) and public.can_see_task(related_id));
create policy rel_write on public.task_relations for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid())
    and exists (select 1 from public.tasks t where t.id = task_id and t.owner_id = (select auth.uid()))
    and exists (select 1 from public.tasks t where t.id = related_id and t.owner_id = (select auth.uid())));

-- history: 읽기만 (쓰기는 트리거 전용)
create policy history_select on public.task_history for select to authenticated using (public.can_see_task(task_id));

-- comments: 업무를 볼 수 있는 사람 중 주인·코멘트 권한자·위임받은 사람이 작성
create policy comments_select on public.comments for select to authenticated using (public.can_see_task(task_id));
create policy comments_insert on public.comments for insert to authenticated
  with check (author_id = (select auth.uid()) and public.can_see_task(task_id));
create policy comments_delete on public.comments for delete to authenticated
  using (author_id = (select auth.uid()) or owner_id = (select auth.uid()));

-- notifications: 본인 것만 읽고 읽음 처리
create policy notif_select on public.notifications for select to authenticated using (user_id = (select auth.uid()));
create policy notif_update on public.notifications for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy notif_delete on public.notifications for delete to authenticated using (user_id = (select auth.uid()));

-- ───────────── triggers ─────────────
-- 새 계정 → profile 생성 + 대기 중인 초대 연결
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, name)
  values (new.id, lower(new.email), split_part(new.email, '@', 1))
  on conflict (id) do nothing;
  update public.shares set grantee_id = new.id
  where grantee_email = lower(new.email) and grantee_id is null;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- 초대 시 이미 가입한 사람이면 바로 연결, 이름 기본값
create or replace function public.shares_link_grantee()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.grantee_email := lower(trim(new.grantee_email));
  if new.grantee_id is null then
    select p.id into new.grantee_id from public.profiles p where p.email = new.grantee_email;
  end if;
  if new.grantee_id = new.owner_id then
    raise exception '본인에게는 공유할 수 없습니다';
  end if;
  return new;
end $$;
create trigger shares_link before insert on public.shares
  for each row execute function public.shares_link_grantee();

-- 공유 해제·수준 변경 시 위임 연결 정리
create or replace function public.shares_cleanup()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' or new.level <> 'deleg' then
    update public.tasks set delegate_id = null, deleg_state = null,
      status = case when status = 'deleg' then 'open'::public.task_status else status end
    where owner_id = old.owner_id and delegate_id = old.grantee_id and coalesce(deleg_state::text,'') <> 'done';
  end if;
  return coalesce(new, old);
end $$;
create trigger shares_cleanup after update or delete on public.shares
  for each row execute function public.shares_cleanup();

create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;
create trigger tasks_touch before update on public.tasks for each row execute function public.touch_updated_at();

-- 업무 진행 기록 + 알림
create or replace function public.status_label(s public.task_status)
returns text language sql immutable set search_path = '' as $$
  select case s when 'open' then '미착수' when 'progress' then '진행 중' when 'done' then '완료'
    when 'fwd' then '이월' when 'deleg' then '위임' when 'cancel' then '취소' end
$$;
create or replace function public.deleg_label(s public.deleg_state)
returns text language sql immutable set search_path = '' as $$
  select case s when 'pending' then '대기' when 'accepted' then '수락' when 'working' then '진행' when 'done' then '완료' end
$$;

create or replace function public.tasks_audit()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := (select auth.uid());
  pname text;
begin
  if tg_op = 'INSERT' then
    insert into public.task_history(task_id, owner_id, actor_id, action, detail)
    values (new.id, new.owner_id, actor, 'created',
      case when new.from_date is not null then to_char(new.from_date,'MM/DD') || '에서 이월되어 등록' else '업무 등록' end);
  else
    if new.status is distinct from old.status and new.status <> 'deleg' then
      insert into public.task_history(task_id, owner_id, actor_id, action, detail)
      values (new.id, new.owner_id, actor, 'status',
        '상태 → ' || public.status_label(new.status) || case when new.status = 'fwd' and new.fwd_to is not null then ' (' || to_char(new.fwd_to,'MM/DD') || ')' else '' end);
    end if;
    if new.delegate_id is distinct from old.delegate_id and new.delegate_id is not null then
      select p.name into pname from public.profiles p where p.id = new.delegate_id;
      insert into public.task_history(task_id, owner_id, actor_id, action, detail)
      values (new.id, new.owner_id, actor, 'delegate', coalesce(pname,'') || '에게 위임');
      insert into public.notifications(user_id, actor_id, kind, task_id, body)
      values (new.delegate_id, actor, 'deleg_assigned', new.id, new.title);
    end if;
    if new.deleg_state is distinct from old.deleg_state and new.deleg_state is not null and new.delegate_id is not null then
      insert into public.task_history(task_id, owner_id, actor_id, action, detail)
      values (new.id, new.owner_id, actor, 'deleg_state', '위임 진행 → ' || public.deleg_label(new.deleg_state));
      if actor is distinct from new.owner_id then
        insert into public.notifications(user_id, actor_id, kind, task_id, body)
        values (new.owner_id, actor, 'deleg_state', new.id, public.deleg_label(new.deleg_state) || ' · ' || new.title);
      end if;
    end if;
    if new.project_id is distinct from old.project_id then
      select p.name into pname from public.projects p where p.id = new.project_id;
      insert into public.task_history(task_id, owner_id, actor_id, action, detail)
      values (new.id, new.owner_id, actor, 'project', '프로젝트 → ' || coalesce(pname, '없음'));
    end if;
    if new.due_date is distinct from old.due_date then
      insert into public.task_history(task_id, owner_id, actor_id, action, detail)
      values (new.id, new.owner_id, actor, 'due', '마감일 → ' || coalesce(to_char(new.due_date,'MM/DD'), '없음'));
    end if;
  end if;
  return new;
end $$;
create trigger tasks_audit after insert or update on public.tasks
  for each row execute function public.tasks_audit();

create or replace function public.comments_before()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  select t.owner_id into new.owner_id from public.tasks t where t.id = new.task_id;
  return new;
end $$;
create trigger comments_before before insert on public.comments
  for each row execute function public.comments_before();

create or replace function public.comments_after()
returns trigger language plpgsql security definer set search_path = '' as $$
declare t record;
begin
  select * into t from public.tasks where id = new.task_id;
  insert into public.task_history(task_id, owner_id, actor_id, action, detail)
  values (t.id, t.owner_id, new.author_id, 'comment', '코멘트 등록');
  if new.author_id <> t.owner_id then
    insert into public.notifications(user_id, actor_id, kind, task_id, body)
    values (t.owner_id, new.author_id, 'comment', t.id, left(new.body, 140));
  end if;
  if t.delegate_id is not null and t.delegate_id <> new.author_id then
    insert into public.notifications(user_id, actor_id, kind, task_id, body)
    values (t.delegate_id, new.author_id, 'comment', t.id, left(new.body, 140));
  end if;
  return new;
end $$;
create trigger comments_after after insert on public.comments
  for each row execute function public.comments_after();

-- ───────────── RPC ─────────────
-- 위임받은 동료가 진행 상태만 바꾸는 유일한 경로
create or replace function public.set_deleg_state(p_task uuid, p_state public.deleg_state)
returns void language plpgsql security definer set search_path = '' as $$
declare t record;
begin
  select * into t from public.tasks where id = p_task for update;
  if not found then raise exception 'not_found'; end if;
  if not (t.owner_id = (select auth.uid())
          or (t.delegate_id = (select auth.uid()) and public.share_level_of(t.owner_id) = 'deleg')) then
    raise exception 'not_allowed';
  end if;
  update public.tasks set deleg_state = p_state,
    status = case when p_state = 'done' then 'done'::public.task_status else 'deleg'::public.task_status end
  where id = p_task;
end $$;

-- 이월: 원래 업무는 '이월' 상태로 남기고 대상 날짜에 이어받은 업무를 만든다 (호출자 권한으로 실행, RLS 적용)
create or replace function public.forward_task(p_task uuid, p_to date)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare t public.tasks; new_id uuid; next_seq int;
begin
  select * into t from public.tasks where id = p_task and owner_id = (select auth.uid());
  if not found then raise exception 'not_found'; end if;
  if p_to = t.plan_date then raise exception 'same_date'; end if;
  select coalesce(max(seq),0)+1 into next_seq from public.tasks
    where owner_id = t.owner_id and plan_date = p_to and priority = t.priority;
  insert into public.tasks(owner_id, plan_date, priority, seq, title, status, memo, due_date, project_id, checklist, from_task_id, from_date)
  values (t.owner_id, p_to, t.priority, next_seq, t.title, 'open', t.memo, t.due_date, t.project_id, t.checklist, t.id, t.plan_date)
  returning id into new_id;
  insert into public.task_links(task_id, owner_id, title, url)
    select new_id, owner_id, title, url from public.task_links where task_id = t.id;
  insert into public.task_relations(task_id, related_id, owner_id)
    select new_id, related_id, owner_id from public.task_relations where task_id = t.id and related_id <> new_id
    on conflict do nothing;
  insert into public.task_relations(task_id, related_id, owner_id)
    select related_id, new_id, owner_id from public.task_relations where task_id = t.id and related_id <> new_id
    on conflict do nothing;
  update public.tasks set status = 'fwd', fwd_to = p_to where id = t.id;
  return new_id;
end $$;

-- 주간 요약: '주간 요약만' 권한자는 이 함수로만 숫자를 받는다
create or replace function public.weekly_summary(p_owner uuid, p_week_start date)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare r jsonb; today date := (now() at time zone 'Asia/Seoul')::date;
begin
  if not (p_owner = (select auth.uid()) or public.share_level_of(p_owner) in ('summary','comment')) then
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

-- 내가 받은 공유 목록(주인 이름 포함)
create or replace function public.my_incoming_shares()
returns table(owner_id uuid, owner_name text, owner_email text, level public.share_level)
language sql stable security definer set search_path = '' as $$
  select s.owner_id, p.name, p.email, s.level
  from public.shares s join public.profiles p on p.id = s.owner_id
  where s.grantee_id = (select auth.uid())
$$;

-- 권한: 함수는 로그인 사용자만
revoke execute on function public.share_level_of(uuid), public.can_view_owner(uuid), public.can_see_task(uuid),
  public.set_deleg_state(uuid, public.deleg_state), public.forward_task(uuid, date),
  public.weekly_summary(uuid, date), public.my_incoming_shares() from public, anon;
grant execute on function public.share_level_of(uuid), public.can_view_owner(uuid), public.can_see_task(uuid),
  public.set_deleg_state(uuid, public.deleg_state), public.forward_task(uuid, date),
  public.weekly_summary(uuid, date), public.my_incoming_shares() to authenticated;
revoke execute on function public.handle_new_user(), public.shares_link_grantee(), public.shares_cleanup(),
  public.tasks_audit(), public.comments_before(), public.comments_after() from public, anon, authenticated;

-- 익명 접근 차단
revoke all on all tables in schema public from anon;

-- 실시간 반영 대상
alter publication supabase_realtime add table public.tasks, public.comments, public.notifications;
