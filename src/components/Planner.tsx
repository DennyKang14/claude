"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Store } from "@/lib/store/types";
import { DemoStore } from "@/lib/store/demo";
import { LiveStore } from "@/lib/store/live";
import type { Task, Profile, OwnerData, IncomingShare, Share, Notification, Priority, ShareLevel, WeeklySummary } from "@/lib/types";
import { STATUS, DELEG_LABEL, LEVEL_LABEL, tasksOn, nextSeq, cycleStatus, overdueTasks, weeklyStats, pct } from "@/lib/planner";
import { today, addDays, md, weekday, mondayOf, weekDays, parse, dayOfYear, daysLeftInYear, dday, hhmm } from "@/lib/dates";
import Link from "next/link";
import TaskDrawer from "./TaskDrawer";
import { getSupabase } from "@/lib/supabase/client";

type View = "day" | "week" | "proj" | "compass" | "share" | "inbox";
const VIEWS: { k: View; l: string; own?: boolean }[] = [
  { k: "day", l: "오늘" }, { k: "week", l: "주간 현황" }, { k: "proj", l: "프로젝트" }, { k: "compass", l: "주간 컴퍼스" },
  { k: "share", l: "공유 설정", own: true }, { k: "inbox", l: "위임함", own: true },
];
const EMPTY: OwnerData = { tasks: [], projects: [], events: [], roles: [], mission: "" };

