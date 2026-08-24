"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import {
  getMemberProfile,
  watchMembers,
  type Member,
  type Role,
} from "@/lib/classes";
import {
  stopLock,
  watchClassApp,
  watchLock,
  watchPresent,
  watchSignal,
  type ActivityLock,
  type ClassAppControl,
  type PresentState,
} from "@/lib/live";
import { MissionCelebrate } from "@/components/MissionCelebrate";
import { PresentOverlay } from "@/components/PresentOverlay";
import { FocusLockOverlay } from "@/components/FocusLockOverlay";
import { LinkPushModal } from "@/components/LinkPushModal";
import { useCelebrateQueue } from "@/components/useCelebrateQueue";
import { ActivityLockOverlay } from "@/components/ActivityLockOverlay";
import { GameStudentStage } from "@/components/GameStudentStage";
import { QuizRunStudent } from "@/components/quizrun/QuizRunStudent";
import { GameStudentDock } from "@/components/GameStudentDock";
import { MyTurnIntro } from "@/components/MyTurnIntro";
import { TurnBanner } from "@/components/TurnBanner";
import { FeedbackWidget } from "@/components/FeedbackWidget";
import { FeedbackInboxFab } from "@/components/FeedbackInboxFab";
import {
  markCell,
  watchActiveGame,
  watchMySubmission,
  type Game,
  type GameSubmission,
} from "@/lib/games";

/**
 * 학급 페이지 어디서나 동작하는 실시간 수신기.
 * - 교사가 보낸 1회성 효과(미션완료/레벨업)를 받아 축하 연출
 * - 학급 전체 활동 잠금(Sandy 타이머)을 학생 화면에 표시
 * URL 의 ?class= / ?id= 로 현재 학급을 파악한다.
 */
