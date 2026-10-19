import type { TaskStatus, ShareLevel, DelegState } from "./database.types";
export type { TaskStatus, ShareLevel, DelegState };

export type Priority = "A" | "B" | "C";
export type CheckItem = { text: string; done: boolean };

export type Task = {
  id: string;
  owner_id: string;
  plan_date: string; // YYYY-MM-DD
  priority: Priority;
  seq: number;
  title: string;
  status: TaskStatus;
  memo: string;
  due_date: string | null;
  project_id: string | null;
  checklist: CheckItem[];
  from_task_id: string | null;
  from_date: string | null;
  fwd_to: string | null;
  delegate_id: string | null;
  deleg_state: DelegState | null;
  created_at: string;
};

export type Project = { id: string; owner_id: string; name: string; description: string; archived: boolean };
export type EventItem = {
  id: string; owner_id: string; event_date: string; start_time: string; end_time: string | null;
  title: string; place: string; source: string;
};
export type Role = { id: string; owner_id: string; week_start: string; name: string; goal: string; done: boolean; sort: number };
export type Link = { id: string; task_id: string; title: string; url: string };
export type Comment = { id: string; task_id: string; author_id: string; body: string; created_at: string };
export type HistoryItem = { id: number | string; task_id: string; actor_id: string | null; action: string; detail: string; created_at: string };
export type Share = { id: string; owner_id: string; grantee_email: string; grantee_name: string; grantee_id: string | null; level: ShareLevel };
export type IncomingShare = { owner_id: string; owner_name: string; owner_email: string; level: ShareLevel };
export type Profile = { id: string; name: string; email: string };
export type Notification = { id: string; user_id: string; actor_id: string | null; kind: string; task_id: string | null; body: string; read_at: string | null; created_at: string };

export type WeeklySummary = {
  effective: number; done: number; a_effective: number; a_done: number;
  overdue: number; delegated: number;
  by_day: { date: string; open: number; progress: number; done: number; fwd: number; deleg: number; cancel: number }[];
};

export type OwnerData = { tasks: Task[]; projects: Project[]; events: EventItem[]; roles: Role[]; mission: string };
export type TaskDetail = { links: Link[]; relations: string[]; history: HistoryItem[]; comments: Comment[] };