export default function Planner({ mode }: { mode: "live" | "demo" }) {
  const store: Store = useMemo(() => (mode === "demo" ? new DemoStore() : new LiveStore()), [mode]);
  const [me, setMe] = useState<Profile | null>(null);
  const [incoming, setIncoming] = useState<IncomingShare[]>([]);
  const [ownerId, setOwnerId] = useState("");
  const [data, setData] = useState<OwnerData>(EMPTY);
  const [summary, setSummary] = useState<WeeklySummary | null>(null);
  const [shares, setShares] = useState<Share[]>([]);
  const [people, setPeople] = useState<Record<string, Profile>>({});
  const [notifs, setNotifs] = useState<Notification[]>([]);
  const [view, setView] = useState<View>("day");
  const [cur, setCur] = useState(today());
  const [openId, setOpenId] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [toast, setToast] = useState("");
  const [loadErr, setLoadErr] = useState("");
  const [showN, setShowN] = useState(false);
  const toastT = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const isOwn = !!me && ownerId === me.id;
  const level: "own" | ShareLevel = isOwn ? "own" : incoming.find((s) => s.owner_id === ownerId)?.level ?? "summary";
  const editable = level === "own";
  const canComment = level === "own" || level === "comment";

  const say = (m: string) => { setToast(m); clearTimeout(toastT.current); toastT.current = setTimeout(() => setToast(""), 2600); };

  const reload = useCallback(async () => {
    if (!me || !ownerId) return;
    try {
      const own = ownerId === me.id;
      const lv = own ? "own" : incoming.find((s) => s.owner_id === ownerId)?.level;
      const [d, sh, ns] = await Promise.all([
        lv === "summary" ? Promise.resolve(EMPTY) : store.loadOwner(ownerId),
        own ? store.listShares() : Promise.resolve([] as Share[]),
        store.notifications(),
      ]);
      setData(d); setShares(sh); setNotifs(ns);
      if (lv === "summary") setSummary(await store.weeklySummary(ownerId, mondayOf(cur)));
      const ids = [...d.tasks.map((t) => t.delegate_id ?? ""), ...sh.map((s) => s.grantee_id ?? ""), ...ns.map((n) => n.actor_id ?? ""), ownerId, me.id];
      setPeople(await store.profiles(ids));
      setVersion((v) => v + 1);
      setLoadErr("");
    } catch (e) {
      setLoadErr(e instanceof Error ? e.message : "불러오지 못했습니다");
    }
  }, [store, me, ownerId, incoming, cur]);

  useEffect(() => {
    (async () => {
      try {
        const m = await store.me();
        setMe(m); setOwnerId(m.id);
        setIncoming(await store.incomingShares());
      } catch {
        if (mode === "live") location.replace("/");
      }
    })();
  }, [store, mode]);
  useEffect(() => { reload(); }, [reload]);
  useEffect(() => store.subscribe(() => reload()), [store, reload]);

  /** 저장 작업 공통 처리: 실패하면 원래 상태로 다시 불러오고 이유를 안내 */
  const run = useCallback(async (fn: () => Promise<unknown>, ok?: string) => {
    try { await fn(); if (ok) say(ok); await reload(); return true; }
    catch (e) { say(`저장하지 못했습니다. ${e instanceof Error ? e.message : ""}`.trim()); await reload(); return false; }
  }, [reload]);

  const switchOwner = (id: string) => {
    setOwnerId(id); setOpenId(null);
    const lv = me && id === me.id ? "own" : incoming.find((s) => s.owner_id === id)?.level;
    setView(lv === "summary" ? "week" : "day");
  };
  const gotoTask = (id: string) => {
    const t = data.tasks.find((x) => x.id === id);
    if (t) { setCur(t.plan_date); setView("day"); setOpenId(id); }
  };
  const unread = notifs.filter((n) => !n.read_at);
  const openTask = openId ? data.tasks.find((t) => t.id === openId) : undefined;
  const delegateOptions = shares.filter((s) => s.level === "deleg" && s.grantee_id).map((s) => people[s.grantee_id!] ?? { id: s.grantee_id!, name: s.grantee_name || s.grantee_email, email: s.grantee_email });
  const ownerName = isOwn ? "내 플래너" : `${incoming.find((s) => s.owner_id === ownerId)?.owner_name ?? ""}의 플래너`;

  if (!me) return <div className="wrap"><p className="saved">불러오는 중…</p></div>;
  const tabs = VIEWS.filter((v) => (level === "summary" ? v.k === "week" : !v.own || isOwn));

  return (
    <div className="wrap">
      <header className="top">
        <div className="brand"><b>프랭클린 업무 플래너</b><span>{ownerName}</span></div>
        <div className="topright">
          {incoming.length > 0 && (
            <select id="owner-sel" className="f owner-sel" value={ownerId} onChange={(e) => switchOwner(e.target.value)} aria-label="플래너 선택">
              <option value={me.id}>내 플래너</option>
              {incoming.map((s) => <option key={s.owner_id} value={s.owner_id}>{s.owner_name} · {LEVEL_LABEL[s.level]}</option>)}
            </select>
          )}
          <button className="bell" aria-label={`알림 ${unread.length}건`} onClick={() => { setShowN(!showN); if (!showN && unread.length) store.markRead(unread.map((n) => n.id)).then(reload); }}>
            <span aria-hidden>◔</span>{unread.length > 0 && <span className="dot">{unread.length}</span>}
          </button>
          {mode === "live"
            ? <button className="btn ghost" onClick={async () => { await getSupabase().auth.signOut(); location.replace("/"); }}>로그아웃</button>
            : <Link className="btn ghost" href="/" style={{ display: "inline-flex", alignItems: "center", textDecoration: "none" }}>처음으로</Link>}
        </div>
      </header>
      <nav className="tabs" role="tablist">
        {tabs.map((v) => <button key={v.k} role="tab" aria-selected={view === v.k} onClick={() => { setView(v.k); setOpenId(null); }}>{v.l}</button>)}
      </nav>

      {mode === "demo" && <div className="mock"><span><span className="badge">DEMO</span><b>로그인 없이 체험 중</b> · 예시 데이터로 모든 기능이 동작하며 새로고침하면 처음 상태로 돌아갑니다.</span><span>상태 기호를 누르거나 업무의 ⋯을 눌러 상세를 열어 보세요.</span></div>}
      {!isOwn && level === "comment" && <div className="readonly-note">{ownerName}을 보고 있습니다. 읽기 전용이며 업무 상세에서 코멘트를 남길 수 있습니다. 일일 기록은 공유되지 않습니다.</div>}
      {loadErr && <div className="banner" role="alert"><span>데이터를 불러오지 못했습니다. {loadErr}</span><button onClick={reload}>다시 시도</button></div>}

      {(view === "day" || view === "week" || view === "compass") && level !== "summary" && <DateBar cur={cur} setCur={setCur} step={view === "day" ? 1 : 7} />}
      {level === "summary" && <DateBar cur={cur} setCur={setCur} step={7} />}

      {view === "day" && level !== "summary" && (
        <DayView store={store} data={data} cur={cur} editable={editable} people={people} run={run} onOpen={setOpenId} isOwn={isOwn} />
      )}
      {view === "week" && (level === "summary"
        ? <SummaryOnly s={summary} cur={cur} />
        : <WeekView data={data} cur={cur} people={people} editable={editable} run={run} store={store} onGo={(d) => { setCur(d); setView("day"); }} onOpen={gotoTask} />)}
      {view === "proj" && <ProjectsView store={store} data={data} editable={editable} run={run} onOpen={gotoTask} />}
      {view === "compass" && <CompassView store={store} data={data} cur={cur} editable={editable} run={run} />}
      {view === "share" && isOwn && <ShareView store={store} shares={shares} data={data} people={people} run={run} cur={cur} />}
      {view === "inbox" && isOwn && <InboxView store={store} me={me} run={run} version={version} />}

      {showN && (
        <div className="npanel" role="dialog" aria-label="알림">
          <div className="sh" style={{ padding: "4px 8px 8px" }}><h2 style={{ fontSize: 22 }}>알림</h2><button className="more" aria-label="닫기" onClick={() => setShowN(false)}>×</button></div>
          {notifs.length ? notifs.map((n) => (
            <button key={n.id} className={`nitem${n.read_at ? "" : " unread"}`} onClick={() => { setShowN(false); if (n.task_id) { if (n.kind === "deleg_assigned") setView("inbox"); else gotoTask(n.task_id); } }}>
              {n.kind === "comment" ? `${people[n.actor_id ?? ""]?.name ?? "누군가"}님의 코멘트: ` : n.kind === "deleg_assigned" ? `${people[n.actor_id ?? ""]?.name ?? "누군가"}님이 업무를 위임했습니다: ` : `${people[n.actor_id ?? ""]?.name ?? "동료"}님 위임 진행: `}{n.body}
              <small>{new Date(n.created_at).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</small>
            </button>
          )) : <p className="saved" style={{ padding: 8 }}>새 알림이 없습니다.</p>}
        </div>
      )}

      {openTask && (
        <TaskDrawer store={store} task={openTask} data={data} editable={editable} canComment={canComment} people={people}
          delegateOptions={delegateOptions} version={version} run={run} onClose={() => setOpenId(null)} onGoto={gotoTask} />
      )}
      {toast && <div className="toast" role="status">{toast}</div>}
      <div className="foot"><span>{mode === "live" ? "변경 내용은 자동 저장되고 공유받은 사람에게 실시간으로 반영됩니다." : "데모 데이터는 이 브라우저 탭에만 있습니다."}</span></div>
    </div>
  );
}

type RunFn = (fn: () => Promise<unknown>, ok?: string) => Promise<boolean>;

function DateBar({ cur, setCur, step }: { cur: string; setCur: (s: string) => void; step: number }) {
  const d = parse(cur);
  return (
    <div className="datebar">
      <div className="dateblock">
        <div className="daynum num">{d.getDate()}</div>
        <div className="dmeta">
          <span className="ym">{d.getFullYear()}년 {d.getMonth() + 1}월</span>
          <span className="wd">{weekday(cur)}요일{cur === today() ? " · 오늘" : ""}</span>
          <span className="doy">{dayOfYear(cur)}일째 · 올해 {daysLeftInYear(cur)}일 남음</span>
        </div>
      </div>
      <div className="nav">
        <button onClick={() => setCur(addDays(cur, -step))}>‹ 이전</button>
        <button onClick={() => setCur(today())}>오늘</button>
        <button onClick={() => setCur(addDays(cur, step))}>다음 ›</button>
        <input id="jump" type="date" value={cur} onChange={(e) => e.target.value && setCur(e.target.value)} aria-label="날짜로 이동" />
      </div>
    </div>
  );
}

function TaskRow({ t, editable, run, store, onOpen, projName, people }: { t: Task; editable: boolean; run: RunFn; store: Store; onOpen: (id: string) => void; projName: (id: string | null) => string; people: Record<string, Profile> }) {
  const st = STATUS[t.status];
  const cycle = () => {
    const n = cycleStatus(t.status);
    if (!editable || !n) { onOpen(t.id); return; }
    run(() => store.updateTask(t.id, { status: n }));
  };
  return (
    <li className={`task st-${t.status}`}>
      <div className="trow">
        <button className={`sym${editable ? "" : " sym-ro"}`} onClick={cycle} aria-label={`상태: ${st.label}`} title={st.label}>{st.sym}</button>
        <span className={`code pri-${t.priority}`}>{t.priority}{t.seq}</span>
        <span className="ttl">
          {t.title}
          {t.from_date && <span className="chip">← {md(t.from_date)}에서 이월</span>}
          {t.status === "fwd" && t.fwd_to && <span className="chip">→ {md(t.fwd_to)}</span>}
          {t.delegate_id && <span className="chip dl">{people[t.delegate_id]?.name ?? "동료"} · {t.deleg_state ? DELEG_LABEL[t.deleg_state] : "대기"}</span>}
          {t.project_id && <span className="chip pj">{projName(t.project_id)}</span>}
          {t.due_date && !["done", "cancel", "fwd"].includes(t.status) && <span className="chip due">마감 {md(t.due_date)} {dday(t.due_date)}</span>}
          {t.checklist.length > 0 && <span className="chip">체크 {t.checklist.filter((c) => c.done).length}/{t.checklist.length}</span>}
          {t.memo && <div style={{ fontSize: 12.5, color: "var(--muted)" }}>{t.memo.length > 80 ? t.memo.slice(0, 80) + "…" : t.memo}</div>}
        </span>
        <button className="more" onClick={() => onOpen(t.id)} aria-label="상세 열기">⋯</button>
      </div>
    </li>
  );
}

function DayView({ store, data, cur, editable, people, run, onOpen, isOwn }: { store: Store; data: OwnerData; cur: string; editable: boolean; people: Record<string, Profile>; run: RunFn; onOpen: (id: string) => void; isOwn: boolean }) {
  const ts = tasksOn(data.tasks, cur);
  const [pri, setPri] = useState<Priority>("B");
  const [title, setTitle] = useState("");
  const [ev, setEv] = useState({ start: "09:00", end: "10:00", title: "", place: "" });
  const projName = (id: string | null) => data.projects.find((p) => p.id === id)?.name ?? "";
  const od = overdueTasks(data.tasks, today());
  const evs = data.events.filter((e) => e.event_date === cur).sort((a, b) => a.start_time.localeCompare(b.start_time));
  const nowH = cur === today() ? new Date().getHours() : -1;
  const cnt = (k: Task["status"]) => ts.filter((t) => t.status === k).length;
  const base = ts.filter((t) => t.status !== "fwd" && t.status !== "cancel").length;
  const hourOf = (t: string) => Number(t.slice(0, 2));
  const evRow = (e: (typeof evs)[number]) => (
    <div key={e.id} className="ev">
      <span className="tm">{hhmm(e.start_time)}{e.end_time ? `–${hhmm(e.end_time)}` : ""}</span>
      <span className="tx">{e.title}{e.place && <div className="pl">{e.place}</div>}</span>
      {editable && <button aria-label="일정 삭제" onClick={() => run(() => store.deleteEvent(e.id))}>×</button>}
    </div>
  );
  const hours = Array.from({ length: 15 }, (_, i) => i + 7);
  const early = evs.filter((e) => hourOf(e.start_time) < 7), late = evs.filter((e) => hourOf(e.start_time) > 21);

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {editable && cur === today() && od.length > 0 && (
        <div className="banner"><span>지난 날짜에 처리되지 않은 업무가 <b>{od.length}건</b> 있습니다.</span>
          <button onClick={() => run(async () => { for (const t of od) await store.forwardTask(t.id, today()); }, `${od.length}건을 오늘로 이월했습니다`)}>모두 오늘로 이월</button></div>
      )}
      <div className="spread">
        <div className="sheet">
          <div className="sh"><h2>우선순위 업무</h2><span className="sub">{ts.length ? `완료 ${cnt("done")} / ${base} · 진행 ${cnt("progress")} · 이월 ${cnt("fwd")}` : ""}</span></div>
          <div className="legend"><span><b>✓</b>완료</span><span><b>●</b>진행 중</span><span><b>→</b>이월</span><span><b>○</b>위임</span><span><b>✕</b>취소</span>{editable && <span>기호를 누르면 미착수→진행→완료</span>}</div>
          <ul className="list">
            {ts.length ? ts.map((t) => <TaskRow key={t.id} t={t} editable={editable} run={run} store={store} onOpen={onOpen} projName={projName} people={people} />)
              : <li className="empty">이 날의 업무가 없습니다.{editable && " 아래에서 A·B·C 우선순위를 골라 첫 업무를 추가하세요."}</li>}
          </ul>
          {editable && (
            <form className="addrow" autoComplete="off" onSubmit={(e) => {
              e.preventDefault(); if (!title.trim()) return;
              run(() => store.addTask({ plan_date: cur, priority: pri, seq: nextSeq(data.tasks, cur, pri), title: title.trim() })); setTitle("");
            }}>
              <select id="newPri" className="f" value={pri} onChange={(e) => setPri(e.target.value as Priority)} aria-label="우선순위">
                <option value="A">A 반드시</option><option value="B">B 해야 할</option><option value="C">C 하면 좋은</option>
              </select>
              <input id="newTitle" className="f grow" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="업무 추가 후 Enter" aria-label="업무 내용" />
              <button className="btn primary">추가</button>
            </form>
          )}
        </div>
        <div className="sheet">
          <div className="sh"><h2>일정</h2><span className="sub">{evs.length ? `${evs.length}건` : ""}</span></div>
          <div className="hours">
            {early.length > 0 && <div className="hr"><span className="t">이른</span><div className="evs">{early.map(evRow)}</div></div>}
            {hours.map((h) => (
              <div key={h} className={`hr${h === nowH ? " now" : ""}`}><span className="t">{String(h).padStart(2, "0")}:00</span><div className="evs">{evs.filter((e) => hourOf(e.start_time) === h).map(evRow)}</div></div>
            ))}
            {late.length > 0 && <div className="hr"><span className="t">늦은</span><div className="evs">{late.map(evRow)}</div></div>}
          </div>
          {editable && (
            <form className="evform" autoComplete="off" onSubmit={(e) => {
              e.preventDefault(); if (!ev.title.trim()) return;
              run(() => store.addEvent({ event_date: cur, start_time: ev.start || "09:00", end_time: ev.end || null, title: ev.title.trim(), place: ev.place.trim() }));
              setEv({ ...ev, title: "", place: "" });
            }}>
              <input id="evStart" className="f" type="time" value={ev.start} onChange={(e) => setEv({ ...ev, start: e.target.value })} aria-label="시작" />
              <input id="evEnd" className="f" type="time" value={ev.end} onChange={(e) => setEv({ ...ev, end: e.target.value })} aria-label="종료" />
              <input id="evTitle" className="f full" value={ev.title} onChange={(e) => setEv({ ...ev, title: e.target.value })} placeholder="일정 제목" aria-label="일정 제목" />
              <input id="evPlace" className="f" value={ev.place} onChange={(e) => setEv({ ...ev, place: e.target.value })} placeholder="장소·참석자" aria-label="장소" />
              <button className="btn primary">일정 추가</button>
            </form>
          )}
        </div>
      </div>
      {isOwn && <NoteSheet store={store} cur={cur} />}
    </section>
  );
}