function ClassLiveInner() {
  const { user } = useAuth();
  const params = useSearchParams();
  const cid = params.get("class") || params.get("id");
  const uid = user?.uid ?? null;

  const [role, setRole] = useState<Role | null>(null);
  const [myName, setMyName] = useState<string>("");
  const { current: celebrate, enqueue, done } = useCelebrateQueue();
  const [lock, setLock] = useState<ActivityLock | null>(null);
  const [lockDismissed, setLockDismissed] = useState(false);
  const [present, setPresent] = useState<PresentState | null>(null);
  const [classApp, setClassApp] = useState<ClassAppControl | null>(null);
  // 학생이 닫은 링크의 nonce — 새 링크(nonce 변경)면 다시 띄운다
  const [linkClosedNonce, setLinkClosedNonce] = useState<number | null>(null);
  const [game, setGame] = useState<Game | null>(null);
  const [mySub, setMySub] = useState<GameSubmission | null>(null);
  // 빙고 차례 알림: 멤버 맵(이름/아바타) + 내 차례 진입 인트로 트리거
  const [members, setMembers] = useState<Member[]>([]);
  const [turnIntroKey, setTurnIntroKey] = useState(0); // 0=숨김, >0=표시(rising-edge마다 증가)
  // 학생이 명시적으로 닫은 "단계 키" — 단계가 바뀌면 자동으로 다시 떠야 하므로
  // 단순 boolean 이 아니라 어떤 단계에서 닫았는지를 저장한다.
  const [dismissedStage, setDismissedStage] = useState<string | null>(null);

  // 역할 확인 (멤버 여부 + 학생/교사). cid 가 없으면 파생값에서 무시되므로
  // 동기 초기화 없이 비동기 결과만 반영한다.
  useEffect(() => {
    if (!cid || !uid) return;
    let alive = true;
    getMemberProfile(cid, uid)
      .then((p) => {
        if (!alive || !p) return;
        setRole(p.role);
        // 학급 표시 이름 우선(Auth displayName 이 비어도 정확). 둘 다 없으면 빈 문자열.
        setMyName(p.displayName || user?.displayName || "");
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [cid, uid, user?.displayName]);

  // 개별 효과 신호 구독 (최초 스냅샷은 무시 → 새 신호만 연출)
  const seenNonce = useRef<number | null>(null);
  useEffect(() => {
    seenNonce.current = null;
    if (!cid || !uid || !role) return;
    return watchSignal(cid, uid, (sig) => {
      if (!sig) return;
      if (seenNonce.current === null) {
        seenNonce.current = sig.nonce; // 페이지 진입 시 과거 신호 재생 방지
        return;
      }
      if (sig.nonce === seenNonce.current) return;
      seenNonce.current = sig.nonce;
      enqueue({ kind: sig.kind, title: sig.title, subtitle: sig.subtitle });
    });
  }, [cid, uid, role, enqueue]);

  // 활동 잠금 구독 — 새 잠금 스냅샷이 오면 이전의 로컬 해제 상태를 초기화
  useEffect(() => {
    if (!cid || !uid || !role) return;
    return watchLock(cid, (l) => {
      setLock(l);
      setLockDismissed(false);
    });
  }, [cid, uid, role]);

  // 교사 클라이언트가 만료 시각에 잠금 문서를 자동 해제 → 헤더/지각 학생 동기화.
  // (학생은 오버레이의 onExpire 로 즉시 풀리고, 문서는 교사가 정리한다.)
  useEffect(() => {
    if (role !== "teacher" || !cid) return;
    if (!lock?.active || lock.until == null) return;
    const ms = lock.until - Date.now();
    if (ms <= 0) {
      stopLock(cid).catch(() => {});
      return;
    }
    const t = setTimeout(() => stopLock(cid).catch(() => {}), ms);
    return () => clearTimeout(t);
  }, [role, cid, lock]);

  // 발표 모드 구독
  useEffect(() => {
    if (!cid || !uid || !role) return;
    return watchPresent(cid, setPresent);
  }, [cid, uid, role]);

  // 클래스앱 콘솔 제어(집중 잠금 + 링크 모달) 구독
  useEffect(() => {
    if (!cid || !uid || !role) return;
    return watchClassApp(cid, setClassApp);
  }, [cid, uid, role]);

  // 학급 게임(활성) 구독
  useEffect(() => {
    if (!cid || !uid || !role) return;
    return watchActiveGame(cid, (g) => {
      setGame(g);
      setDismissedStage(null); // 새 게임이 열리면 닫은 단계 기록 초기화
    });
  }, [cid, uid, role]);

  // 본인 제출 문서 구독 (활성 게임 있을 때만). game 이 사라지면 새로 구독하지
  // 않으므로 mySub 가 잠시 남아 있을 수 있으나 showJoin 이 !!game 로 가드한다.
  useEffect(() => {
    if (!cid || !uid || !game) return;
    return watchMySubmission(cid, game.id, uid, setMySub);
  }, [cid, uid, game]);

  // 빙고 차례 알림용 멤버 맵 — 게임 활성(존재) 시에만 구독(상시 읽기 비용 회피).
  useEffect(() => {
    if (!cid || !uid || role !== "student" || !game) {
      setMembers([]);
      return;
    }
    return watchMembers(cid, setMembers);
  }, [cid, uid, role, game]);
  const memberByUid = useMemo(() => {
    const m = new Map<string, Member>();
    members.forEach((x) => m.set(x.uid, x));
    return m;
  }, [members]);

  // 플레이 중 내 차례가 되면(다른 차례→내 차례) 최소화(닫기)했더라도 스테이지를
  // 자동으로 다시 띄운다. stageKey 만으로는 currentUid 변화를 못 잡으므로 별도 처리.
  // 같은 rising-edge 에서 "내 차례!" 인트로도 함께 띄운다(누가 차례인지 못 알아채는 문제 해결).
  const isMyBingoTurn =
    !!game && game.status === "play" && game.turn.currentUid === uid;
  const prevMyTurnRef = useRef(false);
  useEffect(() => {
    if (isMyBingoTurn && !prevMyTurnRef.current) {
      setDismissedStage(null);
      setTurnIntroKey((k) => k + 1); // 인트로 표시(연속 내 차례는 rising-edge 미발생 → 억제)
    }
    prevMyTurnRef.current = isMyBingoTurn;
  }, [isMyBingoTurn]);

  // 학생 자동 마크 — 스테이지(PlayPanel)를 닫아 둬도 항상 동작하도록 ClassLive 에 상주.
  // 호출된 단어가 내 보드에 있으면 자동 마크(멱등). 마크 갱신되면 다시 계산 → 수렴.
  const autoMarkRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (role !== "student" || !cid || !uid || !game) return;
    if (game.status !== "play") return;
    if (!mySub || !mySub.boardReady || mySub.status === "done") return;
    const called = new Set(game.turn.calledWords);
    const marked = new Set(mySub.marked);
    const pending = mySub.board.filter(
      (w): w is string => !!w && called.has(w) && !marked.has(w)
    );
    pending.forEach((w) => {
      if (autoMarkRef.current.has(w)) return;
      autoMarkRef.current.add(w);
      markCell(cid, game.id, uid, w)
        .catch(() => {})
        .finally(() => autoMarkRef.current.delete(w));
    });
  }, [role, cid, uid, game, mySub]);

  // 학생만 잠금 대상. 만료(until) 처리는 오버레이의 onExpire 가 담당한다.
  const lockActive =
    !!cid && role === "student" && !lockDismissed && !!lock?.active;

  // 발표 모드: 전체 기본 효과(관람·잠금). 발표자로 지정된 본인만 무지개.
  const presentActive = !!cid && role === "student" && !!present?.active;
  const iAmPresenter = presentActive && present?.uid === uid;

  // 클래스앱: 집중 잠금(학생만), 링크 모달(학생만, 닫은 nonce 아닐 때만)
  const focusActive = !!cid && role === "student" && !!classApp?.focusActive;
  const linkActive =
    !!cid &&
    role === "student" &&
    !!classApp?.linkActive &&
    !!classApp.linkUrl &&
    classApp.linkNonce !== linkClosedNonce;

  // 학급 게임 학생 스테이지 — 단계가 바뀌면 자동으로 다시 표시되도록 키로 비교
  const stageKey =
    game && uid
      ? `${game.id}:${game.status}:${mySub?.status ?? "none"}`
      : null;
  // status==="done" 이어도 스테이지를 띄워 결과 화면을 보여준다. 교사가 게임을
  // 완전히 종료(활성 포인터 해제)하면 game 이 null 이 되어 자동으로 사라진다.
  const showStudentStage =
    role === "student" &&
    !!cid &&
    !!uid &&
    !!game &&
    stageKey !== dismissedStage;

  return (
    <>
      {celebrate && (
        <MissionCelebrate
          key={`${celebrate.kind}:${celebrate.title}:${celebrate.subtitle ?? ""}`}
          title={celebrate.title}
          subtitle={celebrate.subtitle}
          kicker={
            celebrate.kind === "level"
              ? "LEVEL UP"
              : celebrate.kind === "present"
                ? "PRESENTATION"
                : celebrate.kind === "badge"
                  ? "BADGE GET!"
                  : celebrate.kind === "praise"
                    ? "칭찬 도착 💛"
                    : "MISSION CLEAR"
          }
          lottieSrc={
            celebrate.kind === "praise"
              ? "/rainbow_twist.json"
              : celebrate.kind === "level" || celebrate.kind === "badge"
                ? "/Confetti.json"
                : celebrate.kind === "present"
                  ? "/Sparkles%20Loop%20Loader%20ai.json"
                  : "/mission-success.json"
          }
          cover={celebrate.kind === "praise"}
          onDone={done}
        />
      )}
      {presentActive && (
        <PresentOverlay
          variant={iAmPresenter ? "presenter" : "audience"}
          name={present?.name}
          cheer={iAmPresenter ? present?.cheer : undefined}
        />
      )}
      {lockActive && !presentActive && (
        <ActivityLockOverlay
          until={lock!.until}
          onExpire={() => setLockDismissed(true)}
        />
      )}
      {focusActive && <FocusLockOverlay message={classApp?.focusMessage} />}
      {linkActive && classApp && (
        <LinkPushModal
          url={classApp.linkUrl}
          title={classApp.linkTitle}
          onClose={() => setLinkClosedNonce(classApp.linkNonce)}
        />
      )}
      {/* 퀴즈런은 3D — 브라우저 전용이라 SSR 을 끈 별도 진입 */}
      {showStudentStage && cid && uid && game?.kind === "quiz-run" && (
        <QuizRunStudent
          cid={cid}
          game={game}
          uid={uid}
          name={myName || user?.displayName || "이름없음"}
          onMinimize={() => setDismissedStage(stageKey)}
        />
      )}
      {showStudentStage && cid && uid && game && game.kind !== "quiz-run" && (
        <GameStudentStage
          cid={cid}
          game={game}
          uid={uid}
          name={myName || user?.displayName || "이름없음"}
          mySub={mySub}
          onMinimize={() => setDismissedStage(stageKey)}
        />
      )}
      {/* 학생이 명시적으로 닫았을 때 — 우하단 도크로 다시 진입(결과 단계 포함) */}
      {!showStudentStage && role === "student" && !!cid && !!uid && !!game && (
        <GameStudentDock
          game={game}
          mySub={mySub}
          onOpen={() => setDismissedStage(null)}
        />
      )}
      {/* 빙고: 지금 누구 차례인지 모두에게 알리는 상단 배너(플레이 중 상시) */}
      {role === "student" &&
        !!uid &&
        !!game &&
        game.status === "play" && (
          <TurnBanner
            currentUid={game.turn.currentUid}
            myUid={uid}
            memberByUid={memberByUid}
          />
        )}
      {/* 빙고: 내 차례가 막 돌아온 순간 "○○야, 네 차례!" 풀스크린 인트로(1.8초 자동) */}
      {role === "student" && turnIntroKey > 0 && (
        <MyTurnIntro
          key={turnIntroKey}
          name={myName || user?.displayName || ""}
          onDone={() => setTurnIntroKey(0)}
        />
      )}
      {/* 학생: 좌하단 오류·의견 보내기 버튼 (어느 학급 화면에서나) */}
      {role === "student" && !!cid && !!uid && (
        <FeedbackWidget cid={cid} uid={uid} name={myName} side="left" />
      )}
      {/* 교사: 좌하단 피드백 받은함 버튼 (어느 학급 화면에서나) */}
      {role === "teacher" && !!cid && <FeedbackInboxFab cid={cid} />}
    </>
  );
}

export function ClassLive() {
  const { user } = useAuth();
  if (!user) return null;
  return (
    <Suspense fallback={null}>
      <ClassLiveInner />
    </Suspense>
  );
}
