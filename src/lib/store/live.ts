"use client";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabase } from "../supabase/client";
import type { Store, TaskPatch } from "./types";
import type { Task, Profile, WeeklySummary, ShareLevel, DelegState, CheckItem } from "../types";

type Row = Record<string, unknown>;
const check = <T,>(r: { data: T; error: { message: string } | null }): T => {
  if (r.error) throw new Error(r.error.message);
  return r.data;
};
const toTask = (r: Row): Task => ({ ...(r as unknown as Task), checklist: (r.checklist as CheckItem[]) ?? [] });

export class LiveStore implements Store {
  readonly mode = "live" as const;
  private sb: SupabaseClient = getSupabase();
  private uid: string | null = null;

  private async userId() {
    if (this.uid) return this.uid;
    const { data } = await this.sb.auth.getUser();
    if (!data.user) throw new Error("로그인이 필요합니다");
    this.uid = data.user.id;
    return this.uid;
  }

  async me(): Promise<Profile> {
    const id = await this.userId();
    return check(await this.sb.from("profiles").select("id,name,email").eq("id", id).single()) as Profile;
  }
  async updateMyName(name: string) {
    check(await this.sb.from("profiles").update({ name }).eq("id", await this.userId()));
  }

  async loadOwner(ownerId: string) {
    const [tasks, projects, events, roles, mission] = await Promise.all([
      this.sb.from("tasks").select("*").eq("owner_id", ownerId).order("plan_date"),
      this.sb.from("projects").select("*").eq("owner_id", ownerId).order("created_at"),
      this.sb.from("events").select("*").eq("owner_id", ownerId).order("start_time"),
      this.sb.from("weekly_roles").select("*").eq("owner_id", ownerId).order("sort"),
      this.sb.from("compass_mission").select("body").eq("owner_id", ownerId).maybeSingle(),
    ]);
    return {
      tasks: (check(tasks) as Row[]).map(toTask),
      projects: check(projects) as never,
      events: check(events) as never,
      roles: check(roles) as never,
      mission: (check(mission) as { body: string } | null)?.body ?? "",
    };
  }

  async taskDetail(taskId: string) {
    const [links, rels, hist, comments] = await Promise.all([
      this.sb.from("task_links").select("*").eq("task_id", taskId).order("created_at"),
      this.sb.from("task_relations").select("related_id").eq("task_id", taskId),
      this.sb.from("task_history").select("*").eq("task_id", taskId).order("created_at", { ascending: false }),
      this.sb.from("comments").select("*").eq("task_id", taskId).order("created_at"),
    ]);
    return {
      links: check(links) as never,
      relations: (check(rels) as { related_id: string }[]).map((r) => r.related_id),
      history: check(hist) as never,
      comments: check(comments) as never,
    };
  }

  async profiles(ids: string[]) {
    const uniq = [...new Set(ids.filter(Boolean))];
    if (!uniq.length) return {};
    const rows = check(await this.sb.from("profiles").select("id,name,email").in("id", uniq)) as Profile[];
    return Object.fromEntries(rows.map((p) => [p.id, p]));
  }

  async addTask(t: Pick<Task, "plan_date" | "priority" | "seq" | "title">) {
    check(await this.sb.from("tasks").insert(t));
  }
  async updateTask(id: string, patch: TaskPatch) {
    check(await this.sb.from("tasks").update(patch).eq("id", id));
  }
  async deleteTask(id: string) {
    check(await this.sb.from("tasks").delete().eq("id", id));
  }
  async forwardTask(id: string, to: string) {
    check(await this.sb.rpc("forward_task", { p_task: id, p_to: to }));
  }
  async setDelegState(id: string, s: DelegState) {
    check(await this.sb.rpc("set_deleg_state", { p_task: id, p_state: s }));
  }

