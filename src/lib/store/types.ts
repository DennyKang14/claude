import type {
  Task, Project, EventItem, Role, Link, Comment, HistoryItem, Share, IncomingShare, Profile, Notification,
  WeeklySummary, OwnerData, TaskDetail, DelegState, ShareLevel,
} from "../types";

export type TaskPatch = Partial<Pick<Task,
  "title" | "priority" | "seq" | "status" | "memo" | "due_date" | "project_id" | "checklist" | "delegate_id" | "deleg_state">>;

/** 화면이 사용하는 데이터 계층. 실제 서비스(Supabase)와 데모 체험(메모리)이 같은 모양을 따른다. */
export interface Store {
  readonly mode: "live" | "demo";
  me(): Promise<Profile>;
  updateMyName(name: string): Promise<void>;

  loadOwner(ownerId: string): Promise<OwnerData>;
  taskDetail(taskId: string): Promise<TaskDetail>;
  profiles(ids: string[]): Promise<Record<string, Profile>>;

  addTask(t: Pick<Task, "plan_date" | "priority" | "seq" | "title">): Promise<void>;
  updateTask(id: string, patch: TaskPatch): Promise<void>;
  deleteTask(id: string): Promise<void>;
  forwardTask(id: string, to: string): Promise<void>;
  setDelegState(id: string, s: DelegState): Promise<void>;

  addLink(taskId: string, title: string, url: string): Promise<void>;
  deleteLink(id: string): Promise<void>;
  addRelation(a: string, b: string): Promise<void>;
  deleteRelation(a: string, b: string): Promise<void>;
  addComment(taskId: string, body: string): Promise<void>;

  addEvent(e: Pick<EventItem, "event_date" | "start_time" | "end_time" | "title" | "place">): Promise<void>;
  deleteEvent(id: string): Promise<void>;
  getNote(date: string): Promise<string>;
  saveNote(date: string, body: string): Promise<void>;

  saveMission(body: string): Promise<void>;
  addRole(r: Pick<Role, "week_start" | "name" | "goal" | "sort">): Promise<void>;
  updateRole(id: string, patch: Partial<Pick<Role, "name" | "goal" | "done">>): Promise<void>;
  deleteRole(id: string): Promise<void>;

  addProject(name: string, description: string): Promise<void>;
  updateProject(id: string, patch: Partial<Pick<Project, "name" | "description" | "archived">>): Promise<void>;

  listShares(): Promise<Share[]>;
  addShare(email: string, name: string, level: ShareLevel): Promise<void>;
  updateShare(id: string, level: ShareLevel): Promise<void>;
  deleteShare(id: string): Promise<void>;
  incomingShares(): Promise<IncomingShare[]>;
  delegatedToMe(): Promise<Task[]>;
  weeklySummary(ownerId: string, weekStart: string): Promise<WeeklySummary>;

  notifications(): Promise<Notification[]>;
  markRead(ids: string[]): Promise<void>;

  /** 변경 구독. 반환값으로 해제 */
  subscribe(onChange: () => void): () => void;
}

export type { Task, Project, EventItem, Role, Link, Comment, HistoryItem, Share, IncomingShare, Profile, Notification };
