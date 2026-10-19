"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { getSupabase } from "@/lib/supabase/client";

export default function Home() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [err, setErr] = useState("");

  useEffect(() => {
    if (new URLSearchParams(location.search).get("login") === "expired") setErr("로그인 링크가 만료되었거나 이미 사용되었습니다. 새 링크를 받아 주세요.");
    getSupabase().auth.getUser().then(({ data }) => { if (data.user) location.replace("/app"); });
  }, []);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    if (!/^\S+@\S+\.\S+$/.test(email)) { setErr("이메일 주소 형식을 확인해 주세요."); return; }
    setState("sending");
    const { error } = await getSupabase().auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${location.origin}/auth/callback` },
    });
    if (error) { setState("idle"); setErr(error.message.includes("rate") ? "잠시 후 다시 시도해 주세요. 메일 발송 횟수 제한에 걸렸습니다." : `로그인 링크를 보내지 못했습니다: ${error.message}`); }
    else setState("sent");
  };

  return (
    <main className="login">
      <section>
        <h1>하루의 우선순위를 정하고, 끝까지 챙기는 플래너</h1>
        <p className="lead">프랭클린 플래너 방식 그대로 A·B·C 우선순위와 상태 기호로 업무를 관리하고, 일정과 기록을 한 화면에 모읍니다. 팀장에게는 현황을, 동료에게는 위임 업무를 공유하세요.</p>
        <div className="feat">
          <div><b>우선순위 업무</b>A1·B2 번호, ✓ → ○ ● ✕ 상태 기호, 이월</div>
          <div><b>업무 상세</b>체크리스트·자료·관련 업무·진행 기록</div>
          <div><b>공유와 위임</b>요약만 / 보기+코멘트 / 위임 협업</div>
        </div>
      </section>
      <section className="card">
        <h2>시작하기</h2>
        {state === "sent" ? (
          <p className="msg"><b>{email}</b>로 로그인 링크를 보냈습니다. 메일함에서 링크를 눌러 주세요. 메일이 안 보이면 스팸함도 확인해 주세요.</p>
        ) : (
          <form onSubmit={send} className="row" noValidate>
            <input id="login-email" className="f grow" type="email" autoComplete="email" placeholder="회사 이메일" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="이메일" />
            <button className="btn primary" disabled={state === "sending"}>{state === "sending" ? "보내는 중…" : "로그인 링크 받기"}</button>
          </form>
        )}
        {err && <p className="err" role="alert">{err}</p>}
        <p className="msg">비밀번호 없이 이메일 링크로 로그인합니다.</p>
        <hr style={{ border: 0, borderTop: "1px solid var(--rule)", width: "100%" }} />
        <p className="msg">로그인 없이 예시 데이터로 모든 기능을 써 볼 수 있습니다. 데모에서 입력한 내용은 저장되지 않습니다.</p>
        <div className="row"><Link className="btn" href="/demo" style={{ display: "inline-flex", alignItems: "center", textDecoration: "none" }}>로그인 없이 체험하기</Link></div>
      </section>
    </main>
  );
}
