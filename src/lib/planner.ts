import type { Task, TaskStatus, Priority, WeeklySummary, DelegState } from "./types";
import { weekDays } from "./dates";

export const STATUS: Record<TaskStatus, { sym: string; label: string }> = {
  open: { sym: "", label: "미착수" },
  progress: { sym: "●", label: "진행 중" },
  done: { sym: "✓", label: "완료" },
  fwd: { sym: "→", label: "이월" },
  deleg: { sym: "○", label: "위임" },
  cancel: { sym: "✕", label: "취소" },
};
export const DELEG_LABEL: Record<DelegState, string> = { pending: "대기", accepted: "수락", working: "진행", done: "완료" };
export const LEVEL_LABEL = { summary: "주간 요약만", comment: "보기 + 코멘트", deleg: "위임 협업" } as const;

/** 우선순위(A→C) 다음 번호 순 */
export const sortTasks = (ts: Task[]) =>
  [...ts].sort((a, b) => a.priority.localeCompare(b.priority) || a.seq - b.seq || a.created_at.localeCompare(b.created_at));

export const tasksOn = (ts: Task[], date: string) => sortTasks(ts.filter((t) => t.plan_date === date));

export const nextSeq = (ts: Task[], date: string, pri: Priority) =>
  Math.max(0, ...ts.filter((t) => t.plan_date === date && t.priority === pri).map((t) => t.seq)) + 1;

/** 상태 기호 클릭: 미착수 → 진행 → 완료 → 미착수. 이월·위임·취소는 상세에서 변경 */
export const cycleStatus = (s: TaskStatus): TaskStatus | null =>
  s === "open" ? "progress" : s === "progress" ? "done" : s === "done" ? "open" : null;

/** 지난 날짜에 미착수·진행 중으로 남은 업무 */
export const overdueTasks = (ts: Task[], base: string) =>
  ts.filter((t) => t.plan_date < base && (t.status === "open" || t.status === "progress"))
    .sort((a, b) => a.plan_date.localeCompare(b.plan_date) || a.priority.localeCompare(b.priority) || a.seq - b.seq);

/** 완료율 계산에서는 이월(다른 날로 옮겨짐)·취소를 뺀다 */
const effective = (t: Task) => t.status !== "fwd" && t.status !== "cancel";

export const weeklyStats = (ts: Task[], anyDateInWeek: string, base: string): WeeklySummary => {
  const days = weekDays(anyDateInWeek);
  const inWeek = ts.filter((t) => t.plan_date >= days[0] && t.plan_date <= days[6]);
  const eff = inWeek.filter(effective);
  const count = (list: Task[], s: TaskStatus) => list.filter((t) => t.status === s).length;
  return {
    effective: eff.length,
    done: count(eff, "done"),
    a_effective: eff.filter((t) => t.priority === "A").length,
    a_done: eff.filter((t) => t.priority === "A" && t.status === "done").length,
    overdue: overdueTasks(ts, base).length,
    delegated: ts.filter((t) => t.status === "deleg").length,
    by_day: days.map((date) => {
      const d = inWeek.filter((t) => t.plan_date === date);
      return { date, open: count(d, "open"), progress: count(d, "progress"), done: count(d, "done"),
        fwd: count(d, "fwd"), deleg: count(d, "deleg"), cancel: count(d, "cancel") };
    }),
  };
};

export const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "–");

/** 이월로 이어진 업무 사슬(앞뒤) */
export const forwardChain = (ts: Task[], t: Task) => {
  const byId = new Map(ts.map((x) => [x.id, x]));
  const chain: Task[] = [];
  let p = t.from_task_id ? byId.get(t.from_task_id) : undefined;
  while (p) { chain.unshift(p); p = p.from_task_id ? byId.get(p.from_task_id) : undefined; }
  let n = ts.find((x) => x.from_task_id === t.id);
  while (n) { chain.push(n); const cur: Task = n; n = ts.find((x) => x.from_task_id === cur.id); }
  return chain;
};

export const normalizeUrl = (u: string) => {
  const s = u.trim();
  if (!s) return "";
  return /^https?:\/\//i.test(s) ? s : `https://${s}`;
};