function NoteSheet({ store, cur }: { store: Store; cur: string }) {
  const [text, setText] = useState("");
  const [state, setState] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const key = `fp-note-draft:${cur}`;
  useEffect(() => {
    let alive = true;
    store.getNote(cur).then((b) => {
      if (!alive) return;
      let draft: string | null = null;
      try { draft = localStorage.getItem(key); } catch { /* 저장소 사용 불가 */ }
      setText(draft ?? b); setState(draft ? "저장되지 않은 입력을 복구했습니다" : "");
    }).catch(() => setState("기록을 불러오지 못했습니다"));
    return () => { alive = false; };
  }, [store, cur, key]);
  const save = (v: string) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setState("저장 중…");
      try { await store.saveNote(cur, v); try { localStorage.removeItem(key); } catch { /* */ } setState(store.mode === "demo" ? "데모: 이 탭에만 보관" : "저장됨"); }
      catch { setState("저장하지 못했습니다. 연결되면 다시 저장합니다."); }
    }, 800);
  };
  return (
    <div className="sheet notes">
      <div className="sh"><h2>일일 기록</h2><span className="saved">{state || "본인만 볼 수 있습니다"}</span></div>
      <textarea id="note" value={text} placeholder="회의 메모, 통화 내용, 결정 사항, 아이디어를 기록하세요." aria-label="일일 기록"
        onChange={(e) => { setText(e.target.value); setState("입력 중…"); try { localStorage.setItem(key, e.target.value); } catch { /* */ } save(e.target.value); }} />
    </div>
  );
}

