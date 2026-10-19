"use client";
import { useEffect, useState } from "react";
import type { Store } from "@/lib/store/types";
import type { Task, TaskDetail, Profile, OwnerData, Priority, TaskStatus } from "@/lib/types";
import { STATUS, DELEG_LABEL, forwardChain, normalizeUrl, nextSeq } from "@/lib/planner";
import { addDays, md, dday, weekday } from "@/lib/dates";

type Props = {
  store: Store;
  task: Task;
  data: OwnerData;
  editable: boolean;
  canComment: boolean;
  people: Record<string, Profile>;
  delegateOptions: Profile[];
  version: number;
  run: (fn: () => Promise<unknown>, ok?: string) => Promise<boolean>;
  onClose: () => void;
  onGoto: (id: string) => void;
};

const fmtTime = (iso: string) => {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

export default function TaskDrawer({ store, task: t, data, editable, canComment, people, delegateOptions, version, run, onClose, onGoto }: Props) {
  const [detail, setDetail] = useState<TaskDetail | null>(null);
  const [title, setTitle] = useState(t.title);
  const [memo, setMemo] = useState(t.memo);
  const [fwdTo, setFwdTo] = useState(addDays(t.plan_date, 1));
  const [who, setWho] = useState(t.delegate_id ?? "");
  const [ck, setCk] = useState("");
  const [lkTitle, setLkTitle] = useState("");
  const [lkUrl, setLkUrl] = useState("");
  const [relPick, setRelPick] = useState("");
  const [comment, setComment] = useState("");
  const [confirmDel, setConfirmDel] = useState(false);

  useEffect(() => { setTitle(t.title); setMemo(t.memo); setWho(t.delegate_id ?? ""); setFwdTo(addDays(t.plan_date, 1)); setConfirmDel(false); }, [t.id, t.title, t.memo, t.delegate_id, t.plan_date]);
  useEffect(() => {
    let alive = true;
    store.taskDetail(t.id).then((d) => alive && setDetail(d)).catch(() => alive && setDetail({ links: [], relations: [], history: [], comments: [] }));
    return () => { alive = false; };
  }, [store, t.id, version]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);

  const byId = new Map(data.tasks.map((x) => [x.id, x]));
  const related = (detail?.relations ?? []).map((id) => byId.get(id)).filter(Boolean) as Task[];
  const candidates = t.project_id
    ? data.tasks.filter((x) => x.project_id === t.project_id && x.id !== t.id && !(detail?.relations ?? []).includes(x.id))
    : [];
  const chain = forwardChain(data.tasks, t);
  const doneCount = t.checklist.filter((c) => c.done).length;
  const name = (id: string | null) => (id && people[id]?.name) || "알 수 없음";

  const upd = (patch: Parameters<Store["updateTask"]>[1], ok?: string) => run(() => store.updateTask(t.id, patch), ok);
  const setStatus = (s: TaskStatus) => upd({ status: s, ...(t.delegate_id && s !== "deleg" ? { delegate_id: null, deleg_state: null } : {}) });
  const move = async (dir: -1 | 1) => {
    const sib = data.tasks.filter((x) => x.plan_date === t.plan_date && x.priority === t.priority).sort((a, b) => a.seq - b.seq);
    const i = sib.findIndex((x) => x.id === t.id), j = i + dir;
    if (j < 0 || j >= sib.length) return;
    const o = sib[j];
    await run(async () => { await store.updateTask(t.id, { seq: o.seq }); await store.updateTask(o.id, { seq: t.seq }); });
  };
  const RelRow = ({ x, removable }: { x: Task; removable?: boolean }) => (
    <div className="lnk">
      <span className={`code pri-${x.priority}`}>{STATUS[x.status].sym || "□"}</span>
      <button className="linkbtn" onClick={() => onGoto(x.id)}>{x.title}</button>
      <span className="when mono">{md(x.plan_date)}</span>
      {removable && editable && <button className="more" aria-label="연결 해제" onClick={() => run(() => store.deleteRelation(t.id, x.id))}>×</button>}
    </div>
  );

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-label="업무 상세">
        <div className="dhead">
          <span className={`code pri-${t.priority}`}>{t.priority}{t.seq}</span>
          {editable ? (
            <input id="d-title" className="f grow dtitle" value={title} onChange={(e) => setTitle(e.target.value)}
              onBlur={() => title.trim() && title.trim() !== t.title && upd({ title: title.trim() })} aria-label="업무 제목" />
          ) : <span className="dtitle" style={{ flex: 1 }}>{t.title}</span>}
          <button className="more" aria-label="닫기" onClick={onClose}>×</button>
        </div>
        <div className="dbody">
          <div className="dsec">
            <h3>기본 정보</h3>
            <div className="kv">
              <label htmlFor="d-pri">우선순위</label>
              <select id="d-pri" className="f" value={t.priority} disabled={!editable}
                onChange={(e) => { const p = e.target.value as Priority; upd({ priority: p, seq: nextSeq(data.tasks, t.plan_date, p) }); }}>
                <option value="A">A 반드시</option><option value="B">B 해야 할</option><option value="C">C 하면 좋은</option>
              </select>
              <span>계획일</span><span className="mono">{t.plan_date} ({weekday(t.plan_date)})</span>
              <label htmlFor="d-due">마감일</label>
              <span style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <input id="d-due" className="f" type="date" value={t.due_date ?? ""} disabled={!editable} onChange={(e) => upd({ due_date: e.target.value || null })} />
                {t.due_date && <span className="chip due" style={{ marginLeft: 0 }}>{dday(t.due_date)}</span>}
              </span>
              <label htmlFor="d-proj">프로젝트</label>
              <select id="d-proj" className="f" value={t.project_id ?? ""} disabled={!editable} onChange={(e) => upd({ project_id: e.target.value || null })}>
                <option value="">없음</option>
                {data.projects.filter((p) => !p.archived || p.id === t.project_id).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          </div>

          <div className="dsec">
            <h3>상태</h3>
            {t.status === "fwd" && t.fwd_to && <p className="saved">{md(t.fwd_to)}로 이월된 업무입니다.</p>}
            {t.delegate_id && (
              <p className="saved">{name(t.delegate_id)}에게 위임 · {t.deleg_state ? DELEG_LABEL[t.deleg_state] : "대기"}</p>
            )}
            {editable && (
              <>
                <div className="stbtns">
                  {(["open", "progress", "done", "cancel"] as TaskStatus[]).map((k) => (
                    <button key={k} aria-pressed={t.status === k} onClick={() => setStatus(k)}>{STATUS[k].sym || "□"} {STATUS[k].label}</button>
                  ))}
                </div>
                <div className="edit" style={{ padding: "10px 0 0" }}>
                  <div className="row">
                    <label htmlFor="e-fwd">이월할 날짜</label>
                    <input id="e-fwd" className="f" type="date" value={fwdTo} onChange={(e) => setFwdTo(e.target.value)} />
                    <button className="btn" disabled={!fwdTo || fwdTo === t.plan_date || t.status === "fwd"}
                      onClick={async () => { if (await run(() => store.forwardTask(t.id, fwdTo), `${md(fwdTo)}로 이월했습니다`)) onClose(); }}>→ 이월</button>
                  </div>
                  <div className="row">
                    <label htmlFor="e-who">위임 대상</label>
                    <select id="e-who" className="f" value={who} onChange={(e) => setWho(e.target.value)}>
                      <option value="">{delegateOptions.length ? "선택" : "위임 협업 권한자 없음"}</option>
                      {delegateOptions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                    <button className="btn" disabled={!who || who === t.delegate_id}
                      onClick={async () => {
                        const ok = await run(() => store.updateTask(t.id, { status: "deleg", delegate_id: who, deleg_state: "pending" }), `${name(who)}에게 위임했습니다`);
                        if (ok && store.mode === "live") fetch("/api/notify-delegate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ taskId: t.id }) }).catch(() => {});
                      }}>○ 위임</button>
                  </div>
                  {!delegateOptions.length && <p className="saved">공유 설정에서 ‘위임 협업’ 권한으로 동료를 초대하면 위임할 수 있습니다.</p>}
                </div>
              </>
            )}
          </div>

          <div className="dsec">
            <h3>상세 내용</h3>
            {editable ? (
              <textarea id="d-memo" className="f" value={memo} placeholder="배경, 요청자, 진행 상황, 결정 사항 등" onChange={(e) => setMemo(e.target.value)}
                onBlur={() => memo !== t.memo && upd({ memo })} />
            ) : <p style={{ whiteSpace: "pre-wrap", margin: 0 }}>{t.memo || <span className="saved">내용 없음</span>}</p>}
          </div>

          <div className="dsec">
            <h3>체크리스트 {t.checklist.length > 0 && <span className="mono">{doneCount}/{t.checklist.length}</span>}</h3>
            {t.checklist.map((c, i) => (
              <div key={i} className={`ck${c.done ? " done" : ""}`}>
                <input id={`ck-${i}`} type="checkbox" checked={c.done} disabled={!editable}
                  onChange={() => upd({ checklist: t.checklist.map((x, j) => (j === i ? { ...x, done: !x.done } : x)) })} />
                <label htmlFor={`ck-${i}`} style={{ flex: 1 }}><span>{c.text}</span></label>
                {editable && <button className="more" aria-label="삭제" onClick={() => upd({ checklist: t.checklist.filter((_, j) => j !== i) })}>×</button>}
              </div>
            ))}
            {editable && (
              <form className="addrow" onSubmit={(e) => { e.preventDefault(); if (!ck.trim()) return; upd({ checklist: [...t.checklist, { text: ck.trim(), done: false }] }); setCk(""); }}>
                <input id="ck-new" className="f grow" value={ck} onChange={(e) => setCk(e.target.value)} placeholder="세부 단계 추가" aria-label="세부 단계" />
                <button className="btn">추가</button>
              </form>
            )}
          </div>

          <div className="dsec">
            <h3>관련 자료·링크</h3>
            {(detail?.links ?? []).map((l) => (
              <div key={l.id} className="lnk">
                <a href={l.url} target="_blank" rel="noopener noreferrer" style={{ flex: 1, minWidth: 0, overflowWrap: "anywhere" }}>{l.title || l.url}</a>
                {editable && <button className="more" aria-label="삭제" onClick={() => run(() => store.deleteLink(l.id))}>×</button>}
              </div>
            ))}
            {detail && !detail.links.length && !editable && <p className="saved">등록된 자료가 없습니다.</p>}
            {editable && (
              <form className="addrow" onSubmit={(e) => {
                e.preventDefault(); const u = normalizeUrl(lkUrl); if (!u) return;
                run(() => store.addLink(t.id, lkTitle.trim(), u)); setLkTitle(""); setLkUrl("");
              }}>
                <input id="lk-title" className="f" style={{ flex: "1 1 120px" }} value={lkTitle} onChange={(e) => setLkTitle(e.target.value)} placeholder="자료명" aria-label="자료명" />
                <input id="lk-url" className="f grow" value={lkUrl} onChange={(e) => setLkUrl(e.target.value)} placeholder="https:// (드라이브, 위키, 메일 링크)" aria-label="링크 주소" />
                <button className="btn">추가</button>
              </form>
            )}
          </div>

          <div className="dsec">
            <h3>관련 업무</h3>
            {related.length ? related.map((x) => <RelRow key={x.id} x={x} removable />) : <p className="saved">연결된 업무가 없습니다{editable && !t.project_id ? ". 프로젝트를 지정하면 같은 프로젝트 업무를 연결할 수 있습니다." : "."}</p>}
            {editable && candidates.length > 0 && (
              <div className="addrow">
                <select id="rel-pick" className="f grow" value={relPick} onChange={(e) => setRelPick(e.target.value)} aria-label="연결할 업무">
                  <option value="">같은 프로젝트 업무에서 연결…</option>
                  {candidates.map((x) => <option key={x.id} value={x.id}>{md(x.plan_date)} · {x.title}</option>)}
                </select>
                <button className="btn" disabled={!relPick} onClick={() => { run(() => store.addRelation(t.id, relPick)); setRelPick(""); }}>연결</button>
              </div>
            )}
            {chain.length > 0 && (<><p className="saved" style={{ marginTop: 10 }}>이월 이력</p>{chain.map((x) => <RelRow key={x.id} x={x} />)}</>)}
          </div>

          <div className="dsec">
            <h3>코멘트</h3>
            {detail?.comments.length ? (
              <div className="cmts">
                {detail.comments.map((c) => <div key={c.id} className="cmt"><b>{name(c.author_id)}</b>{c.body}<span>{fmtTime(c.created_at)}</span></div>)}
              </div>
            ) : <p className="saved">아직 코멘트가 없습니다.</p>}
            {canComment && (
              <form className="addrow" onSubmit={(e) => { e.preventDefault(); if (!comment.trim()) return; run(() => store.addComment(t.id, comment.trim())); setComment(""); }}>
                <input id="cm-new" className="f grow" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="코멘트 남기기" aria-label="코멘트" />
                <button className="btn primary">등록</button>
              </form>
            )}
          </div>

          <div className="dsec">
            <h3>진행 기록</h3>
            <div className="hist">
              {detail?.history.length ? detail.history.map((h) => (
                <div key={h.id}><span className="mono">{fmtTime(h.created_at)}</span> {h.detail}{h.actor_id && h.actor_id !== t.owner_id ? ` · ${name(h.actor_id)}` : ""}</div>
              )) : "기록 없음"}
            </div>
          </div>

          {editable && (
            <div className="dsec" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button className="btn ghost" onClick={() => move(-1)}>▲ 위로</button>
              <button className="btn ghost" onClick={() => move(1)}>▼ 아래로</button>
              <span style={{ flex: 1 }} />
              {confirmDel ? (
                <>
                  <span className="saved" style={{ alignSelf: "center" }}>삭제하면 되돌릴 수 없습니다.</span>
                  <button className="btn" onClick={() => setConfirmDel(false)}>취소</button>
                  <button className="btn danger" onClick={async () => { if (await run(() => store.deleteTask(t.id), "업무를 삭제했습니다")) onClose(); }}>삭제</button>
                </>
              ) : <button className="btn ghost danger" onClick={() => setConfirmDel(true)}>업무 삭제</button>}
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
