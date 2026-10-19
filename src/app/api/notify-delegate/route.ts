import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";

/** 위임 알림 메일. RESEND_API_KEY가 없으면 보내지 않고(사이트 안 알림은 DB 트리거가 이미 생성) 그 사실만 알려 준다. */
export async function POST(request: Request) {
  const { taskId } = (await request.json().catch(() => ({}))) as { taskId?: string };
  if (!taskId) return NextResponse.json({ sent: false, reason: "missing_task" }, { status: 400 });
  const supabase = await getServerSupabase();
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) return NextResponse.json({ sent: false, reason: "unauthorized" }, { status: 401 });

  const { data: task } = await supabase.from("tasks").select("title, delegate_id, owner_id").eq("id", taskId).eq("owner_id", user.user.id).maybeSingle();
  if (!task?.delegate_id) return NextResponse.json({ sent: false, reason: "not_found" }, { status: 404 });
  const { data: people } = await supabase.from("profiles").select("id,name,email").in("id", [task.delegate_id, task.owner_id]);
  const to = people?.find((p) => p.id === task.delegate_id);
  const from = people?.find((p) => p.id === task.owner_id);

  const key = process.env.RESEND_API_KEY;
  if (!key || !to) return NextResponse.json({ sent: false, reason: "mail_not_configured" });
  const origin = new URL(request.url).origin;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.MAIL_FROM ?? "Planner <onboarding@resend.dev>",
      to: [to.email],
      subject: `[플래너] ${from?.name ?? "동료"}님이 업무를 위임했습니다`,
      text: `${from?.name ?? "동료"}님이 다음 업무를 위임했습니다.\n\n${task.title}\n\n위임함에서 수락·진행·완료로 상태를 바꿔 주세요.\n${origin}/app`,
    }),
  });
  return NextResponse.json({ sent: res.ok });
}
