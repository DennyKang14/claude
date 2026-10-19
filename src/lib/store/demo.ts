"use client";
import type { Store, TaskPatch } from "./types";
import type {
  Task, Project, EventItem, Role, Link, Comment, HistoryItem, Share, Profile, Notification, ShareLevel, DelegState,
} from "../types";
import { addDays, mondayOf, today, md } from "../dates";
import { weeklyStats, nextSeq, STATUS, DELEG_LABEL } from "../planner";

/** 로그인 없이 체험하는 데모. 메모리에만 저장되고 새로고침하면 처음 상태로 돌아간다. */
const ME = "demo-me";
let n = 0;
const id = (p: string) => `${p}-${(++n).toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
const now = () => new Date().toISOString();

export class DemoStore implements Store {
  readonly mode = "demo" as const;
  private people: Record<string, Profile> = {
    [ME]: { id: ME, name: "데니(데모)", email: "denny@demo.local" },
    "p-lead": { id: "p-lead", name: "김팀장", email: "lead@demo.local" },
    "p-head": { id: "p-head", name: "정본부장", email: "head@demo.local" },
    "p-lee": { id: "p-lee", name: "이주임", email: "lee@demo.local" },
    "p-park": { id: "p-park", name: "박선임", email: "park@demo.local" },
  };
  private tasks: Task[] = [];
  private projects: Project[] = [];
  private events: EventItem[] = [];
  private roles: Role[] = [];
  private mission = "";
  private notes: Record<string, string> = {};
  private links: Link[] = [];
  private rels: [string, string][] = [];
  private history: HistoryItem[] = [];
  private comments: Comment[] = [];
  private shares: Share[] = [];
  private notifs: Notification[] = [];
  private listeners = new Set<() => void>();
  /** 데모에서 위임함을 동료 입장에서 보기 위한 가상 로그인 사용자 */
  actingAs = ME;

  constructor() { this.seed(); }

  private emit() { this.listeners.forEach((f) => f()); }
  private log(task: Task, action: string, detail: string, actor = this.actingAs) {
    this.history.push({ id: id("h"), task_id: task.id, actor_id: actor, action, detail, created_at: now() });
  }
  private notify(user: string, kind: string, task: Task, body: string) {
    if (user === this.actingAs) return;
    this.notifs.push({ id: id("n"), user_id: user, actor_id: this.actingAs, kind, task_id: task.id, body, read_at: null, created_at: now() });
  }

  private seed() {
    const T = today(), Y = addDays(T, -1), P = addDays(T, -3), M = mondayOf(T);
    this.projects = [
      { id: "pj1", owner_id: ME, name: "2차PG 계약", description: "특약서상 정산자금관리체계 평가 대응", archived: false },
      { id: "pj2", owner_id: ME, name: "PG 정산 분리 시스템", description: "은행 연계 정산 분리 구축", archived: false },
      { id: "pj3", owner_id: ME, name: "AI 회의록 PRD", description: "주간업무 회의 자동 회의록", archived: false },
      { id: "pj4", owner_id: ME, name: "AML 교육", description: "전 임직원 법정 의무교육", archived: false },
    ];
    const tk = (plan_date: string, priority: "A" | "B" | "C", seq: number, title: string, status: Task["status"], extra: Partial<Task> = {}) => {
      const t: Task = { id: id("t"), owner_id: ME, plan_date, priority, seq, title, status, memo: "", due_date: null, project_id: null,
        checklist: [], from_task_id: null, from_date: null, fwd_to: null, delegate_id: null, deleg_state: null, created_at: now(), ...extra };
      this.tasks.push(t);
      this.log(t, "created", "업무 등록", ME);
      return t;
    };
    const p1 = tk(P, "A", 1, "정산 계좌 분리 운영 기준 초안", "done", { project_id: "pj2" });
    const a1 = tk(T, "A", 1, "2차PG 특약서 정산자금관리체계 평가 자료 정리", "progress", {
      project_id: "pj1", due_date: addDays(T, 4),
      memo: "평가 항목 12개 중 증빙 매핑 8개 완료. 정산자금 보관 계좌 확인서는 재무팀 회신 대기.",
      checklist: [{ text: "평가 항목 목록 확정", done: true }, { text: "항목별 증빙 매핑", done: true }, { text: "재무팀 계좌 확인서 수령", done: false }, { text: "1차본 팀장 검토", done: false }],
    });
    this.log(a1, "status", "상태 → 진행 중", ME);
    this.links.push({ id: id("l"), task_id: a1.id, title: "2차PG 특약서 최종본", url: "https://example.com/contract-2nd-pg" },
      { id: id("l"), task_id: a1.id, title: "평가 항목 체크시트", url: "https://example.com/eval-sheet" });
    this.comments.push({ id: id("c"), task_id: a1.id, author_id: "p-lead", body: "금요일 오전까지 1차본 공유 부탁해요.", created_at: now() });
    const a2 = tk(T, "A", 2, "주간회의 AI 회의록 PRD 초안 검토", "open", { project_id: "pj3", due_date: addDays(T, 2) });
    this.links.push({ id: id("l"), task_id: a2.id, title: "PRD 초안 v0.3", url: "https://example.com/prd-minutes" });
    tk(T, "B", 1, "자금세탁방지 교육 공지문 발송", "done", { project_id: "pj4" });
    const b2 = tk(T, "B", 2, "PG 정산 분리 시스템 요구사항 회의자료 취합", "deleg", { project_id: "pj2", delegate_id: "p-lee", deleg_state: "accepted",
      checklist: [{ text: "은행 요구사항 정리", done: true }, { text: "내부 시스템 영향도", done: false }] });
    this.log(b2, "delegate", "이주임에게 위임", ME);
    this.rels.push([b2.id, p1.id], [p1.id, b2.id]);
    tk(T, "C", 1, "전자금융업 등록 서류 체크리스트 업데이트", "open");
    const yf = tk(Y, "B", 2, "외부 감사 대응 일정 조율", "fwd", { fwd_to: T });
    tk(T, "B", 3, "외부 감사 대응 일정 조율", "open", { from_task_id: yf.id, from_date: Y });
    tk(Y, "A", 1, "결제대금예치업 약관 개정안 검토", "done");
    tk(Y, "B", 1, "선불업 이용자 자금 보호 현황 점검", "open", { project_id: "pj2" });
    tk(P, "B", 1, "협력사 계약서 개인정보 조항 확인", "deleg", { project_id: "pj1", delegate_id: "p-park", deleg_state: "pending" });
    tk(P, "C", 1, "업무 매뉴얼 목차 정리", "cancel");

    const ev = (start: string, end: string, title: string, place: string) =>
      this.events.push({ id: id("e"), owner_id: ME, event_date: T, start_time: start, end_time: end, title, place, source: "manual" });
    ev("09:30", "10:30", "전자금융 사업팀 주간업무 회의", "본사 3층 회의실");
    ev("14:00", "15:00", "2차PG사 실무 협의", "온라인");
    ev("16:30", "17:00", "AML 교육 일정 확인", "준법감시팀");
    this.mission = "정확한 규제 해석으로 회사가 안심하고 새로운 결제 서비스를 내놓게 돕는다.";
    this.roles = [
      { id: id("r"), owner_id: ME, week_start: M, name: "규제 대응 담당", goal: "2차PG 평가 자료 1차본 제출", done: false, sort: 0 },
      { id: id("r"), owner_id: ME, week_start: M, name: "상품 기획", goal: "AI 회의록 PRD 리뷰 완료", done: false, sort: 1 },
      { id: id("r"), owner_id: ME, week_start: M, name: "팀원", goal: "위임 업무 회수 2건", done: true, sort: 2 },
    ];
    this.notes[T] = "09:30 주간회의 — 2차PG 평가 일정 금요일로 확정\n14:00 PG사 협의 — 정산 주기 D+2 유지 요청";
    const sh = (pid: string, level: ShareLevel) => this.shares.push({ id: id("s"), owner_id: ME, grantee_email: this.people[pid].email, grantee_name: this.people[pid].name, grantee_id: pid, level });
    sh("p-lead", "comment"); sh("p-head", "summary"); sh("p-lee", "deleg"); sh("p-park", "deleg");
    this.notifs.push({ id: id("n"), user_id: ME, actor_id: "p-lead", kind: "comment", task_id: a1.id, body: "금요일 오전까지 1차본 공유 부탁해요.", read_at: null, created_at: now() });
    this.notifs.push({ id: id("n"), user_id: ME, actor_id: "p-lee", kind: "deleg_state", task_id: b2.id, body: "수락 · PG 정산 분리 시스템 요구사항 회의자료 취합", read_at: null, created_at: now() });
  }

  // 데모 사용자 목록(위임함 미리보기용)
  delegatePeople() { return this.shares.filter((s) => s.level === "deleg" && s.grantee_id).map((s) => this.people[s.grantee_id!]); }

  async me() { return this.people[this.actingAs]; }
  async updateMyName(name: string) { this.people[ME].name = name; this.emit(); }

  async loadOwner(ownerId: string) {
    return {
      tasks: this.tasks.filter((t) => t.owner_id === ownerId).map((t) => ({ ...t, checklist: t.checklist.map((c) => ({ ...c })) })),
      projects: this.projects.filter((p) => p.owner_id === ownerId),
      events: this.events.filter((e) => e.owner_id === ownerId),
      roles: this.roles.filter((r) => r.owner_id === ownerId),
      mission: ownerId === ME ? this.mission : "",
    };
  }
  async taskDetail(taskId: string) {
    return {
      links: this.links.filter((l) => l.task_id === taskId),
      relations: this.rels.filter(([a]) => a === taskId).map(([, b]) => b),
      history: this.history.filter((h) => h.task_id === taskId).slice().reverse(),
      comments: this.comments.filter((c) => c.task_id === taskId),
    };
  }
  async profiles(ids: string[]) { return Object.fromEntries(ids.filter((i) => this.people[i]).map((i) => [i, this.people[i]])); }

  private t(idv: string) { const t = this.tasks.find((x) => x.id === idv); if (!t) throw new Error("업무를 찾을 수 없습니다"); return t; }

  async addTask(v: Pick<Task, "plan_date" | "priority" | "seq" | "title">) {
    const t: Task = { id: id("t"), owner_id: ME, status: "open", memo: "", due_date: null, project_id: null, checklist: [], from_task_id: null,
      from_date: null, fwd_to: null, delegate_id: null, deleg_state: null, created_at: now(), ...v };
    this.tasks.push(t); this.log(t, "created", "업무 등록"); this.emit();
  }
  async updateTask(idv: string, patch: TaskPatch) {
    const t = this.t(idv);
    if (patch.status && patch.status !== t.status && patch.status !== "deleg") this.log(t, "status", `상태 → ${STATUS[patch.status].label}`);
    if (patch.delegate_id && patch.delegate_id !== t.delegate_id) {
      this.log(t, "delegate", `${this.people[patch.delegate_id]?.name ?? ""}에게 위임`);
      this.notify(patch.delegate_id, "deleg_assigned", t, t.title);
    }
    if ("project_id" in patch && patch.project_id !== t.project_id)
      this.log(t, "project", `프로젝트 → ${this.projects.find((p) => p.id === patch.project_id)?.name ?? "없음"}`);
    if ("due_date" in patch && patch.due_date !== t.due_date) this.log(t, "due", `마감일 → ${patch.due_date ? md(patch.due_date) : "없음"}`);
    Object.assign(t, patch); this.emit();
  }
  async deleteTask(idv: string) {
    this.tasks = this.tasks.filter((t) => t.id !== idv);
    this.rels = this.rels.filter(([a, b]) => a !== idv && b !== idv); this.emit();
  }
  async forwardTask(idv: string, to: string) {
    const t = this.t(idv);
    const c: Task = { ...t, id: id("t"), plan_date: to, seq: nextSeq(this.tasks, to, t.priority), status: "open", from_task_id: t.id,
      from_date: t.plan_date, fwd_to: null, delegate_id: null, deleg_state: null, created_at: now(), checklist: t.checklist.map((x) => ({ ...x })) };
    this.tasks.push(c);
    this.links.filter((l) => l.task_id === t.id).forEach((l) => this.links.push({ ...l, id: id("l"), task_id: c.id }));
    this.rels.filter(([a]) => a === t.id).forEach(([, b]) => this.rels.push([c.id, b], [b, c.id]));
    this.log(c, "created", `${md(t.plan_date)}에서 이월되어 등록`);
    t.status = "fwd"; t.fwd_to = to; this.log(t, "status", `상태 → 이월 (${md(to)})`);
    this.emit();
  }
  async setDelegState(idv: string, s: DelegState) {
    const t = this.t(idv);
    t.deleg_state = s; t.status = s === "done" ? "done" : "deleg";
    this.log(t, "deleg_state", `위임 진행 → ${DELEG_LABEL[s]}`);
    this.notify(t.owner_id, "deleg_state", t, `${DELEG_LABEL[s]} · ${t.title}`);
    this.emit();
  }
  async addLink(taskId: string, title: string, url: string) { this.links.push({ id: id("l"), task_id: taskId, title, url }); this.emit(); }
  async deleteLink(idv: string) { this.links = this.links.filter((l) => l.id !== idv); this.emit(); }
  async addRelation(a: string, b: string) { this.rels.push([a, b], [b, a]); this.emit(); }
  async deleteRelation(a: string, b: string) { this.rels = this.rels.filter(([x, y]) => !((x === a && y === b) || (x === b && y === a))); this.emit(); }
  async addComment(taskId: string, body: string) {
    const t = this.t(taskId);
    this.comments.push({ id: id("c"), task_id: taskId, author_id: this.actingAs, body, created_at: now() });
    this.log(t, "comment", "코멘트 등록");
    this.notify(t.owner_id, "comment", t, body.slice(0, 140));
    if (t.delegate_id) this.notify(t.delegate_id, "comment", t, body.slice(0, 140));
    this.emit();
  }
  async addEvent(e: Pick<EventItem, "event_date" | "start_time" | "end_time" | "title" | "place">) {
    this.events.push({ id: id("e"), owner_id: ME, source: "manual", ...e }); this.emit();
  }
  async deleteEvent(idv: string) { this.events = this.events.filter((e) => e.id !== idv); this.emit(); }
  async getNote(date: string) { return this.notes[date] ?? ""; }
  async saveNote(date: string, body: string) { this.notes[date] = body; }
  async saveMission(body: string) { this.mission = body; }
  async addRole(r: Pick<Role, "week_start" | "name" | "goal" | "sort">) { this.roles.push({ id: id("r"), owner_id: ME, done: false, ...r }); this.emit(); }
  async updateRole(idv: string, patch: Partial<Pick<Role, "name" | "goal" | "done">>) { Object.assign(this.roles.find((r) => r.id === idv)!, patch); this.emit(); }
  async deleteRole(idv: string) { this.roles = this.roles.filter((r) => r.id !== idv); this.emit(); }
  async addProject(name: string, description: string) { this.projects.push({ id: id("pj"), owner_id: ME, name, description, archived: false }); this.emit(); }
  async updateProject(idv: string, patch: Partial<Pick<Project, "name" | "description" | "archived">>) { Object.assign(this.projects.find((p) => p.id === idv)!, patch); this.emit(); }

  async listShares() { return this.shares.map((s) => ({ ...s })); }
  async addShare(email: string, name: string, level: ShareLevel) {
    const pid = id("p");
    this.people[pid] = { id: pid, name: name || email.split("@")[0], email };
    this.shares.push({ id: id("s"), owner_id: ME, grantee_email: email.toLowerCase(), grantee_name: name, grantee_id: pid, level }); this.emit();
  }
  async updateShare(idv: string, level: ShareLevel) { this.shares.find((s) => s.id === idv)!.level = level; this.emit(); }
  async deleteShare(idv: string) {
    const s = this.shares.find((x) => x.id === idv);
    this.shares = this.shares.filter((x) => x.id !== idv);
    if (s?.grantee_id) this.tasks.forEach((t) => { if (t.delegate_id === s.grantee_id && t.deleg_state !== "done") { t.delegate_id = null; t.deleg_state = null; if (t.status === "deleg") t.status = "open"; } });
    this.emit();
  }
  async incomingShares() { return []; }
  async delegatedToMe() { return this.tasks.filter((t) => t.delegate_id === this.actingAs).map((t) => ({ ...t })); }
  async weeklySummary(ownerId: string, weekStart: string) { return weeklyStats(this.tasks.filter((t) => t.owner_id === ownerId), weekStart, today()); }
  async notifications() { return this.notifs.filter((x) => x.user_id === this.actingAs).slice().reverse(); }
  async markRead(ids: string[]) { this.notifs.forEach((x) => { if (ids.includes(x.id)) x.read_at = now(); }); this.emit(); }
  subscribe(onChange: () => void) { this.listeners.add(onChange); return () => { this.listeners.delete(onChange); }; }
}
