"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { getMyRole, type Role } from "@/lib/classes";
import {
  stopLock,
  watchLock,
  watchPresent,
  watchSignal,
  type ActivityLock,
  type PresentState,
} from "@/lib/live";
import { MissionCelebrate } from "@/components/MissionCelebrate";
import { PresentOverlay } from "@/components/PresentOverlay";
import { useCelebrateQueue } from "@/components/useCelebrateQueue";
import { ActivityLockOverlay } from "@/components/ActivityLockOverlay";

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
  const { current: celebrate, enqueue, done } = useCelebrateQueue();
  const [lock, setLock] = useState<ActivityLock | null>(null);
  const [lockDismissed, setLockDismissed] = useState(false);
  const [present, setPresent] = useState<PresentState | null>(null);

  // 역할 확인 (멤버 여부 + 학생/교사). cid 가 없으면 파생값에서 무시되므로
  // 동기 초기화 없이 비동기 결과만 반영한다.
  useEffect(() => {
    if (!cid || !uid) return;
    let alive = true;
    getMyRole(cid, uid)
      .then((r) => alive && setRole(r))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [cid, uid]);

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

  // 학생만 잠금 대상. 만료(until) 처리는 오버레이의 onExpire 가 담당한다.
  const lockActive =
    !!cid && role === "student" && !lockDismissed && !!lock?.active;

  // 발표 모드: 전체 기본 효과(관람·잠금). 발표자로 지정된 본인만 무지개.
  const presentActive = !!cid && role === "student" && !!present?.active;
  const iAmPresenter = presentActive && present?.uid === uid;

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
                : "MISSION CLEAR"
          }
          lottieSrc={
            celebrate.kind === "level"
              ? "/Confetti.json"
              : celebrate.kind === "present"
                ? "/Sparkles%20Loop%20Loader%20ai.json"
                : "/mission-success.json"
          }
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
