-- 권한(RLS) 검증: 가상 사용자 5명을 만들어 검사하고, 끝에 테스트 계정(@t.test)을 삭제해 모든 테스트 데이터를 지운다.
-- 실행: Supabase SQL 편집기 또는 MCP execute_sql 로 전체 실행. 결과의 ok 열이 모두 true여야 한다.
create temp table _r(check_name text, expected text, actual text);
grant all on _r to authenticated;

insert into auth.users (id, email, aud, role) values
 ('00000000-0000-0000-0000-0000000000a1','owner@t.test','authenticated','authenticated'),
 ('00000000-0000-0000-0000-0000000000c1','lead@t.test','authenticated','authenticated'),
 ('00000000-0000-0000-0000-0000000000b1','head@t.test','authenticated','authenticated'),
 ('00000000-0000-0000-0000-0000000000d1','mate@t.test','authenticated','authenticated'),
 ('00000000-0000-0000-0000-0000000000e1','other@t.test','authenticated','authenticated');

set local role authenticated;

-- ── owner가 데이터 생성 ──
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}',true);
insert into public.shares(grantee_email, level) values ('lead@t.test','comment'),('HEAD@t.test','summary'),('mate@t.test','deleg');
insert into public.projects(id,name) values ('00000000-0000-0000-0000-00000000aa01','2차PG 계약');
insert into public.tasks(id,plan_date,priority,seq,title,project_id) values
 ('00000000-0000-0000-0000-00000000f001', current_date,'A',1,'비밀 업무 제목','00000000-0000-0000-0000-00000000aa01'),
 ('00000000-0000-0000-0000-00000000f002', current_date,'B',1,'위임할 업무',null);
update public.tasks set status='deleg', delegate_id='00000000-0000-0000-0000-0000000000d1', deleg_state='pending'
 where id='00000000-0000-0000-0000-00000000f002';
insert into public.daily_notes(note_date, body) values (current_date,'개인 메모');
insert into public.events(event_date,start_time,title) values (current_date,'09:30','주간회의');
insert into public.task_links(task_id,title,url) values ('00000000-0000-0000-0000-00000000f001','특약서','https://example.com/a');
insert into _r select 'owner sees own tasks','2',count(*)::text from public.tasks;
insert into _r select 'invite linked to existing user (case-insensitive)','3',count(*)::text from public.shares where grantee_id is not null;
select public.forward_task('00000000-0000-0000-0000-00000000f001', current_date+1);
insert into _r select 'forward creates copy with link','1',count(*)::text from public.task_links l join public.tasks t on t.id=l.task_id where t.plan_date=current_date+1;
insert into _r select 'original marked fwd','fwd',status::text from public.tasks where id='00000000-0000-0000-0000-00000000f001';

-- ── 보기+코멘트(팀장) ──
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}',true);
insert into _r select 'comment: sees tasks','3',count(*)::text from public.tasks;
insert into _r select 'comment: sees events','1',count(*)::text from public.events;
insert into _r select 'comment: NO daily notes','0',count(*)::text from public.daily_notes;
insert into _r select 'comment: sees links','2',count(*)::text from public.task_links;
insert into public.comments(task_id, body) values ('00000000-0000-0000-0000-00000000f002','확인했어요');
insert into _r select 'comment: can comment','1',count(*)::text from public.comments;
update public.tasks set title='변조' where id='00000000-0000-0000-0000-00000000f002';
insert into _r select 'comment: cannot edit task','위임할 업무',title from public.tasks where id='00000000-0000-0000-0000-00000000f002';

-- ── 주간 요약만(본부장) ──
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}',true);
insert into _r select 'summary: NO tasks','0',count(*)::text from public.tasks;
insert into _r select 'summary: NO events','0',count(*)::text from public.events;
insert into _r select 'summary: NO links','0',count(*)::text from public.task_links;
insert into _r select 'summary: NO comments','0',count(*)::text from public.comments;
insert into _r select 'summary: weekly numbers only','true',
  (public.weekly_summary('00000000-0000-0000-0000-0000000000a1', current_date - ((extract(isodow from current_date)::int)-1)) ? 'effective')::text;
insert into _r select 'summary: no titles in summary','false',
  (public.weekly_summary('00000000-0000-0000-0000-0000000000a1', current_date - ((extract(isodow from current_date)::int)-1))::text like '%비밀%')::text;

-- ── 위임 협업(동료) ──
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}',true);
insert into _r select 'deleg: sees only delegated task','1',count(*)::text from public.tasks;
insert into _r select 'deleg: NO events','0',count(*)::text from public.events;
insert into _r select 'deleg: NO notes','0',count(*)::text from public.daily_notes;
insert into _r select 'deleg: notified','1',count(*)::text from public.notifications where kind='deleg_assigned';
select public.set_deleg_state('00000000-0000-0000-0000-00000000f002','done');
insert into _r select 'deleg: completed via rpc','done',status::text from public.tasks where id='00000000-0000-0000-0000-00000000f002';
update public.tasks set title='변조' where id='00000000-0000-0000-0000-00000000f002';
insert into _r select 'deleg: cannot edit title','위임할 업무',title from public.tasks where id='00000000-0000-0000-0000-00000000f002';

-- ── 외부인 ──
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-0000000000e1","role":"authenticated"}',true);
insert into _r select 'outsider: NO tasks','0',count(*)::text from public.tasks;
insert into _r select 'outsider: NO projects','0',count(*)::text from public.projects;
insert into _r select 'outsider: NO profiles of others','1',count(*)::text from public.profiles;

-- ── owner가 결과 확인 ──
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}',true);
insert into _r select 'owner: notified of deleg done','1',count(*)::text from public.notifications where kind='deleg_state';
insert into _r select 'owner: notified of comment','1',count(*)::text from public.notifications where kind='comment';
insert into _r select 'owner: history recorded','true',(count(*)>=4)::text from public.task_history;
delete from public.shares where grantee_email='lead@t.test';
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}',true);
insert into _r select 'revoked: lead sees nothing','0',count(*)::text from public.tasks;

reset role;
delete from auth.users where email like '%@t.test';
select check_name, expected, actual, expected = actual as ok from _r;
