import { describe, it, expect } from "vitest";
import type { Task } from "./types";
import { sortTasks, nextSeq, cycleStatus, overdueTasks, weeklyStats, pct, forwardChain, normalizeUrl } from "./planner";
import { addDays, mondayOf, dday, dayOfYear, daysLeftInYear, weekDays } from "./dates";

const mk = (p: Partial<Task>): Task => ({
  id: Math.random().toString(36).slice(2), owner_id: "u", plan_date: "2026-10-19", priority: "B", seq: 1,
  title: "t", status: "open", memo: "", due_date: null, project_id: null, checklist: [], from_task_id: null,
  from_date: null, fwd_to: null, delegate_id: null, deleg_state: null, created_at: "2026-10-19T00:00:00Z", ...p,
});

describe("dates", () => {
  it("monday of week (Mon start)", () => {
    expect(mondayOf("2026-10-19")).toBe("2026-10-19"); // 월
    expect(mondayOf("2026-10-25")).toBe("2026-10-19"); // 일
    expect(weekDays("2026-10-22")[6]).toBe("2026-10-25");
  });
  it("adds days across month/year", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
  it("d-day labels", () => {
    expect(dday("2026-10-23", "2026-10-19")).toBe("D-4");
    expect(dday("2026-10-19", "2026-10-19")).toBe("D-day");
    expect(dday("2026-10-17", "2026-10-19")).toBe("D+2");
  });
  it("day of year", () => {
    expect(dayOfYear("2026-01-01")).toBe(1);
    expect(dayOfYear("2026-10-19")).toBe(292);
    expect(daysLeftInYear("2026-10-19")).toBe(73);
  });
});

describe("planner", () => {
  it("sorts A→C then seq", () => {
    const r = sortTasks([mk({ priority: "C", seq: 1 }), mk({ priority: "A", seq: 2 }), mk({ priority: "A", seq: 1 })]);
    expect(r.map((t) => t.priority + t.seq)).toEqual(["A1", "A2", "C1"]);
  });
  it("next seq per date and priority", () => {
    const ts = [mk({ priority: "A", seq: 1 }), mk({ priority: "A", seq: 3 }), mk({ priority: "B", seq: 5 }), mk({ plan_date: "2026-10-20", priority: "A", seq: 9 })];
    expect(nextSeq(ts, "2026-10-19", "A")).toBe(4);
    expect(nextSeq(ts, "2026-10-19", "C")).toBe(1);
  });
  it("status cycle", () => {
    expect(cycleStatus("open")).toBe("progress");
    expect(cycleStatus("progress")).toBe("done");
    expect(cycleStatus("done")).toBe("open");
    expect(cycleStatus("fwd")).toBeNull();
  });
  it("overdue = earlier date and open/progress", () => {
    const ts = [mk({ plan_date: "2026-10-16", status: "open" }), mk({ plan_date: "2026-10-16", status: "done" }),
      mk({ plan_date: "2026-10-17", status: "progress" }), mk({ plan_date: "2026-10-19", status: "open" }), mk({ plan_date: "2026-10-15", status: "fwd" })];
    expect(overdueTasks(ts, "2026-10-19")).toHaveLength(2);
  });
  it("weekly stats exclude forwarded and cancelled", () => {
    const ts = [mk({ status: "done", priority: "A" }), mk({ status: "open", priority: "A" }), mk({ status: "fwd" }),
      mk({ status: "cancel" }), mk({ status: "deleg" }), mk({ plan_date: "2026-10-26", status: "done" })];
    const s = weeklyStats(ts, "2026-10-21", "2026-10-21");
    expect(s.effective).toBe(3);
    expect(s.done).toBe(1);
    expect(s.a_effective).toBe(2);
    expect(s.a_done).toBe(1);
    expect(s.delegated).toBe(1);
    expect(s.by_day).toHaveLength(7);
    expect(s.by_day[0].fwd).toBe(1);
    expect(pct(s.done, s.effective)).toBe("33%");
    expect(pct(0, 0)).toBe("–");
  });
  it("forward chain links both directions", () => {
    const a = mk({ id: "a", plan_date: "2026-10-16", status: "fwd" });
    const b = mk({ id: "b", plan_date: "2026-10-17", status: "fwd", from_task_id: "a" });
    const c = mk({ id: "c", plan_date: "2026-10-19", from_task_id: "b" });
    expect(forwardChain([a, b, c], b).map((t) => t.id)).toEqual(["a", "c"]);
    expect(forwardChain([a, b, c], c).map((t) => t.id)).toEqual(["a", "b"]);
  });
  it("normalizes urls", () => {
    expect(normalizeUrl("drive.google.com/x")).toBe("https://drive.google.com/x");
    expect(normalizeUrl("http://a.b")).toBe("http://a.b");
    expect(normalizeUrl("  ")).toBe("");
  });
});