function Tiles({ s }: { s: WeeklySummary }) {
  return (
    <div className="tiles">
      <div className="tile"><span className="k">주간 완료율</span><span className="v num">{pct(s.done, s.effective)}</span><span className="s">{s.done} / {s.effective}건 (이월·취소 제외)</span></div>
      <div className="tile"><span className="k">A 업무 완료율</span><span className="v num" style={{ color: "var(--pa)" }}>{pct(s.a_done, s.a_effective)}</span><span className="s">{s.a_done} / {s.a_effective}건</span></div>
      <div className="tile"><span className="k">미결 업무</span><span className="v num">{s.overdue}</span><span className="s">지난 날짜 · 미처리</span></div>
      <div className="tile"><span className="k">위임 진행</span><span className="v num" style={{ color: "var(--deleg)" }}>{s.delegated}</span><span className="s">회수 대기</span></div>
    </div>
  );
}

const SEG: [keyof WeeklySummary["by_day"][number], string, string][] = [
  ["done", "var(--done)", "완료"], ["progress", "var(--prog)", "진행 중"], ["deleg", "var(--deleg)", "위임"], ["fwd", "var(--fwd)", "이월"], ["cancel", "var(--cancel)", "취소"],
];
function Bars({ s, onGo }: { s: WeeklySummary; onGo?: (d: string) => void }) {
  const total = (d: WeeklySummary["by_day"][number]) => d.open + d.progress + d.done + d.fwd + d.deleg + d.cancel;
  const max = Math.max(1, ...s.by_day.map(total));
  return (
    <>
      <div className="keys">{SEG.map(([, c, l]) => <span key={l}><i style={{ background: c }} />{l}</span>)}<span><i style={{ background: "var(--rule)", outline: "1px solid var(--muted)" }} />미착수</span></div>
      <div className="wk">
        {s.by_day.map((d) => {
          const eff = d.open + d.progress + d.done + d.deleg;
          return (
            <div key={d.date} className={`wkrow${d.date === today() ? " today" : ""}`}>
              <button className="d" onClick={() => onGo?.(d.date)} disabled={!onGo}>{weekday(d.date)}요일<small>{md(d.date)}</small></button>
              <div className="bar">
                {SEG.map(([k, c, l]) => (d[k] as number) > 0 && <i key={l} title={`${l} ${d[k]}`} style={{ width: `${((d[k] as number) / max) * 100}%`, background: c }} />)}
                {d.open > 0 && <i title={`미착수 ${d.open}`} style={{ width: `${(d.open / max) * 100}%`, background: "transparent", boxShadow: "inset 0 0 0 1px var(--muted)" }} />}
              </div>
              <span className="c">{total(d) ? `${d.done}/${eff} 완료` : "업무 없음"}</span>
            </div>
          );
        })}
      </div>
    </>
  );
}

