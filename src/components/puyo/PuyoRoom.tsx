"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { getMemberProfile, watchMembers, type Member } from "@/lib/classes";
import { watchActiveGame, watchGame, type Game } from "@/lib/games";
import { finishPuyo, leavePuyoRoom, nextPuyoRound, presence, puyoClock, puyoUrl, startPuyo, watchPuyoPresence, watchPuyoRuns, type PuyoConfig, type PuyoPresence, type PuyoRun } from "@/lib/puyo";
import { minutesLabel, normalizeRules, planMatches, planPairs, PUYO_COUNTDOWN_SEC, PUYO_MAX_STUDENTS, ruleSummary, swapInPlan, type FlowStage, type PuyoPlan, type PuyoRules } from "@/lib/puyo-rules";
import { PuyoBattle, PuyoPractice } from "./PuyoBattle";
import { PuyoRulebook, PuyoRulesButton } from "./PuyoRulebook";
import styles from "./PuyoRoom.module.css";

const FRIENDS = [
  { file: "gengar", name: "팬텀", color: "#eadcfd", label: "보라" },
  { file: "snorlax", name: "잠만보", color: "#d9f3dd", label: "초록" },
  { file: "charmander", name: "파이리", color: "#ffe0d6", label: "빨강" },
  { file: "squirtle", name: "꼬부기", color: "#dceefb", label: "파랑" },
];
const reasonLabels = { topout: "보드가 가득 찼어요", time: "제한 시간 · 점수 판정", disconnect: "접속 종료", teacher: "선생님 종료 · 점수 판정" };
const timeLabel = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.max(0, seconds % 60)).padStart(2, "0")}`;
function message(error: unknown) { return error instanceof Error ? error.message.replace(/^Firebase:\s*/, "") : "연결을 확인하고 다시 시도해 주세요."; }
function Friend({ index, className = "" }: { index: number; className?: string }) {
  // These are locally authored vector character assets.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={`/puyo/assets/${FRIENDS[index % 4].file}.svg`} width={110} height={110} alt={FRIENDS[index % 4].name} draggable={false} className={className} />;
}
function Rules() {
  return <div className={styles.rules}>
    <article><span>01</span><div><strong>같은 색, 네 개!</strong><p>상하좌우로 연결하면 팡! 사라져요.</p></div></article>
    <article><span>02</span><div><strong>연쇄로 공격해요</strong><p>연달아 터뜨려 상대에게 회색 방해 뿌요를 보내요.</p></div></article>
    <article><span>03</span><div><strong>시간 안에 더 높은 점수</strong><p>먼저 쌓이면 패배! 시간이 끝나면 점수로 결정해요.</p></div></article>
  </div>;
}

function Landing() {
  const [practice, setPractice] = useState(false);
  return <>
    <section className={styles.hero}>
      <div className={styles.heroCopy}><div className={styles.eyebrow}><span /> OUR CLASS, ONE MORE COMBO!</div><h1>꼬물꼬물,<br /><em>우리 반 뿌요뿌요</em></h1><p>쌓고, 연결하고, 팡!<br />포켓 친구들과 함께 신나는 연쇄를 만들어 봐요.</p><div className={styles.heroActions}><button className={styles.primary} onClick={() => { setPractice(true); setTimeout(() => document.getElementById("puyo-practice")?.scrollIntoView({ behavior: "smooth", block: "start" }), 80); }}>연습하러 가기 <span>↗</span></button><span>혼자 연습 · 로그인 없이 즐겨요</span></div><div className={styles.heroPills}><span>같은 색 4개 연결</span><span>1:1 학급 대전</span><span>짜릿한 연쇄 공격</span></div></div>
      <div className={styles.heroArt} aria-label="팬텀, 잠만보, 파이리, 꼬부기 포켓 친구들"><div className={styles.orbit} /><span className={styles.artStar}>✦</span><span className={styles.artStarSmall}>✧</span><div className={styles.comboSticker}>3 <span>COMBO!</span></div><div className={styles.heroFriends}>{[0, 3, 2, 1].map((n, i) => <div key={n} style={{ "--friend-color": FRIENDS[n].color, "--delay": `${i * -.6}s` } as CSSProperties}><Friend index={n} /></div>)}</div><div className={styles.artCaption}><span /> READY, SET, PUYO!</div></div>
    </section>
    {practice ? <section id="puyo-practice" className={styles.practice}><div className={styles.sectionHeading}><div><span className={styles.eyebrow}>PRACTICE MODE</span><h2>혼자 연습</h2></div><button className={styles.secondary} onClick={() => setPractice(false)}>연습 닫기</button></div><PuyoPractice /></section> : <section className={styles.howTo}><div className={styles.sectionHeading}><div><span className={styles.eyebrow}>HOW TO PLAY</span><h2>작은 연결이 커다란 연쇄로</h2></div><span className={styles.muted}>처음이라도 괜찮아요!</span></div><Rules /></section>}
    <section className={styles.classInvite}><span className={styles.inviteIcon}>✦</span><div><h3>친구들과 대결할 준비가 됐나요?</h3><p>선생님은 학급의 게임 메뉴에서 뿌요뿌요를 시작해 주세요.<br />학생은 학급 화면에 뜨는 게임에 입장하면 함께할 수 있어요.</p></div><Link className={styles.secondary} href="/">내 학급으로 <span>→</span></Link></section>
    <section className={styles.friendsStrip} aria-label="네 가지 포켓 친구">{FRIENDS.map((f, i) => <div key={f.file}><Friend index={i} /><div><strong>{f.name}</strong><span>{f.label} 뿌요</span></div></div>)}</section>
  </>;
}

function Scoreboard({ config, runs, uid, done }: { config: PuyoConfig; runs: PuyoRun[]; uid: string; done: boolean }) {
  const players = new Map((config.players || []).map(p => [p.uid, p]));
  const scores = new Map(runs.map(p => [p.uid, p]));
  const matches = config.matches || [];
  return <section className={styles.scoreboard} id="puyo-scoreboard"><div className={styles.sectionHeading}><div><span className={styles.eyebrow}>{done ? "GG, WELL PLAYED!" : "CLASS LIVE"}</span><h2>{done ? "우리 반 경기 결과" : "우리 반 대진표"}</h2></div><span className={styles.countBadge}>{matches.filter(m => m.result).length} / {matches.length} 경기 완료</span></div><div className={styles.matchGrid}>{matches.map((m, i) => <article className={`${styles.matchCard} ${m.a === uid || m.b === uid ? styles.myMatch : ""}`} key={m.id}><header><span>MATCH {String(i + 1).padStart(2, "0")}</span><span className={m.result ? styles.resultBadge : styles.liveBadge}>{m.result ? "경기 종료" : "● LIVE"}</span></header><div className={styles.duel}>{[m.a, m.b].map((id, j) => <div className={styles.duelPlayer} key={id}><span className={styles.duelAvatar} style={{ background: FRIENDS[(i + j) % 4].color }}><Friend index={i + j} />{m.result?.winner === id && <b aria-label="승리">♛</b>}</span><strong>{players.get(id)?.name || "참가자"}{id === uid && <small>나</small>}</strong><span className={styles.playerRole}>{players.get(id)?.teacher ? "선생님" : "학생"}</span><em>{(m.result?.scores[id] ?? scores.get(id)?.score)?.toLocaleString("ko-KR") ?? "—"}<small>점</small></em></div>)}<span className={styles.versus}>VS</span></div><footer>{m.result ? <><strong>{m.result.winner ? `${players.get(m.result.winner)?.name || "참가자"} 승리!` : "무승부 · 함께 잘했어요!"}</strong><span>{reasonLabels[m.result.reason]}{m.result.reward && ` · 승리 보상 +${m.result.reward.xp} XP 지급 완료`}</span></> : <><strong>{m.a === uid || m.b === uid ? "나의 경기" : "응원하는 마음을 보내요!"}</strong><span>최고 연쇄 {Math.max(scores.get(m.a)?.maxChain || 0, scores.get(m.b)?.maxChain || 0)}</span></>}</footer></article>)}</div></section>;
}

/** 대기실 — 참가자 고르기 → 1:1 짝 정하기(미리보기) → 시작. 학생은 같은 화면에서 진행 상황과 규칙을 본다. */
function Lobby({ cid, gid, uid, teacher, config, rules, students, onlineStudents, busy, act }: {
  cid: string; gid: string; uid: string; teacher: boolean; config: PuyoConfig; rules: PuyoRules;
  students: Member[]; onlineStudents: Member[]; busy: boolean; act: (task: () => Promise<unknown>) => Promise<void>;
}) {
  // 한 판 더로 열린 대기실은 직전 참가자를 미리 체크해 둔다(교사가 손대기 전까지).
  const [picked, setPicked] = useState<string[] | null>(null);
  const [plan, setPlan] = useState<PuyoPlan | null>(null);
  const [swapFrom, setSwapFrom] = useState<string | null>(null);
  const onlineIds = new Set(onlineStudents.map(m => m.uid));
  const selected = (picked ?? config.carry ?? []).filter(id => onlineIds.has(id));
  const odd = selected.length % 2 === 1;
  const ready = planMatches(plan, selected, uid);
  const nameOf = (id: string) => id === uid && teacher ? "선생님" : students.find(m => m.uid === id)?.displayName || "학생";
  const indexOf = (id: string) => Math.max(0, onlineStudents.findIndex(m => m.uid === id));
  const toggle = (id: string) => { setPicked(selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id]); setSwapFrom(null); };
  const shuffle = () => { setPlan(planPairs(selected, uid, rules, config.prevResting ?? [])); setSwapFrom(null); };
  const tap = (id: string) => {
    if (!ready || rules.pairing !== "manual") return;
    if (!swapFrom) { setSwapFrom(id); return; }
    if (swapFrom !== id) setPlan(swapInPlan(plan, swapFrom, id));
    setSwapFrom(null);
  };
  const seat = (id: string) => <button type="button" key={id} className={`${styles.seat} ${swapFrom === id ? styles.seatPicked : ""}`} disabled={rules.pairing !== "manual" || busy} onClick={() => tap(id)} aria-pressed={swapFrom === id}>
    <span className={styles.seatAvatar} style={{ background: FRIENDS[indexOf(id) % 4].color }}><Friend index={indexOf(id)} /></span><strong>{nameOf(id)}</strong>
  </button>;
  const stage: FlowStage = ready ? "pair" : "pick";

  return <>
    <div className={styles.lobbyLayout}>
      <section className={styles.lobby}>
        <div className={styles.sectionHeading}><div><span className={styles.liveBadge}>● 대기실</span><h2>접속한 친구들 <span>{onlineStudents.length}</span></h2></div>{teacher && <button className={styles.textButton} onClick={() => { setPicked(selected.length === onlineStudents.length ? [] : onlineStudents.slice(0, PUYO_MAX_STUDENTS).map(p => p.uid)); setSwapFrom(null); }}>{onlineStudents.length > 0 && selected.length === onlineStudents.length ? "전체 해제" : "전체 선택"}</button>}</div>
        {onlineStudents.length === 0 ? <div className={styles.empty}><div className={styles.waitingFriends}><Friend index={0} /><Friend index={1} /></div><h3>친구들이 입장하고 있어요</h3><p>학생들이 학급 화면에서 뿌요뿌요에 입장하면<br />여기에 실시간으로 나타나요.</p></div>
          : <div className={styles.studentGrid}>{onlineStudents.map((p, i) => <label key={p.uid} className={`${styles.student} ${selected.includes(p.uid) ? styles.selected : ""}`}><input type="checkbox" checked={selected.includes(p.uid)} disabled={!teacher || busy || (!selected.includes(p.uid) && selected.length >= PUYO_MAX_STUDENTS)} onChange={() => toggle(p.uid)} aria-label={`${p.displayName} 참가 선택`} /><span className={styles.studentAvatar} style={{ background: FRIENDS[i % 4].color }}><Friend index={i} /></span><strong>{p.displayName || "학생"}{p.uid === uid && <small>나</small>}</strong><span className={styles.onlineLabel}>● 접속 중{(config.prevResting ?? []).includes(p.uid) && " · 먼저 짝"}</span></label>)}</div>}
        <div className={styles.lobbyFoot}><span className={styles.statusDot} />게임방 접속 상태가 실시간으로 반영돼요{students.length > onlineStudents.length && <span>· 아직 입장 전 {students.length - onlineStudents.length}명</span>}</div>
      </section>
      <aside className={styles.startPanel}>
        <span className={styles.eyebrow}>{(config.round ?? 1) > 1 ? `${config.round}번째 판` : "MATCH READY"}</span>
        <h2>{teacher ? ready ? "짝 확인하고 시작" : "참가자 고르기" : "잠시만 기다려요"}</h2>
        <div className={styles.selectionCount}><strong>{teacher ? selected.length : onlineStudents.length}</strong><span>{teacher ? "명 선택했어요" : "명의 친구가 접속했어요"}</span></div>
        {teacher ? <>
          <div className={styles.pairingNote}><span>{odd ? "✦" : "↔"}</span><p>{selected.length === 0 ? "대결할 학생을 한 명 이상 선택해 주세요." : odd ? rules.odd === "teacher" ? `학생 ${selected.length}명 + 선생님! 선생님도 함께 대결해요.` : `학생 ${selected.length}명 · ${Math.floor(selected.length / 2)}경기, 한 명은 이번 판을 쉬어요.` : `학생 ${selected.length}명이 ${selected.length / 2}경기를 펼쳐요. 선생님은 관전해요.`}</p></div>
          {ready ? <div className={styles.planBox} aria-label="대진표 미리보기">
            {plan.pairs.map(([a, b], i) => <div key={`${a}-${b}`} className={styles.planRow}><span className={styles.planNo}>{i + 1}</span>{seat(a)}<span className={styles.planVs}>VS</span>{seat(b)}</div>)}
            {plan.resting.length > 0 && <div className={`${styles.planRow} ${styles.planRest}`}><span className={styles.planNo}>쉼</span>{plan.resting.map(seat)}<span className={styles.planHint}>다음 판 먼저</span></div>}
            <p className={styles.planHelp}>{rules.pairing === "manual" ? swapFrom ? `${nameOf(swapFrom)}와 자리를 바꿀 친구를 눌러요.` : "두 친구를 차례로 누르면 자리가 바뀌어요." : "무작위로 정한 짝이에요."}</p>
            <button className={styles.secondary} disabled={busy} onClick={shuffle}>다시 섞기</button>
          </div> : <button className={styles.secondary} disabled={busy || selected.length === 0} onClick={shuffle}>1:1 짝 만들기</button>}
          <dl>{ruleSummary(rules).map(r => <div key={r.label}><dt>{r.label}</dt><dd>{r.value}</dd></div>)}</dl>
          <button className={styles.primary} disabled={busy || !ready} onClick={() => ready && void act(() => startPuyo(cid, gid, plan))}>{busy ? "경기 준비 중…" : "대결 시작"}<span>▶</span></button>
          <p className={styles.finePrint}>{ready ? `시작하면 ${PUYO_COUNTDOWN_SEC}초 준비 후 동시에 출발해요.` : "짝을 만들어야 시작할 수 있어요."}<br />누가 나가거나 선택이 바뀌면 짝을 다시 만들어요.</p>
        </> : <>
          <div className={styles.pairingNote}><span>✦</span><p>선생님이 참가자를 고르고 짝을 정하고 있어요.<br />이 화면을 열어 두고 기다려 주세요.</p></div>
          <dl>{ruleSummary(rules).map(r => <div key={r.label}><dt>{r.label}</dt><dd>{r.value}</dd></div>)}</dl>
          <div className={styles.waitPulse}>선생님의 시작을 기다리는 중<span>•••</span></div>
        </>}
      </aside>
    </div>
    <section className={styles.rulebookSection} aria-label="진행 순서와 규칙"><div className={styles.sectionHeading}><div><span className={styles.eyebrow}>RULES</span><h2>이렇게 진행돼요</h2></div><span className={styles.muted}>{minutesLabel(rules.durationSec)} · 1:1 대결</span></div><PuyoRulebook rules={rules} current={stage} /></section>
  </>;
}

function ConnectedRoom({ cid, gid }: { cid: string; gid: string }) {
  const { user, loading, configured } = useAuth();
  const router = useRouter();
  const [member, setMember] = useState<Awaited<ReturnType<typeof getMemberProfile>> | undefined>(undefined);
  const [game, setGame] = useState<Game | null | undefined>(undefined);
  const [members, setMembers] = useState<Member[]>([]);
  const [online, setOnline] = useState<PuyoPresence[]>([]);
  const [runs, setRuns] = useState<PuyoRun[]>([]);
  const [clockOffset, setClockOffset] = useState(0);
  const [now, setNow] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const finishing = useRef(false);
  const settleContext = useRef<{ config: PuyoConfig | undefined; runs: PuyoRun[]; clockOffset: number; uid: string; teacher: boolean }>({ config: undefined, runs: [], clockOffset: 0, uid: "", teacher: false });
  const teacher = member?.role === "teacher";
  const back = `/${teacher ? "class-admin" : "class"}/?id=${encodeURIComponent(cid)}`;
  const config = game?.puyo;
  const rules = normalizeRules(config);

  useEffect(() => { const tick = () => setNow(Date.now() + clockOffset); tick(); const t = setInterval(tick, 1000); return () => clearInterval(t); }, [clockOffset]);
  useEffect(() => {
    if (!user || !configured) return;
    let active = true;
    getMemberProfile(cid, user.uid).then(v => { if (active) setMember(v); }).catch(e => { if (active) { setMember(null); setError(message(e)); } });
    return () => { active = false; };
  }, [cid, user, configured]);
  useEffect(() => {
    if (!member || !user) return;
    let active = true;
    const report = (e: Error) => { if (active) setError(message(e)); };
    const off = [watchGame(cid, gid, setGame), watchMembers(cid, setMembers), watchPuyoPresence(cid, gid, setOnline, report)];
    puyoClock(cid).then(offset => { if (active) setClockOffset(offset); }).catch(report);
    const sync = setInterval(() => { void puyoClock(cid).then(offset => { if (active) setClockOffset(offset); }).catch(report); }, 60000);
    return () => { active = false; off.forEach(fn => fn()); clearInterval(sync); };
  }, [cid, gid, member, user]);
  useEffect(() => {
    if (!member || !user || game?.kind !== "puyo" || game?.status === "done") return;
    return presence(cid, gid, user.uid, member.displayName || user.displayName || (teacher ? "선생님" : "학생"));
  }, [cid, gid, member, user, game?.kind, game?.status, teacher]);
  // 교사가 '한 판 더' 또는 다른 게임을 열면 활성 게임 포인터가 바뀐다 → 모두 함께 이동.
  // 처음 본 포인터는 기준값으로만 기억한다(이력에서 옛 경기를 열어 볼 때 끌려가지 않도록).
  useEffect(() => {
    if (!member) return;
    let first: string | null | undefined;
    return watchActiveGame(cid, g => {
      const id = g?.id ?? null;
      if (first === undefined) { first = id; return; }
      if (!g || id === first || id === gid) return;
      first = id;
      if (g.kind === "puyo") router.replace(puyoUrl(cid, g.id));
      else router.push(back);
    });
  }, [cid, gid, member, router, back]);
  const matched = config?.matches?.find(m => m.a === user?.uid || m.b === user?.uid);
  const watchIds = teacher || !matched ? "" : [matched.a, matched.b].sort().join(",");
  useEffect(() => {
    if (!member || game?.kind !== "puyo") return;
    return watchPuyoRuns(cid, gid, setRuns, e => setError(message(e)), watchIds ? watchIds.split(",") : undefined);
  }, [cid, gid, member, game?.kind, watchIds]);
  useEffect(() => { settleContext.current = { config, runs, clockOffset, uid: user?.uid || "", teacher }; }, [config, runs, clockOffset, user?.uid, teacher]);
  useEffect(() => {
    if (game?.status !== "play") return;
    const settle = async () => {
      if (finishing.current) return;
      const { config: latest, runs: recent, clockOffset: offset, uid, teacher: isTeacher } = settleContext.current;
      if (!latest) return;
      const serverNow = Date.now() + offset;
      const pending = (latest.matches || []).filter(m => !m.result);
      if (!pending.length) return;
      const observed = isTeacher ? pending : pending.filter(m => m.a === uid || m.b === uid);
      const needsResult = serverNow >= (latest.endsAt || Infinity) + 1800 || observed.some(m => [m.a, m.b].some(id => { const run = recent.find(r => r.uid === id); return run?.lost || (serverNow > (latest.startsAt || serverNow) + 25000 && (!run || serverNow - run.at > 25000)); }));
      if (!needsResult) return;
      finishing.current = true;
      try { await finishPuyo(cid, gid); } catch (e) { setError(message(e)); } finally { finishing.current = false; }
    };
    const timer = setInterval(() => void settle(), 3000);
    return () => clearInterval(timer);
  }, [cid, gid, game?.status]);

  const students = useMemo(() => members.filter(m => m.role === "student"), [members]);
  const onlineStudents = students.filter(m => online.some(p => p.uid === m.uid && p.online && now - p.at < 18000));
  const myMatch = config?.matches?.find(m => m.a === user?.uid || m.b === user?.uid);
  const remaining = config?.endsAt ? Math.max(0, Math.ceil((config.endsAt - now) / 1000)) : config?.durationSec || 0;
  const resting = config?.resting?.some(r => r.uid === user?.uid);
  const stage: FlowStage = game?.status === "done" ? "reward" : now < (config?.startsAt ?? 0) ? "ready" : "battle";
  async function act(task: () => Promise<unknown>) { setBusy(true); setError(""); try { await task(); } catch (e) { setError(message(e)); } finally { setBusy(false); } }

  if (loading || (user && member === undefined)) return <div className={styles.notice}><span className={styles.loadingDot}>✦</span><h1>친구들을 만나러 가는 중…</h1></div>;
  if (!configured || !user) return <div className={styles.notice}><Friend index={0} /><h1>학급 계정으로 입장해 주세요</h1><p>선생님과 같은 학급에 가입한 계정으로 로그인한 뒤<br />이 게임 링크를 다시 열어 주세요.</p><Link className={styles.primary} href="/">로그인하러 가기 →</Link></div>;
  if (!member) return <div className={styles.notice}><h1>이 학급의 구성원만 함께할 수 있어요</h1><p>{error || "학급에 가입한 계정인지 확인해 주세요."}</p><Link className={styles.secondary} href="/">내 학급으로 돌아가기</Link></div>;
  if (game === undefined) return <div className={styles.notice}><h1>게임방을 불러오고 있어요…</h1></div>;
  if (!game || game.kind !== "puyo" || !config) return <div className={styles.notice}><h1>게임방을 찾을 수 없어요</h1><p>링크 또는 게임방 접근 권한을 확인해 주세요.</p><Link className={styles.secondary} href={back}>학급으로 돌아가기</Link></div>;

  return <>
    <section className={styles.roomHeading}><div><span className={styles.eyebrow}>POCKET PUYO · CLASS BATTLE{(config.round ?? 1) > 1 && ` · ${config.round}번째 판`}</span><h1>{game.status === "draft" ? "친구들이 모이면, 시작!" : game.status === "done" ? "멋진 경기였어요!" : myMatch && !myMatch.result ? "나의 연쇄를 보여줄 시간" : "우리 반 포켓 배틀"}</h1><p>{game.status === "draft" ? teacher ? rules.pairing === "manual" ? "참가 학생을 체크하고, 짝을 직접 정한 뒤 시작해 주세요." : "참가 학생을 체크하고, 무작위 짝을 만든 뒤 시작해 주세요." : "선생님이 참가자를 확인하고 있어요. 곧 대결이 시작돼요!" : game.status === "done" ? "승부보다 멋졌던 도전! 친구들의 결과를 함께 확인해요." : "같은 색 네 개를 연결하고, 더 큰 연쇄에 도전해요."}</p></div><div className={styles.timer}><span>{game.status === "draft" ? "설정된 제한 시간" : game.status === "done" ? "경기 종료" : "남은 시간"}</span><strong>{game.status === "done" ? "FINISH" : timeLabel(remaining)}</strong></div></section>
    {error && <div className={styles.error} role="alert"><span>{error}</span><button onClick={() => setError("")} aria-label="알림 닫기">×</button></div>}
    {game.status === "draft" && <Lobby cid={cid} gid={gid} uid={user.uid} teacher={teacher} config={config} rules={rules} students={students} onlineStudents={onlineStudents} busy={busy} act={act} />}
    {(game.status === "play" || game.status === "done") && <>{myMatch ? <PuyoBattle cid={cid} gid={gid} uid={user.uid} config={config} runs={runs} clockOffset={clockOffset} /> : <div className={styles.spectatorBanner}><Friend index={1} /><div><strong>{game.status === "done" ? "모두 수고했어요!" : resting ? "이번 판은 쉬어요" : "지금은 응원 시간!"}</strong><p>{game.status === "done" ? "아래 대진표에서 우리 반 친구들의 경기 결과를 확인해요." : resting ? "참가 인원이 홀수라 이번 판은 응원해요. 다음 판에는 먼저 짝을 받아요!" : "우리 반 친구들이 대결하고 있어요. 점수와 결과가 실시간으로 보여요."}</p></div></div>}{game.status === "play" && <div className={styles.matchToolbar}><span className={styles.toolbarLeft}><a className={styles.secondary} href="#puyo-scoreboard">전체 대진표 보기 ↓</a><PuyoRulesButton rules={rules} current={stage} className={styles.secondary} /></span>{teacher && <button className={styles.dangerButton} disabled={busy} onClick={() => void act(async () => { finishing.current = true; try { await finishPuyo(cid, gid, true); } finally { finishing.current = false; } })}>{busy ? "결과 정리 중…" : "지금 종료하고 점수로 판정"}</button>}</div>}</>}
    {(game.status === "play" || game.status === "done") && <Scoreboard config={config} runs={runs} uid={user.uid} done={game.status === "done"} />}
    {game.status === "done" && <div className={styles.resultActions}>{teacher ? <div className={styles.resultButtons}>
      <button className={styles.primary} disabled={busy} onClick={() => void act(async () => { const next = await nextPuyoRound(cid, user.uid, game); router.replace(puyoUrl(cid, next)); })}>{busy ? "준비 중…" : "같은 규칙으로 한 판 더"}<span>↻</span></button>
      <button className={styles.secondary} disabled={busy} onClick={() => void act(async () => { await leavePuyoRoom(cid, gid); router.push(back); })}>마치고 학급으로</button>
    </div> : <Link className={styles.primary} href={back}>학급으로 돌아가기 →</Link>}<p>{teacher ? "한 판 더를 누르면 학생들도 새 대기실로 함께 이동해요. 지난 참가자는 미리 체크돼 있어요." : "선생님이 한 판 더를 시작하면 새 대기실로 자동으로 이동해요."}<br />경기 결과는 학급의 게임 이력에서 다시 볼 수 있어요.</p></div>}
  </>;
}

export default function PuyoRoom() {
  const params = useSearchParams();
  const cid = params.get("class") || "";
  const gid = params.get("game") || "";
  return <main className={styles.page}><div className={styles.container}><header className={styles.nav}><Link href="/puyo/" className={styles.brand}><span className={styles.brandIcon}>✦</span><span>POCKET <b>PUYO</b><small>우리 반 뿌요뿌요</small></span></Link><Link href="/" className={styles.homeLink}>러닝크루 <span>↗</span></Link></header>{cid && gid ? <ConnectedRoom key={`${cid}/${gid}`} cid={cid} gid={gid} /> : <Landing />}<footer className={styles.pageFooter}><span>POCKET PUYO</span><p>작은 뿌요, 커다란 즐거움.</p><span>MADE FOR OUR CLASS</span></footer></div></main>;
}