  async addLink(taskId: string, title: string, url: string) {
    check(await this.sb.from("task_links").insert({ task_id: taskId, title, url }));
  }
  async deleteLink(id: string) {
    check(await this.sb.from("task_links").delete().eq("id", id));
  }
  async addRelation(a: string, b: string) {
    check(await this.sb.from("task_relations").upsert([{ task_id: a, related_id: b }, { task_id: b, related_id: a }]));
  }
  async deleteRelation(a: string, b: string) {
    check(await this.sb.from("task_relations").delete().or(`and(task_id.eq.${a},related_id.eq.${b}),and(task_id.eq.${b},related_id.eq.${a})`));
  }
  async addComment(taskId: string, body: string) {
    check(await this.sb.from("comments").insert({ task_id: taskId, body }));
  }

  async addEvent(e: { event_date: string; start_time: string; end_time: string | null; title: string; place: string }) {
    check(await this.sb.from("events").insert(e));
  }
  async deleteEvent(id: string) {
    check(await this.sb.from("events").delete().eq("id", id));
  }
  async getNote(date: string) {
    const r = check(await this.sb.from("daily_notes").select("body").eq("owner_id", await this.userId()).eq("note_date", date).maybeSingle()) as { body: string } | null;
    return r?.body ?? "";
  }
  async saveNote(date: string, body: string) {
    check(await this.sb.from("daily_notes").upsert({ note_date: date, body, updated_at: new Date().toISOString() }));
  }

  async saveMission(body: string) {
    check(await this.sb.from("compass_mission").upsert({ body, updated_at: new Date().toISOString() }));
  }
  async addRole(r: { week_start: string; name: string; goal: string; sort: number }) {
    check(await this.sb.from("weekly_roles").insert(r));
  }
  async updateRole(id: string, patch: { name?: string; goal?: string; done?: boolean }) {
    check(await this.sb.from("weekly_roles").update(patch).eq("id", id));
  }
  async deleteRole(id: string) {
    check(await this.sb.from("weekly_roles").delete().eq("id", id));
  }

  async addProject(name: string, description: string) {
    check(await this.sb.from("projects").insert({ name, description }));
  }
  async updateProject(id: string, patch: { name?: string; description?: string; archived?: boolean }) {
    check(await this.sb.from("projects").update(patch).eq("id", id));
  }

  async listShares() {
    return check(await this.sb.from("shares").select("*").eq("owner_id", await this.userId()).order("created_at")) as never;
  }
  async addShare(email: string, name: string, level: ShareLevel) {
    check(await this.sb.from("shares").insert({ grantee_email: email.trim().toLowerCase(), grantee_name: name, level }));
  }
  async updateShare(id: string, level: ShareLevel) {
    check(await this.sb.from("shares").update({ level }).eq("id", id));
  }
  async deleteShare(id: string) {
    check(await this.sb.from("shares").delete().eq("id", id));
  }
  async incomingShares() {
    return check(await this.sb.rpc("my_incoming_shares")) as never;
  }
  async delegatedToMe() {
    const rows = check(await this.sb.from("tasks").select("*").eq("delegate_id", await this.userId()).order("plan_date", { ascending: false })) as Row[];
    return rows.map(toTask);
  }
  async weeklySummary(ownerId: string, weekStart: string) {
    return check(await this.sb.rpc("weekly_summary", { p_owner: ownerId, p_week_start: weekStart })) as WeeklySummary;
  }

  async notifications() {
    return check(await this.sb.from("notifications").select("*").order("created_at", { ascending: false }).limit(50)) as never;
  }
  async markRead(ids: string[]) {
    if (!ids.length) return;
    check(await this.sb.from("notifications").update({ read_at: new Date().toISOString() }).in("id", ids));
  }

  subscribe(onChange: () => void) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const fire = () => { clearTimeout(timer); timer = setTimeout(onChange, 250); };
    const ch = this.sb.channel("planner-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, fire)
      .on("postgres_changes", { event: "*", schema: "public", table: "comments" }, fire)
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications" }, fire)
      .subscribe();
    return () => { clearTimeout(timer); this.sb.removeChannel(ch); };
  }
}