function SummaryOnly({ s, cur }: { s: WeeklySummary | null; cur: string }) {
  const days = weekDays(cur);
  if (!s) return <p className="saved">불러오는 중…</p>;
  const full = { ...s, by_day: days.map((date) => s.by_day.find((b) => b.date === date) ?? { date, open: 0, progress: 0, done: 0, fwd: 0, deleg: 0, cancel: 0 }) };
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div className="readonly-note">주간 요약만 공유받은 화면입니다. 개별 업무 내용과 일정은 보이지 않습니다.</div>
      <Tiles s={full} />
      <div className="sheet"><div className="sh"><h2>요일별 업무 현황</h2><span className="sub">{md(days[0])} – {md(days[6])}</span></div><Bars s={full} /></div>
    </section>
  );
}

function WeekView({ data, cur, people, editable, run, store, onGo, onOpen }: { data: OwnerData; cur: string; people: Record<string, Profile>; editable: boolean; run: RunFn; store: Store; onGo: (d: string) => void; onOpen: (id: string) => void }) {
  const s = weeklyStats(data.tasks, cur, today());
  const days = weekDays(cur);
  const od = overdueTasks(data.tasks, today());
  const dl = data.tasks.filter((t) => t.status === "deleg").sort((a, b) => a.plan_date.localeCompare(b.plan_date));
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <Tiles s={s} />
      <div className="sheet"><div className="sh"><h2>요일별 업무 현황</h2><span className="sub">{md(days[0])} – {md(days[6])}</span></div><Bars s={s} onGo={onGo} /></div>
      <div className="two">
        <div className="sheet">
          <div className="sh"><h2>미결 업무</h2><span className="sub">지난 날짜에 처리되지 않은 업무</span></div>
          {od.length ? od.map((t) => (
            <div key={t.id} className="li">
              <span className={`code pri-${t.priority}`}>{t.priority}{t.seq}</span>
              <button className="linkbtn ttl" onClick={() => onOpen(t.id)}>{t.title}</button>
              <span className="when">{md(t.plan_date)}</span>
              {editable && <button className="btn" onClick={() => run(() => store.forwardTask(t.id, today()), "오늘로 이월했습니다")}>오늘로</button>}
            </div>
          )) : <div className="empty">밀린 업무가 없습니다.</div>}
        </div>
        <div className="sheet">
          <div className="sh"><h2>위임 추적</h2><span className="sub">맡긴 업무의 회수 확인</span></div>
          {dl.length ? dl.map((t) => (
            <div key={t.id} className="li">
              <span className="code pri-B">○</span>
              <button className="linkbtn ttl" onClick={() => onOpen(t.id)}>{t.title}</button>
              <span className="chip dl">{people[t.delegate_id ?? ""]?.name ?? "동료"} · {t.deleg_state ? DELEG_LABEL[t.deleg_state] : "대기"}</span>
              <span className="when">{md(t.plan_date)}</span>
            </div>
          )) : <div className="empty">위임 중인 업무가 없습니다. 업무 상세에서 ‘위임’을 누르면 여기서 추적됩니다.</div>}
        </div>
      </div>
    </section>
  );
}

