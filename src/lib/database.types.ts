export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];
export type TaskStatus = "open" | "progress" | "done" | "fwd" | "deleg" | "cancel";
export type ShareLevel = "summary" | "comment" | "deleg";
export type DelegState = "pending" | "accepted" | "working" | "done";