function ProjectsView({ store, data, editable, run, onOpen }: { store: Store; data: OwnerData; editable: boolean; run: RunFn; onOpen: (id: string) => void }) {
  const [sel, setSel] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const list = data.projects.filter((p) => !p.archived);
  const p = list.find((x) => x.id === sel) ?? list[0];
  const ts = p ? data.tasks.filter((t) => t.project_id === p.id).sort((a, b) => b.plan_date.localeCompare(a.plan_date) || a.priority.localeCompare(b.priority) || a.seq - b.seq) : [];
  const dates = [...new Set(ts.map((t) => t.plan_date))];
  return (
    <section className="pjwrap">
      <div className="sheet">
        <div className="sh"><h2>프로젝트</h2><span className="sub">관련 업무를 묶어 보는 단위</span></div>
        <div className="pjlist">
          {list.length ? list.map((x) => {
            const xs = data.tasks.filter((t) => t.project_id === x.id && t.status !== "fwd" && t.status !== "cancel");
            const d = xs.filter((t) => t.status === "done").length;
            return (
              <button key={x.id} className={`pj${p?.id === x.id ? " on" : ""}`} onClick={() => setSel(x.id)}>
                <b>{x.name}</b><span>{d}/{xs.length} 완료</span>
                <span className="bar" style={{ height: 6 }}><i style={{ width: `${xs.length ? (d / xs.length) * 100 : 0}%`, background: "var(--done)" }} /></span>
              </button>
            );
          }) : <div className="empty">프로젝트가 없습니다.{editable && " 아래에서 첫 프로젝트를 만들고, 업무 상세에서 프로젝트를 지정하세요."}</div>}
        </div>
        {editable && (
          <form className="addrow" autoComplete="off" onSubmit={(e) => { e.preventDefault(); if (!name.trim()) return; run(() => store.addProject(name.trim(), desc.trim()), "프로젝트를 만들었습니다"); setName(""); setDesc(""); }}>
            <input id="pjName" className="f grow" value={name} onChange={(e) => setName(e.target.value)} placeholder="프로젝트 이름" aria-label="프로젝트 이름" />
            <input id="pjDesc" className="f grow" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="한 줄 설명" aria-label="설명" />
            <button className="btn primary">추가</button>
          </form>
        )}
      </div>
      <div className="sheet">
        {p ? (
          <>
            <div className="sh"><h2>{p.name}</h2><span className="sub">{p.description}</span></div>
            {dates.length ? dates.map((d) => (
              <div key={d} className="pjday">
                <div className="mono saved">{d} ({weekday(d)})</div>
                {ts.filter((t) => t.plan_date === d).map((t) => (
                  <div key={t.id} className={`li st-${t.status}`}>
                    <span className="sym" style={{ width: 22, height: 22, fontSize: 12 }}>{STATUS[t.status].sym}</span>
                    <span className={`code pri-${t.priority}`}>{t.priority}{t.seq}</span>
                    <button className="linkbtn ttl" onClick={() => onOpen(t.id)}>{t.title}</button>
                  </div>
                ))}
              </div>
            )) : <div className="empty">이 프로젝트에 연결된 업무가 없습니다. 업무 상세에서 프로젝트를 지정하세요.</div>}
            {editable && <div><button className="btn ghost" onClick={() => run(() => store.updateProject(p.id, { archived: true }), "프로젝트를 보관했습니다")}>프로젝트 보관</button></div>}
          </>
        ) : <p className="saved">프로젝트를 선택하세요.</p>}
      </div>
    </section>
  );
}

function CompassView({ store, data, cur, editable, run }: { store: Store; data: OwnerData; cur: string; editable: boolean; run: RunFn }) {
  const M = mondayOf(cur);
  const roles = data.roles.filter((r) => r.week_start === M).sort((a, b) => a.sort - b.sort);
  const [mission, setMission] = useState(data.mission);
  const [st, setSt] = useState("");
  const [nm, setNm] = useState("");
  const [goal, setGoal] = useState("");
  useEffect(() => setMission(data.mission), [data.mission]);
  const prev = data.roles.filter((r) => r.week_start === addDays(M, -7));
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div className="sheet mission">
        <div className="sh"><h2>사명 · 지배가치</h2><span className="saved">{st}</span></div>
        {editable ? (
          <textarea id="mission" className="f" value={mission} placeholder="나의 업무 사명과 지키고 싶은 가치를 적어 두세요." onChange={(e) => { setMission(e.target.value); setSt("입력 중…"); }}
            onBlur={async () => { if (mission !== data.mission) { setSt("저장 중…"); try { await store.saveMission(mission); setSt("저장됨"); } catch { setSt("저장하지 못했습니다"); } } else setSt(""); }} />
        ) : <p className="mission" style={{ fontFamily: "var(--f-display)", fontSize: 22, margin: 0, color: "var(--ink)" }}>{data.mission || "작성된 사명이 없습니다."}</p>}
      </div>
      <div className="sheet">
        <div className="sh"><h2>이번 주 역할과 목표</h2><span className="sub">{md(M)} – {md(addDays(M, 6))} 주</span></div>
        {roles.length ? roles.map((r) => (
          <div key={r.id} className={`role${r.done ? " done" : ""}`}>
            <input id={`rc-${r.id}`} type="checkbox" checked={r.done} disabled={!editable} onChange={() => run(() => store.updateRole(r.id, { done: !r.done }))} aria-label="목표 달성" />
            <input id={`rn-${r.id}`} className="f" defaultValue={r.name} readOnly={!editable} onBlur={(e) => e.target.value !== r.name && run(() => store.updateRole(r.id, { name: e.target.value }))} aria-label="역할" />
            <input id={`rg-${r.id}`} className="f goal" defaultValue={r.goal} readOnly={!editable} onBlur={(e) => e.target.value !== r.goal && run(() => store.updateRole(r.id, { goal: e.target.value }))} aria-label="목표" />
            {editable ? <button className="more" aria-label="역할 삭제" onClick={() => run(() => store.deleteRole(r.id))}>×</button> : <span />}
          </div>
        )) : <div className="empty">이번 주에 맡은 역할(예: 규제 대응, 상품 기획, 팀원)과 역할별 핵심 목표를 하나씩 적어 보세요.</div>}
        {editable && (
          <form className="addrow" autoComplete="off" onSubmit={(e) => { e.preventDefault(); if (!nm.trim() && !goal.trim()) return; run(() => store.addRole({ week_start: M, name: nm.trim(), goal: goal.trim(), sort: roles.length })); setNm(""); setGoal(""); }}>
            <input id="roleName" className="f" value={nm} onChange={(e) => setNm(e.target.value)} placeholder="역할 (예: 규제 대응 담당)" aria-label="역할" />
            <input id="roleGoal" className="f grow" value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="이번 주 핵심 목표" aria-label="목표" />
            <button className="btn primary">추가</button>
            {prev.length > 0 && <button type="button" className="btn ghost" onClick={() => run(async () => {
              const names = new Set(roles.map((r) => r.name));
              let i = roles.length;
              for (const r of prev) if (!names.has(r.name)) await store.addRole({ week_start: M, name: r.name, goal: "", sort: i++ });
            }, "지난주 역할을 가져왔습니다")}>지난주 역할 가져오기</button>}
          </form>
        )}
      </div>
    </section>
  );
}

function ShareView({ store, shares, data, people, run, cur }: { store: Store; shares: Share[]; data: OwnerData; people: Record<string, Profile>; run: RunFn; cur: string }) {
  const [nm, setNm] = useState("");
  const [mail, setMail] = useState("");
  const [lv, setLv] = useState<ShareLevel>("comment");
  const [err, setErr] = useState("");
  const [myName, setMyName] = useState("");
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div className="lv">
        <div className="tile"><b>주간 요약만</b><span className="s">예: 본부장</span><ul><li>주간 완료율, A업무 완료율</li><li>미결·위임 건수</li><li>개별 업무 내용과 일정은 보이지 않음</li></ul></div>
        <div className="tile"><b>보기 + 코멘트</b><span className="s">예: 팀장</span><ul><li>날짜별 업무·일정·프로젝트 열람</li><li>업무에 코멘트</li><li>일일 기록은 보이지 않음</li></ul></div>
        <div className="tile"><b>위임 협업</b><span className="s">예: 함께 일하는 동료</span><ul><li>자신에게 위임된 업무만 보임</li><li>수락·진행·완료 처리, 코멘트</li><li>다른 업무와 일정은 보이지 않음</li></ul></div>
      </div>
      <div className="sheet">
        <div className="sh"><h2>공유받는 사람</h2><span className="sub">사람마다 공유 수준을 따로 지정</span></div>
        {shares.length ? shares.map((s) => {
          const p = s.grantee_id ? people[s.grantee_id] : undefined;
          const label = p?.name || s.grantee_name || s.grantee_email;
          return (
            <div key={s.id} className="person">
              <span className="av">{label.slice(0, 1)}</span>
              <span className="nm">{label}<small>{s.grantee_email}{s.grantee_id ? "" : " · 아직 로그인 전 (초대 대기)"}</small></span>
              <select id={`plv-${s.id}`} className="f" value={s.level} onChange={(e) => run(() => store.updateShare(s.id, e.target.value as ShareLevel), "공유 수준을 바꿨습니다")} aria-label="공유 수준">
                {(Object.keys(LEVEL_LABEL) as ShareLevel[]).map((k) => <option key={k} value={k}>{LEVEL_LABEL[k]}</option>)}
              </select>
              <button className="btn ghost danger" onClick={() => run(() => store.deleteShare(s.id), "공유를 해제했습니다")}>공유 해제</button>
            </div>
          );
        }) : <div className="empty">아직 공유한 사람이 없습니다.</div>}
        <form className="addrow" autoComplete="off" onSubmit={(e) => {
          e.preventDefault(); setErr("");
          if (!/^\S+@\S+\.\S+$/.test(mail.trim())) { setErr("이메일 주소 형식을 확인해 주세요."); return; }
          run(() => store.addShare(mail.trim(), nm.trim(), lv), "초대했습니다. 상대가 이 이메일로 로그인하면 바로 연결됩니다."); setNm(""); setMail("");
        }}>
          <input id="invName" className="f" style={{ flex: "0 1 140px" }} value={nm} onChange={(e) => setNm(e.target.value)} placeholder="이름" aria-label="이름" />
          <input id="invMail" className="f grow" value={mail} onChange={(e) => setMail(e.target.value)} placeholder="회사 이메일" aria-label="이메일" />
          <select id="invLv" className="f" value={lv} onChange={(e) => setLv(e.target.value as ShareLevel)} aria-label="공유 수준">
            {(Object.keys(LEVEL_LABEL) as ShareLevel[]).map((k) => <option key={k} value={k}>{LEVEL_LABEL[k]}</option>)}
          </select>
          <button className="btn primary">초대</button>
        </form>
        {err && <p className="saved" style={{ color: "var(--pa)" }}>{err}</p>}
        <p className="saved">상대에게 사이트 주소를 알려 주세요. 초대한 이메일로 로그인하면 공유 수준에 맞는 화면이 열립니다.</p>
      </div>
      <div className="sheet">
        <div className="sh"><h2>‘주간 요약만’ 공유 화면 미리보기</h2><span className="sub">요약 권한자가 보는 숫자</span></div>
        <Tiles s={weeklyStats(data.tasks, cur, today())} />
      </div>
      <div className="sheet">
        <div className="sh"><h2>내 표시 이름</h2><span className="sub">공유받은 사람에게 보이는 이름</span></div>
        <form className="addrow" onSubmit={(e) => { e.preventDefault(); if (myName.trim()) run(() => store.updateMyName(myName.trim()), "이름을 바꿨습니다"); }}>
          <input id="myName" className="f grow" value={myName} onChange={(e) => setMyName(e.target.value)} placeholder="예: 데니" aria-label="표시 이름" />
          <button className="btn">저장</button>
        </form>
      </div>
    </section>
  );
}

function InboxView({ store, me, run, version }: { store: Store; me: Profile; run: RunFn; version: number }) {
  const demo = store instanceof DemoStore ? store : null;
  const [persona, setPersona] = useState(demo?.delegatePeople()[0]?.id ?? me.id);
  const [list, setList] = useState<Task[]>([]);
  const [owners, setOwners] = useState<Record<string, Profile>>({});
  useEffect(() => {
    let alive = true;
    (async () => {
      if (demo) demo.actingAs = persona;
      const ts = await store.delegatedToMe();
      if (demo) demo.actingAs = me.id;
      if (!alive) return;
      setList(ts);
      setOwners(await store.profiles(ts.map((t) => t.owner_id)));
    })().catch(() => {});
    return () => { alive = false; };
  }, [store, demo, persona, me.id, version]);
  const act = (t: Task, s: "accepted" | "working" | "done") => run(async () => {
    if (demo) demo.actingAs = persona;
    try { await store.setDelegState(t.id, s); } finally { if (demo) demo.actingAs = me.id; }
  }, s === "done" ? "완료 처리했습니다" : `${DELEG_LABEL[s]}(으)로 바꿨습니다`);
  return (
    <section className="sheet">
      <div className="sh">
        <h2>위임받은 업무</h2>
        {demo ? (
          <span className="sub">동료 화면 미리보기:{" "}
            <select id="inboxWho" className="f" value={persona} onChange={(e) => setPersona(e.target.value)} aria-label="동료 선택">
              {demo.delegatePeople().map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </span>
        ) : <span className="sub">다른 사람이 나에게 맡긴 업무</span>}
      </div>
      {list.length ? list.map((t) => (
        <div key={t.id} className="li">
          <span className={`code pri-${t.priority}`}>{t.priority}</span>
          <span className="ttl">{t.title}<span className="chip">{owners[t.owner_id]?.name ?? ""} · {md(t.plan_date)} 위임</span><span className="chip dl">{t.deleg_state ? DELEG_LABEL[t.deleg_state] : "대기"}</span>
            {t.memo && <div style={{ fontSize: 12.5, color: "var(--muted)" }}>{t.memo}</div>}</span>
          {t.deleg_state === "done" ? <span className="when">완료됨</span> : (
            <>
              {t.deleg_state === "pending" && <button className="btn" onClick={() => act(t, "accepted")}>수락</button>}
              {t.deleg_state !== "working" && <button className="btn" onClick={() => act(t, "working")}>진행</button>}
              <button className="btn primary" onClick={() => act(t, "done")}>완료</button>
            </>
          )}
        </div>
      )) : <div className="empty">위임받은 업무가 없습니다.</div>}
    </section>
  );
}
