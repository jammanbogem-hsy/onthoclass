"use client";

// 5단원 4차시 "Welcome to Our Town" — 우리 동네 감정 지도.
//  · 핀 찍기: 카카오맵을 눌러 ①어떤 곳 ②할 수 있는 일 ③감정을 모달로 입력 (학생당 최대 5핀)
//  · 우리 반 지도: 반 전체 핀 + 감정 히트맵 + 군집 히트맵 + 자동 인사이트
//  · 내 점수: 핀 점수 → 러닝크루 경험치(XP) 요청
//  · 교사: 서로 보기 토글, 참여 현황, 차시 '수업 후 결과물'로 보내기
// 러닝크루 연결: 5-3과 같은 학교(NEIS 검색)+반 식별 → engActivities/54/* 에 저장.
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { MissionCelebrate } from "@/components/MissionCelebrate";
import { searchSchools, type School } from "@/lib/schools";
import { listMyClasses } from "@/lib/classes";
import { createQuestion, listLessons, type Lesson } from "@/lib/lessons";
import { getMyXpRequest, requestClassXp, type XpRequest } from "@/lib/xp";
import {
  addComment,
  createPin,
  deleteComment,
  deletePin,
  getPlayerPrefill,
  getTownPlayer,
  saveTownPlayer,
  setReaction,
  setShareSetting,
  updatePin,
  watchClassPins,
  watchComments,
  watchMyPins,
  watchReactions,
  watchSchoolPins,
  watchShareSetting,
} from "@/lib/engTownPins";
import {
  CATEGORIES,
  CATEGORY_BY_ID,
  CLASS_NOS,
  EMOTIONS,
  EMOTION_BY_ID,
  MAX_PINS,
  PLACE_TYPE_BY_ID,
  POINTS_PER_PIN,
  REACTIONS,
  avatarFromUid,
  pinSentence,
  type PinComment,
  type Player,
  type TownPin,
} from "./types";
import { PlaceSearch, TownMap, locateSchool, type MapMode, type PlaceHit } from "./KakaoMap";
import { PinModal, type PinDraft } from "./PinModal";
import { InsightsPanel } from "./Insights";

type Tab = "pin" | "class" | "score" | "teacher";

const ACTIVITY_KEY = "eng/54";
const ACTIVITY_LABEL = "우리 동네 감정 지도";

export default function Eng54Page() {
  const { user, profile } = useAuth();
  const isTeacher = profile?.role === "teacher";
  const [tab, setTab] = useState<Tab>("pin");
  const [player, setPlayer] = useState<Player | null | "loading">("loading");
  const [prefill, setPrefill] = useState<Player | null>(null);
  const [editingIdentity, setEditingIdentity] = useState(false);

  // 결과물 링크(?tab=class)로 들어온 경우 해당 탭에서 시작
  useEffect(() => {
    try {
      const t = new URLSearchParams(window.location.search).get("tab");
      if (t === "class" || t === "score" || t === "pin") setTab(t);
    } catch {}
  }, []);

  useEffect(() => {
    if (!user) {
      setPlayer(null);
      return;
    }
    setPlayer("loading");
    getTownPlayer(user.uid)
      .then(async (p) => {
        if (!p) {
          // 5-3 길찾기에서 식별한 학교·반이 있으면 미리 채움
          const pre = await getPlayerPrefill(user.uid).catch(() => null);
          setPrefill(pre);
        }
        setPlayer(p);
      })
      .catch(() => setPlayer(null));
  }, [user]);

  // 학교 위치 → 지도 초기 중심 (탭 공유)
  const [center, setCenter] = useState<{ lat: number; lng: number } | null>(null);
  const schoolName = player !== "loading" && player ? player.schoolName : "";
  useEffect(() => {
    if (!schoolName) return;
    let alive = true;
    locateSchool(schoolName).then((pos) => {
      if (alive && pos) setCenter(pos);
    });
    return () => {
      alive = false;
    };
  }, [schoolName]);

  const needIdentity =
    !!user && player !== "loading" && (player === null || editingIdentity);

  return (
    <main className="min-h-screen overflow-x-clip bg-[var(--md-sys-color-surface)] px-4 py-6">
      <div className="mx-auto max-w-2xl">
        <header className="relative mb-4 text-center">
          {/* 로그인한 학생 본인 프로필 — 러닝크루와 같은 세션이라 자동 인식 */}
          {user && (
            <div className="absolute right-0 top-0 flex items-center gap-1.5 rounded-full bg-[var(--md-sys-color-surface-container)] py-1 pl-1 pr-3">
              {profile?.avatar || profile?.photoURL || user.photoURL ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={profile?.avatar || profile?.photoURL || user.photoURL || ""}
                  referrerPolicy="no-referrer"
                  alt=""
                  className="h-6 w-6 rounded-full object-cover"
                />
              ) : (
                <span className="emoji-noto text-base leading-none">
                  {avatarFromUid(user.uid)}
                </span>
              )}
              <span className="max-w-[110px] truncate text-xs font-bold text-[var(--md-sys-color-on-surface)]">
                {profile?.name || user.displayName || "나"}
              </span>
            </div>
          )}
          <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
            6학년 5단원 4차시 · Welcome to Hanok Town
          </p>
          <h1 className="text-2xl font-bold text-[var(--md-sys-color-on-surface)]">
            <span className="emoji-noto">🗺️</span> 우리 동네 감정 지도
          </h1>
          {player && player !== "loading" && !needIdentity && (
            <p className="mt-1 flex items-center justify-center gap-2 text-xs font-semibold text-[var(--md-sys-color-primary)]">
              {player.schoolName} · 6학년 {player.classNo}반
              <button
                onClick={() => setEditingIdentity(true)}
                className="rounded-full border border-[var(--md-sys-color-outline-variant)] px-2 py-0.5 text-[11px] font-medium text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container-high)]"
                title="다른 학급으로 바꾸기"
              >
                학급 바꾸기
              </button>
            </p>
          )}
        </header>

        {user && player === "loading" ? (
          <p className="py-16 text-center text-sm text-[var(--md-sys-color-on-surface-variant)]">
            불러오는 중…
          </p>
        ) : needIdentity ? (
          <IdentityForm
            uid={user!.uid}
            initial={player ?? prefill}
            onCancel={player ? () => setEditingIdentity(false) : undefined}
            onDone={(p) => {
              setPlayer(p);
              setEditingIdentity(false);
            }}
          />
        ) : (
          <>
            <nav
              className={`mb-5 grid gap-1 rounded-full bg-[var(--md-sys-color-surface-container)] p-1 ${
                isTeacher ? "grid-cols-4" : "grid-cols-3"
              }`}
            >
              {(
                [
                  ["pin", "핀 찍기"],
                  ["class", "우리 반 지도"],
                  ["score", "내 점수"],
                  ...(isTeacher ? [["teacher", "교사"] as [Tab, string]] : []),
                ] as [Tab, string][]
              ).map(([t, label]) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={[
                    "rounded-full py-2 text-sm font-medium transition",
                    tab === t
                      ? "bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)]"
                      : "text-[var(--md-sys-color-on-surface-variant)]",
                  ].join(" ")}
                >
                  {label}
                </button>
              ))}
            </nav>

            {player !== "loading" && player && user ? (
              <>
                {tab === "pin" && (
                  <PinTab
                    uid={user.uid}
                    photoURL={user.photoURL ?? ""}
                    player={player}
                    center={center}
                    isTeacher={isTeacher}
                  />
                )}
                {tab === "class" && (
                  <ClassTab
                    uid={user.uid}
                    photoURL={user.photoURL ?? ""}
                    player={player}
                    center={center}
                    isTeacher={isTeacher}
                  />
                )}
                {tab === "score" && <ScoreTab uid={user.uid} />}
                {tab === "teacher" && isTeacher && (
                  <TeacherTab player={player} uid={user.uid} />
                )}
              </>
            ) : tab === "pin" ? (
              <PreviewPinTab />
            ) : (
              <PreviewNotice />
            )}
          </>
        )}
      </div>
    </main>
  );
}

/** 지도용 풀블리드 래퍼 — 본문 컨테이너(max-w-2xl)를 벗어나 화면 좌우 끝까지 넓힌다.
 *  main 에 overflow-x-clip 이 있어 스크롤바 폭만큼의 가로 넘침은 잘려서 안전. */
function Bleed({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative left-1/2 w-screen -translate-x-1/2 px-3 sm:px-6">
      {children}
    </div>
  );
}

/** 개발 미리보기(비로그인) 안내 */
function PreviewNotice() {
  return (
    <p className="rounded-2xl bg-[var(--md-sys-color-surface-container-high)] p-6 text-center text-sm text-[var(--md-sys-color-on-surface-variant)]">
      🔧 개발 미리보기에서는 로그인이 없어 이 탭의 핀 데이터를 불러올 수 없어요.
      <br />
      ‘핀 찍기’ 탭에서 지도와 입력 모달은 그대로 확인할 수 있습니다.
    </p>
  );
}

/** 개발 미리보기(비로그인) — 지도·검색·입력 모달 UI 만 체험(저장 안 됨) */
function PreviewPinTab() {
  const [draft, setDraft] = useState<{ lat: number; lng: number } | null>(null);
  const [presetName, setPresetName] = useState("");
  const [panTo, setPanTo] = useState<{ lat: number; lng: number; ts: number } | null>(null);
  const [searchSpot, setSearchSpot] = useState<{ lat: number; lng: number } | null>(null);
  const [tried, setTried] = useState(false);
  const [celebrate, setCelebrate] = useState<string | null>(null);
  useEffect(() => {
    if (!celebrate) return;
    const t = setTimeout(() => setCelebrate(null), 2600);
    return () => clearTimeout(t);
  }, [celebrate]);
  return (
    <div>
      <div className="mb-3 rounded-2xl bg-[var(--md-sys-color-surface-container-high)] p-4">
        <p className="text-sm font-bold text-[var(--md-sys-color-on-surface)]">
          <span className="emoji-noto">📌</span> 지도를 누르거나 장소를 검색해 핀 입력을 미리
          볼 수 있어요
        </p>
        <p className="mt-1 text-xs leading-relaxed text-[var(--md-sys-color-on-surface-variant)]">
          로그인하면 학교·반을 선택하고 진짜 핀을 꽂을 수 있어요(저장은 미리보기에서 동작하지
          않아요).
        </p>
      </div>
      <div className="mb-2">
        <PlaceSearch
          onPick={(hit) => {
            setDraft(null);
            setPanTo({ lat: hit.lat, lng: hit.lng, ts: Date.now() });
            setSearchSpot({ lat: hit.lat, lng: hit.lng });
            setPresetName(hit.name);
          }}
        />
      </div>
      {searchSpot && !draft && (
        <p className="mb-2 rounded-xl bg-[var(--md-sys-color-secondary-container)] px-3 py-2 text-xs font-semibold text-[var(--md-sys-color-on-secondary-container)]">
          <span className="emoji-noto">📍</span> 찾은 위치를 지도에 표시했어요. 핀을 꽂을 곳을
          직접 눌러 주세요!
        </p>
      )}
      <Bleed>
        <TownMap
          pins={[]}
          mode="pins"
          tempPin={draft ?? searchSpot}
          panTo={panTo}
          onMapClick={(lat, lng) => {
            setSearchSpot(null);
            setDraft({ lat, lng });
          }}
          className="h-[62vh] min-h-[460px]"
        />
      </Bleed>
      {tried && (
        <p className="mt-2 rounded-xl bg-[var(--md-sys-color-secondary-container)] px-3 py-2 text-xs font-semibold text-[var(--md-sys-color-on-secondary-container)]">
          🔧 미리보기에서는 저장되지 않아요. 로그인하면 핀이 우리 반 지도에 저장돼요.
        </p>
      )}
      <PinModal
        open={!!draft}
        initial={null}
        presetName={presetName}
        busy={false}
        onSave={(d) => {
          setDraft(null);
          setPresetName("");
          setTried(true);
          setCelebrate(pinSentence(d.placeType, d.canDo, d.emotion, d.category));
        }}
        onClose={() => {
          setDraft(null);
          setPresetName("");
        }}
      />

      {celebrate && (
        <MissionCelebrate
          title="핀을 꽂았어요!"
          subtitle={celebrate}
          kicker="NICE PIN!"
          onDone={() => setCelebrate(null)}
        />
      )}
    </div>
  );
}

/** 시작 전(또는 학급 바꾸기) 식별 — 학교(NEIS 검색) + 6학년 반. 5-3에서 식별했다면 미리 채워짐. */
function IdentityForm({
  uid,
  initial,
  onDone,
  onCancel,
}: {
  uid: string;
  initial?: Player | null;
  onDone: (p: Player) => void;
  onCancel?: () => void;
}) {
  const [query, setQuery] = useState(initial?.schoolName ?? "");
  const [results, setResults] = useState<School[]>([]);
  const [school, setSchool] = useState(initial?.schoolName ?? "");
  const [classNo, setClassNo] = useState(initial?.classNo ?? 0);
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2 || q === school) {
      setResults([]);
      return;
    }
    let alive = true;
    setSearching(true);
    const t = setTimeout(() => {
      searchSchools(q)
        .then((r) => {
          if (alive) setResults(r);
        })
        .finally(() => {
          if (alive) setSearching(false);
        });
    }, 300);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [query, school]);

  async function start() {
    const name = school.trim() || query.trim();
    if (!name || !classNo || busy) return;
    setBusy(true);
    try {
      await saveTownPlayer(uid, name, classNo);
      onDone({ uid, schoolName: name, classNo });
    } catch {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-3xl bg-[var(--md-sys-color-surface-container)] p-6">
      <p className="mb-1 text-center text-base font-bold">
        {onCancel ? "학급 바꾸기" : "시작하기 전에"}
      </p>
      <p className="mb-5 text-center text-sm text-[var(--md-sys-color-on-surface-variant)]">
        학교와 우리 반을 선택해 주세요. 지도가 우리 학교 근처에서 시작돼요.
      </p>

      <label className="mb-1 block text-sm font-semibold">학교</label>
      <input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setSchool("");
        }}
        placeholder="학교 이름을 검색하세요 (예: 서울… 초등학교)"
        className="m3-field w-full"
      />
      {searching && (
        <p className="mt-1 text-xs text-[var(--md-sys-color-on-surface-variant)]">검색 중…</p>
      )}
      {results.length > 0 && (
        <ul className="mt-1 max-h-44 overflow-y-auto rounded-xl border border-[var(--md-sys-color-outline-variant)]">
          {results.map((s, i) => (
            <li key={i}>
              <button
                type="button"
                onClick={() => {
                  setSchool(s.name);
                  setQuery(s.name);
                  setResults([]);
                }}
                className="flex w-full flex-col items-start px-3 py-2 text-left hover:bg-[var(--md-sys-color-surface-container-high)]"
              >
                <span className="text-sm font-medium">{s.name}</span>
                <span className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
                  {s.address}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {school && (
        <p className="mt-1 text-xs font-semibold text-[var(--md-sys-color-primary)]">
          ✓ {school}
        </p>
      )}

      <label className="mb-1 mt-4 block text-sm font-semibold">우리 반 (6학년)</label>
      <div className="flex flex-wrap gap-1.5">
        {CLASS_NOS.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setClassNo(n)}
            className={[
              "h-10 w-12 rounded-xl text-sm font-bold transition",
              classNo === n
                ? "bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)]"
                : "bg-[var(--md-sys-color-surface-container-highest)] text-[var(--md-sys-color-on-surface-variant)]",
            ].join(" ")}
          >
            {n}반
          </button>
        ))}
      </div>

      <div className="mt-6 flex gap-2">
        {onCancel && (
          <button
            onClick={onCancel}
            className="rounded-full border border-[var(--md-sys-color-outline)] px-5 py-3 text-base font-bold text-[var(--md-sys-color-on-surface-variant)]"
          >
            취소
          </button>
        )}
        <button
          onClick={start}
          disabled={(!school && query.trim().length < 2) || !classNo || busy}
          className="flex-1 rounded-full bg-[var(--md-sys-color-primary)] px-6 py-3 text-base font-bold text-[var(--md-sys-color-on-primary)] transition hover:brightness-105 disabled:opacity-40"
        >
          {busy ? "저장 중…" : onCancel ? "이 학급으로 이동 →" : "시작하기 →"}
        </button>
      </div>
    </div>
  );
}

/** 핀 반응(공감 이모지) + 댓글 — 핀 상세 카드 하단 */
function PinSocial({
  pin,
  uid,
  myPhotoURL,
  canModerate,
}: {
  pin: TownPin;
  uid: string;
  myPhotoURL: string;
  canModerate: boolean; // 교사 — 남의 댓글도 삭제 가능
}) {
  const [reactions, setReactions] = useState<Record<string, string>>({});
  const [comments, setComments] = useState<PinComment[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => watchReactions(pin.id, setReactions), [pin.id]);
  useEffect(() => watchComments(pin.id, setComments), [pin.id]);

  const myReaction = reactions[uid] ?? null;
  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    Object.values(reactions).forEach((r) => (m[r] = (m[r] ?? 0) + 1));
    return m;
  }, [reactions]);

  async function toggle(rid: string) {
    await setReaction(pin.id, uid, myReaction === rid ? null : rid).catch(() => {});
  }

  async function send() {
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true);
    try {
      await addComment(pin.id, uid, t, myPhotoURL);
      setText("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-2">
      {/* 반응 바 */}
      <div className="flex flex-wrap gap-1.5">
        {REACTIONS.map((r) => {
          const on = myReaction === r.id;
          const n = counts[r.id] ?? 0;
          return (
            <button
              key={r.id}
              onClick={() => toggle(r.id)}
              title={r.ko}
              className={[
                "flex items-center gap-1 rounded-full border px-2.5 py-1 text-sm transition",
                on
                  ? "border-[var(--md-sys-color-primary)] bg-[var(--md-sys-color-primary-container)] font-bold"
                  : "border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)]",
              ].join(" ")}
            >
              <span className="emoji-noto leading-none">{r.emoji}</span>
              <span
                className={
                  on
                    ? "text-xs text-[var(--md-sys-color-on-primary-container)]"
                    : "text-xs text-[var(--md-sys-color-on-surface-variant)]"
                }
              >
                {r.ko}
                {n > 0 ? ` ${n}` : ""}
              </span>
            </button>
          );
        })}
      </div>

      {/* 댓글 */}
      {comments.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1.5">
          {comments.map((c) => (
            <li key={c.id} className="flex items-start gap-2">
              {c.photoURL ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={c.photoURL}
                  referrerPolicy="no-referrer"
                  alt=""
                  className="mt-0.5 h-6 w-6 shrink-0 rounded-full object-cover"
                />
              ) : (
                <span className="emoji-noto mt-0.5 text-lg leading-none">
                  {avatarFromUid(c.uid)}
                </span>
              )}
              <p className="min-w-0 flex-1 rounded-xl bg-[var(--md-sys-color-surface)] px-3 py-1.5 text-[13px] leading-relaxed text-[var(--md-sys-color-on-surface)]">
                {c.text}
              </p>
              {(c.uid === uid || canModerate) && (
                <button
                  onClick={() => deleteComment(pin.id, c.id).catch(() => {})}
                  className="mt-1 shrink-0 text-xs text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-error)]"
                  title="댓글 삭제"
                >
                  ✕
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* 댓글 입력 */}
      <div className="mt-2 flex items-center gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, 200))}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) send();
          }}
          placeholder="따뜻한 댓글을 남겨 보세요 💬"
          className="m3-field flex-1 !py-2 text-sm"
        />
        <button
          onClick={send}
          disabled={!text.trim() || busy}
          className="shrink-0 rounded-full bg-[var(--md-sys-color-primary)] px-4 py-2 text-sm font-bold text-[var(--md-sys-color-on-primary)] disabled:opacity-40"
        >
          남기기
        </button>
      </div>
    </div>
  );
}

/** 핀 상세 카드(지도 아래) — 반응·댓글 포함. 다른 친구 핀은 읽기 전용, 교사는 삭제 가능 */
function PinInfoCard({
  pin,
  mine,
  canDelete,
  uid,
  myPhotoURL,
  onEdit,
  onDelete,
  onClose,
}: {
  pin: TownPin;
  mine: boolean;
  canDelete: boolean;
  uid: string;
  myPhotoURL: string;
  onEdit?: () => void;
  onDelete?: () => void;
  onClose: () => void;
}) {
  const e = EMOTION_BY_ID[pin.emotion];
  const t = PLACE_TYPE_BY_ID[pin.placeType];
  const cat = CATEGORY_BY_ID[pin.category] ?? CATEGORY_BY_ID.visited;
  return (
    <div className="mt-2 rounded-2xl border-2 bg-[var(--md-sys-color-surface-container)] p-4" style={{ borderColor: cat.color }}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          {pin.photoURL ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={pin.photoURL}
              referrerPolicy="no-referrer"
              alt=""
              className="h-9 w-9 shrink-0 rounded-full border-2 border-white object-cover shadow"
            />
          ) : (
            <span className="emoji-noto text-3xl leading-none">{avatarFromUid(pin.creatorUid)}</span>
          )}
          <span className="emoji-noto text-3xl leading-none">{e?.emoji}</span>
          <div>
            <p className="text-sm font-bold text-[var(--md-sys-color-on-surface)]">
              <span className="emoji-noto">{t?.emoji}</span> {pin.placeName}
            </p>
            <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
              {mine ? "내 핀" : "친구 핀"} ·{" "}
              <b style={{ color: cat.color }}>
                <span className="emoji-noto">{cat.emoji}</span> {cat.ko}
              </b>{" "}
              · {e?.ko}
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="rounded-full px-2 py-0.5 text-sm text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container-high)]"
        >
          ✕
        </button>
      </div>
      <p className="mt-2 rounded-xl bg-[var(--md-sys-color-surface-container-high)] px-3 py-2 text-[13px] font-medium leading-relaxed text-[var(--md-sys-color-on-surface)]">
        {pinSentence(pin.placeType, pin.canDo, pin.emotion, pin.category)}
      </p>
      {pin.memory && (
        <p className="mt-1.5 rounded-xl bg-[var(--md-sys-color-tertiary-container)] px-3 py-2 text-[13px] leading-relaxed text-[var(--md-sys-color-on-tertiary-container)]">
          <span className="emoji-noto">{pin.category === "wish" ? "💭" : "📖"}</span>{" "}
          {pin.memory}
        </p>
      )}
      <PinSocial pin={pin} uid={uid} myPhotoURL={myPhotoURL} canModerate={canDelete} />
      {(mine || canDelete) && (
        <div className="mt-2 flex justify-end gap-2">
          {mine && onEdit && (
            <button
              onClick={onEdit}
              className="rounded-full bg-[var(--md-sys-color-primary)] px-4 py-1.5 text-xs font-bold text-[var(--md-sys-color-on-primary)]"
            >
              고치기
            </button>
          )}
          {canDelete && onDelete && (
            <button
              onClick={onDelete}
              className="rounded-full border border-[var(--md-sys-color-error)] px-4 py-1.5 text-xs font-bold text-[var(--md-sys-color-error)]"
            >
              삭제
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────── 핀 찍기 탭 ───────────────────────────

function PinTab({
  uid,
  photoURL,
  player,
  center,
  isTeacher,
}: {
  uid: string;
  photoURL: string;
  player: Player;
  center: { lat: number; lng: number } | null;
  isTeacher: boolean;
}) {
  const [myPins, setMyPins] = useState<TownPin[]>([]);
  const [classPins, setClassPins] = useState<TownPin[]>([]);
  const [shareOn, setShareOn] = useState(true);
  const [denied, setDenied] = useState(false);
  const [draft, setDraft] = useState<{ lat: number; lng: number } | null>(null);
  const [editing, setEditing] = useState<TownPin | null>(null);
  const [viewPin, setViewPin] = useState<TownPin | null>(null);
  const [presetName, setPresetName] = useState("");
  const [panTo, setPanTo] = useState<{ lat: number; lng: number; ts: number } | null>(null);
  // 검색으로 찾은 위치 — 먼저 지도에 띄워 보여주고, 학생이 클릭하면 그때 입력 모달
  const [searchSpot, setSearchSpot] = useState<{ lat: number; lng: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  // 핀 꽂기 성공 축하 모션 — 만든 영어 문장을 담아 띄운다(잠시 후 자동 닫힘)
  const [celebrate, setCelebrate] = useState<string | null>(null);
  useEffect(() => {
    if (!celebrate) return;
    const t = setTimeout(() => setCelebrate(null), 2600);
    return () => clearTimeout(t);
  }, [celebrate]);

  useEffect(() => watchMyPins(uid, setMyPins), [uid]);
  useEffect(
    () => watchShareSetting(player.schoolName, player.classNo, setShareOn),
    [player.schoolName, player.classNo]
  );
  // 서로 보기 켜짐(또는 교사) → 반 전체 핀도 함께 표시
  useEffect(() => {
    setDenied(false);
    if (!shareOn && !isTeacher) {
      setClassPins([]);
      return;
    }
    return watchClassPins(
      player.schoolName,
      player.classNo,
      setClassPins,
      () => setDenied(true)
    );
  }, [player.schoolName, player.classNo, shareOn, isTeacher]);

  const pins = useMemo(() => {
    if ((!shareOn && !isTeacher) || denied) return myPins;
    // 반 핀에 내 핀이 아직 반영 안 된 순간을 대비해 합집합
    const map = new Map(classPins.map((p) => [p.id, p]));
    myPins.forEach((p) => map.set(p.id, p));
    return Array.from(map.values());
  }, [shareOn, isTeacher, denied, classPins, myPins]);

  function onMapClick(lat: number, lng: number) {
    setViewPin(null);
    if (myPins.length >= MAX_PINS) {
      setMsg(`핀은 한 사람당 ${MAX_PINS}개까지 꽂을 수 있어요. 기존 핀을 고치거나 삭제해 보세요.`);
      return;
    }
    setMsg(null);
    setEditing(null);
    setSearchSpot(null);
    setDraft({ lat, lng });
  }

  // 장소 검색에서 선택 → 먼저 지도를 그 위치로 이동해 보여주기만 한다.
  // 핀은 학생이 지도를 직접 클릭할 때 꽂는다(검색한 이름은 모달에 미리 채움).
  function onSearchPick(hit: PlaceHit) {
    setViewPin(null);
    setMsg(null);
    setEditing(null);
    setDraft(null);
    setPanTo({ lat: hit.lat, lng: hit.lng, ts: Date.now() });
    setSearchSpot({ lat: hit.lat, lng: hit.lng });
    setPresetName(hit.name);
  }

  async function save(d: PinDraft) {
    if (busy) return;
    setBusy(true);
    setMsg(null);
    try {
      if (editing) {
        await updatePin(
          editing.id,
          uid,
          player,
          { ...d, lat: editing.lat, lng: editing.lng },
          photoURL
        );
      } else if (draft) {
        await createPin(uid, player, { ...d, ...draft }, photoURL);
        setCelebrate(pinSentence(d.placeType, d.canDo, d.emotion, d.category));
      }
      setDraft(null);
      setEditing(null);
      setPresetName("");
      setSearchSpot(null);
    } catch (e) {
      console.error("핀 저장 실패", e);
      setMsg("핀을 저장하지 못했어요. 인터넷 상태를 확인하고 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  async function removeEditing() {
    if (!editing || busy) return;
    setBusy(true);
    try {
      await deletePin(editing.id);
      setEditing(null);
    } catch {
      setMsg("핀을 삭제하지 못했어요.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="mb-3 rounded-2xl bg-[var(--md-sys-color-surface-container-high)] p-4">
        <p className="text-sm font-bold text-[var(--md-sys-color-on-surface)]">
          <span className="emoji-noto">📌</span> 우리 동네에서 좋아하는 곳, 자주 가는 곳에 핀을 꽂아요
        </p>
        <p className="mt-1 text-xs leading-relaxed text-[var(--md-sys-color-on-surface-variant)]">
          지도를 <b>꾹 눌러(클릭해)</b> 핀을 꽂고, 그곳이 어떤 곳인지·무엇을 할 수 있는지·어떤
          기분이 드는지 알려 주세요. <br />
          교과서처럼 말해 봐요 — <i>There is a park in our town. You can see Talchum there.</i>
        </p>
      </div>

      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs font-semibold">
        <span className="flex items-center gap-3 text-[var(--md-sys-color-on-surface-variant)]">
          <span>
            내 핀{" "}
            <b className="text-[var(--md-sys-color-primary)]">
              {myPins.length}/{MAX_PINS}
            </b>
          </span>
          {CATEGORIES.map((c) => (
            <span key={c.id} className="flex items-center gap-1">
              <span className="h-3 w-3 rounded-full" style={{ background: c.color }} />
              {c.ko}
            </span>
          ))}
        </span>
        <span
          className={[
            "rounded-full px-2.5 py-1",
            shareOn
              ? "bg-[var(--md-sys-color-tertiary-container)] text-[var(--md-sys-color-on-tertiary-container)]"
              : "bg-[var(--md-sys-color-surface-container-highest)] text-[var(--md-sys-color-on-surface-variant)]",
          ].join(" ")}
        >
          {shareOn ? "👀 친구 핀 함께 보기 중" : "🔒 내 핀만 보여요"}
        </span>
      </div>

      <div className="mb-2">
        <PlaceSearch near={center} onPick={onSearchPick} />
      </div>

      {searchSpot && !draft && (
        <p className="mb-2 rounded-xl bg-[var(--md-sys-color-secondary-container)] px-3 py-2 text-xs font-semibold text-[var(--md-sys-color-on-secondary-container)]">
          <span className="emoji-noto">📍</span> 찾은 위치를 지도에 표시했어요. 핀을 꽂을 곳을
          직접 눌러 주세요!
        </p>
      )}

      <Bleed>
        <TownMap
          pins={pins}
          mode="pins"
          myUid={uid}
          tempPin={draft ?? searchSpot}
          center={center}
          panTo={panTo}
          onMapClick={onMapClick}
          onPinClick={(p) => {
            if (p.creatorUid === uid) {
              setEditing(p);
              setDraft(null);
            } else {
              setViewPin(p);
            }
          }}
          className="h-[62vh] min-h-[460px]"
        />
      </Bleed>

      {msg && (
        <p className="mt-2 rounded-xl bg-[var(--md-sys-color-error-container)] px-3 py-2 text-xs font-semibold text-[var(--md-sys-color-on-error-container)]">
          {msg}
        </p>
      )}

      {viewPin && (
        <PinInfoCard
          pin={viewPin}
          mine={false}
          canDelete={isTeacher}
          uid={uid}
          myPhotoURL={photoURL}
          onDelete={async () => {
            await deletePin(viewPin.id).catch(() => {});
            setViewPin(null);
          }}
          onClose={() => setViewPin(null)}
        />
      )}

      {/* 내 핀 목록 */}
      {myPins.length > 0 && (
        <div className="mt-3 flex flex-col gap-1.5">
          {myPins.map((p) => {
            const e = EMOTION_BY_ID[p.emotion];
            const t = PLACE_TYPE_BY_ID[p.placeType];
            const c = CATEGORY_BY_ID[p.category] ?? CATEGORY_BY_ID.visited;
            return (
              <button
                key={p.id}
                onClick={() => setEditing(p)}
                className="flex items-center gap-2 rounded-xl bg-[var(--md-sys-color-surface-container)] px-3 py-2 text-left hover:bg-[var(--md-sys-color-surface-container-high)]"
              >
                <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: c.color }} />
                <span className="emoji-noto text-xl leading-none">{e?.emoji}</span>
                <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-[var(--md-sys-color-on-surface)]">
                  <span className="emoji-noto">{t?.emoji}</span> {p.placeName}
                </span>
                <span className="shrink-0 text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
                  고치기 ›
                </span>
              </button>
            );
          })}
        </div>
      )}

      <PinModal
        open={!!draft || !!editing}
        initial={editing}
        presetName={presetName}
        busy={busy}
        onSave={save}
        onDelete={editing ? removeEditing : undefined}
        onClose={() => {
          setDraft(null);
          setEditing(null);
          setPresetName("");
          setSearchSpot(null);
        }}
      />

      {celebrate && (
        <MissionCelebrate
          title="핀을 꽂았어요!"
          subtitle={celebrate}
          kicker="NICE PIN!"
          onDone={() => setCelebrate(null)}
        />
      )}
    </div>
  );
}

// ─────────────────────────── 우리 반 지도 탭 ───────────────────────────

type HeatFilter = "all" | "pos" | "neg" | string;

function ClassTab({
  uid,
  photoURL,
  player,
  center,
  isTeacher,
}: {
  uid: string;
  photoURL: string;
  player: Player;
  center: { lat: number; lng: number } | null;
  isTeacher: boolean;
}) {
  const [pins, setPins] = useState<TownPin[]>([]);
  const [shareOn, setShareOn] = useState(true);
  const [denied, setDenied] = useState(false);
  const [mode, setMode] = useState<MapMode>("pins");
  const [heatFilter, setHeatFilter] = useState<HeatFilter>("all");
  const [viewPin, setViewPin] = useState<TownPin | null>(null);
  const [fitKey, setFitKey] = useState(0);
  // 교사 전용 — 학교 전체 핀(합본/반별 비교). "mine"=내 반, "all"=전체 합본, 숫자=해당 반
  const [schoolPins, setSchoolPins] = useState<TownPin[]>([]);
  const [classFilter, setClassFilter] = useState<"mine" | "all" | number>("mine");

  useEffect(
    () => watchShareSetting(player.schoolName, player.classNo, setShareOn),
    [player.schoolName, player.classNo]
  );
  useEffect(() => {
    setDenied(false);
    if (!shareOn && !isTeacher) return;
    return watchClassPins(player.schoolName, player.classNo, setPins, () =>
      setDenied(true)
    );
  }, [player.schoolName, player.classNo, shareOn, isTeacher]);
  useEffect(() => {
    if (!isTeacher) return;
    return watchSchoolPins(player.schoolName, setSchoolPins);
  }, [isTeacher, player.schoolName]);

  // 학교에 핀이 있는 반 목록(교사 필터 칩)
  const classNos = useMemo(
    () => Array.from(new Set(schoolPins.map((p) => p.classNo))).sort((a, b) => a - b),
    [schoolPins]
  );

  // 화면에 그릴 핀 — 학생은 우리 반, 교사는 필터(내 반/합본/특정 반)
  const viewPins = useMemo(() => {
    if (!isTeacher || classFilter === "mine") return pins;
    if (classFilter === "all") return schoolPins;
    return schoolPins.filter((p) => p.classNo === classFilter);
  }, [isTeacher, classFilter, pins, schoolPins]);

  const heatPoints = useMemo(() => {
    const filtered =
      heatFilter === "all"
        ? viewPins
        : heatFilter === "pos"
          ? viewPins.filter((p) => (EMOTION_BY_ID[p.emotion]?.valence ?? 0) > 0)
          : heatFilter === "neg"
            ? viewPins.filter((p) => (EMOTION_BY_ID[p.emotion]?.valence ?? 0) < 0)
            : heatFilter === "visited" || heatFilter === "wish"
              ? viewPins.filter((p) => p.category === heatFilter)
              : viewPins.filter((p) => p.emotion === heatFilter);
    return filtered.map((p) => ({ lat: p.lat, lng: p.lng, w: 1 }));
  }, [viewPins, heatFilter]);

  if ((!shareOn || denied) && !isTeacher) {
    return (
      <p className="rounded-2xl bg-[var(--md-sys-color-surface-container-high)] p-8 text-center text-sm leading-relaxed text-[var(--md-sys-color-on-surface-variant)]">
        <span className="emoji-noto text-3xl">🔒</span>
        <br />
        아직 선생님이 우리 반 지도를 공개하지 않았어요.
        <br />내 핀은 ‘핀 찍기’ 탭에서 볼 수 있어요.
      </p>
    );
  }

  return (
    <div>
      {/* 교사 — 반별/합본 보기 */}
      {isTeacher && (
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-bold text-[var(--md-sys-color-on-surface-variant)]">
            👩‍🏫 보기:
          </span>
          {(
            [
              ["mine", `우리 반 (${player.classNo}반)`],
              ["all", `🗺️ 전체 합본 (${schoolPins.length}핀)`],
              ...classNos
                .filter((n) => n !== player.classNo)
                .map((n) => [n, `${n}반`] as ["mine" | "all" | number, string]),
            ] as ["mine" | "all" | number, string][]
          ).map(([f, label]) => (
            <button
              key={String(f)}
              onClick={() => setClassFilter(f)}
              className={[
                "rounded-full px-3 py-1.5 text-xs font-bold transition",
                classFilter === f
                  ? "bg-[var(--md-sys-color-tertiary-container)] text-[var(--md-sys-color-on-tertiary-container)] ring-1 ring-[var(--md-sys-color-tertiary)]"
                  : "bg-[var(--md-sys-color-surface-container)] text-[var(--md-sys-color-on-surface-variant)]",
              ].join(" ")}
            >
              <span className="emoji-noto">{label}</span>
            </button>
          ))}
        </div>
      )}

      {/* 보기 모드 */}
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        {(
          [
            ["pins", "📌 핀 보기"],
            ["heat", "🔥 감정 히트맵"],
            ["cluster", "🫧 군집 보기"],
          ] as [MapMode, string][]
        ).map(([m, label]) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={[
              "rounded-full px-3 py-1.5 text-xs font-bold transition",
              mode === m
                ? "bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)]"
                : "bg-[var(--md-sys-color-surface-container)] text-[var(--md-sys-color-on-surface-variant)]",
            ].join(" ")}
          >
            {label}
          </button>
        ))}
        <button
          onClick={() => setFitKey((k) => k + 1)}
          disabled={viewPins.length === 0}
          className="ml-auto rounded-full border border-[var(--md-sys-color-outline-variant)] px-3 py-1.5 text-xs font-medium text-[var(--md-sys-color-on-surface-variant)] disabled:opacity-40"
        >
          전체 핀 보기
        </button>
      </div>

      {/* 히트맵 감정 필터 */}
      {mode === "heat" && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {(
            [
              ["all", "전체"],
              ["visited", "✅ 가봤던 곳"],
              ["wish", "✨ 가고 싶은 곳"],
              ["pos", "🌞 긍정만"],
              ["neg", "🌧️ 부정만"],
            ] as [HeatFilter, string][]
          )
            .concat(EMOTIONS.map((e) => [e.id, `${e.emoji} ${e.ko}`] as [HeatFilter, string]))
            .map(([f, label]) => (
              <button
                key={f}
                onClick={() => setHeatFilter(f)}
                className={[
                  "rounded-full border px-2.5 py-1 text-[11px] font-semibold transition",
                  heatFilter === f
                    ? "border-[var(--md-sys-color-primary)] bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-on-primary-container)]"
                    : "border-[var(--md-sys-color-outline-variant)] text-[var(--md-sys-color-on-surface-variant)]",
                ].join(" ")}
              >
                <span className="emoji-noto">{label}</span>
              </button>
            ))}
        </div>
      )}

      <Bleed>
        <TownMap
          pins={viewPins}
          mode={mode}
          heatPoints={mode === "heat" ? heatPoints : undefined}
          myUid={uid}
          center={center}
          fitKey={fitKey}
          onPinClick={(p) => setViewPin(p)}
          className="h-[62vh] min-h-[480px]"
        />
      </Bleed>
      {mode === "heat" && (
        <p className="mt-1.5 text-right text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
          파랑(적음) → 초록 → 노랑 → 빨강(많음) · 핀 {heatPoints.length}개 표시 중
        </p>
      )}

      {viewPin && (
        <PinInfoCard
          pin={viewPin}
          mine={viewPin.creatorUid === uid}
          canDelete={isTeacher}
          uid={uid}
          myPhotoURL={photoURL}
          onDelete={async () => {
            await deletePin(viewPin.id).catch(() => {});
            setViewPin(null);
          }}
          onClose={() => setViewPin(null)}
        />
      )}

      {/* 총합 분석 — 교사 필터(반별/합본)를 그대로 따른다 */}
      <div className="mt-4">
        {isTeacher && classFilter !== "mine" && (
          <p className="mb-2 text-xs font-bold text-[var(--md-sys-color-on-surface-variant)]">
            분석 범위:{" "}
            {classFilter === "all" ? `${player.schoolName} 전체 합본` : `6학년 ${classFilter}반`}
          </p>
        )}
        <InsightsPanel pins={viewPins} />
      </div>
    </div>
  );
}

// ─────────────────────────── 내 점수 탭 ───────────────────────────

function ScoreTab({ uid }: { uid: string }) {
  const [myPins, setMyPins] = useState<TownPin[]>([]);
  useEffect(() => watchMyPins(uid, setMyPins), [uid]);
  const score = Math.min(myPins.length, MAX_PINS) * POINTS_PER_PIN;

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-3xl bg-[var(--md-sys-color-primary-container)] p-6 text-center">
        <p className="text-sm font-semibold text-[var(--md-sys-color-on-primary-container)]">
          내 활동 점수
        </p>
        <p className="mt-1 text-4xl font-black text-[var(--md-sys-color-on-primary-container)]">
          {score}점
        </p>
        <p className="mt-1 text-xs text-[var(--md-sys-color-on-primary-container)] opacity-80">
          핀 1개 = {POINTS_PER_PIN}점 · 최대 {MAX_PINS}개 ({myPins.length}개 꽂음)
        </p>
      </div>

      <XpRequestCard uid={uid} score={score} />

      {myPins.length > 0 && (
        <div className="rounded-2xl bg-[var(--md-sys-color-surface-container)] p-4">
          <p className="mb-2 text-sm font-bold text-[var(--md-sys-color-on-surface)]">
            내가 만든 영어 문장
          </p>
          <ul className="flex flex-col gap-1.5">
            {myPins.map((p) => (
              <li
                key={p.id}
                className="rounded-xl bg-[var(--md-sys-color-surface-container-high)] px-3 py-2 text-[13px] leading-relaxed text-[var(--md-sys-color-on-surface)]"
              >
                <b>
                  <span className="emoji-noto">{PLACE_TYPE_BY_ID[p.placeType]?.emoji}</span>{" "}
                  {p.placeName}
                </b>
                <br />
                {pinSentence(p.placeType, p.canDo, p.emotion, p.category)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** 활동 점수 → 러닝크루 경험치 요청 (5-3과 같은 커넥터, activity 만 다름) */
function XpRequestCard({ uid, score }: { uid: string; score: number }) {
  const [classes, setClasses] = useState<{ id: string; name: string }[] | null>(null);
  const [cid, setCid] = useState("");
  const [req, setReq] = useState<XpRequest | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // 이 활동은 점수÷2 (기본 커넥터의 ÷3 대신 points 를 명시 전달)
  const xp = Math.ceil(score / 2);

  useEffect(() => {
    if (!uid) {
      setClasses([]);
      return;
    }
    listMyClasses(uid)
      .then((cs) => {
        const list = cs.map((c) => ({ id: c.id, name: c.name }));
        setClasses(list);
        if (list.length) setCid((p) => p || list[0].id);
      })
      .catch(() => setClasses([]));
  }, [uid]);

  useEffect(() => {
    if (!cid) {
      setReq(null);
      return;
    }
    getMyXpRequest(cid, uid, ACTIVITY_KEY).then(setReq).catch(() => setReq(null));
  }, [cid, uid]);

  async function request() {
    if (!cid || xp <= 0 || busy) return;
    setBusy(true);
    setErr(null);
    try {
      await requestClassXp(cid, uid, {
        activity: ACTIVITY_KEY,
        label: ACTIVITY_LABEL,
        score,
        points: xp,
      });
      const saved = await getMyXpRequest(cid, uid, ACTIVITY_KEY);
      if (!saved) throw new Error("not-saved");
      setReq(saved);
    } catch (e) {
      console.error("경험치 요청 실패", e);
      const code = (e as { code?: string })?.code ?? "";
      setErr(
        code.includes("permission-denied")
          ? "이 학급의 멤버가 아니라서 요청이 막혔어요. 선생님께 학급 참여(코드 입장)를 확인해 주세요."
          : "요청을 보내지 못했어요. 인터넷 상태를 확인하고 다시 시도해 주세요."
      );
    } finally {
      setBusy(false);
    }
  }

  if (classes === null) return null;

  return (
    <div className="rounded-2xl bg-[var(--md-sys-color-surface-container-high)] p-4">
      <p className="text-sm font-bold text-[var(--md-sys-color-on-surface)]">
        🎁 활동 점수로 경험치 요청
      </p>
      <p className="mt-0.5 mb-3 text-xs text-[var(--md-sys-color-on-surface-variant)]">
        내 점수 {score}점 → 러닝크루 <b>경험치 {xp} XP</b> (점수÷2, 올림). 선생님이 승인하면
        학급 경험치로 들어가요.
      </p>
      {classes.length === 0 ? (
        <p className="rounded-xl bg-[var(--md-sys-color-surface-container)] px-3 py-2 text-xs text-[var(--md-sys-color-on-surface-variant)]">
          러닝크루 학급에 가입돼 있어야 경험치를 요청할 수 있어요.
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {classes.length > 1 && (
            <select
              value={cid}
              onChange={(e) => setCid(e.target.value)}
              className="m3-field"
            >
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
          {req?.status === "granted" ? (
            <span className="rounded-full bg-[var(--md-sys-color-tertiary-container)] px-3 py-1.5 text-sm font-bold text-[var(--md-sys-color-on-tertiary-container)]">
              ✅ 경험치 {req.points} XP 지급됨
            </span>
          ) : req?.status === "pending" ? (
            <span className="rounded-full bg-[var(--md-sys-color-secondary-container)] px-3 py-1.5 text-sm font-bold text-[var(--md-sys-color-on-secondary-container)]">
              ⏳ 요청함 · 선생님 승인 대기 ({req.points} XP)
            </span>
          ) : (
            <button
              onClick={request}
              disabled={xp <= 0 || busy}
              className="rounded-full bg-[var(--md-sys-color-primary)] px-4 py-2 text-sm font-bold text-[var(--md-sys-color-on-primary)] transition hover:brightness-105 disabled:opacity-40"
            >
              {busy
                ? "요청 중…"
                : req?.status === "declined"
                  ? `거절됨 · 다시 요청 (${xp} XP)`
                  : `선생님께 경험치 요청 (${xp} XP)`}
            </button>
          )}
        </div>
      )}
      {err && (
        <p className="mt-2 rounded-xl bg-[var(--md-sys-color-error-container)] px-3 py-2 text-xs font-semibold text-[var(--md-sys-color-on-error-container)]">
          {err}
        </p>
      )}
    </div>
  );
}

// ─────────────────────────── 교사 탭 ───────────────────────────

function TeacherTab({ player, uid }: { player: Player; uid: string }) {
  const { user } = useAuth();
  const [shareOn, setShareOn] = useState(true);
  const [pins, setPins] = useState<TownPin[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(
    () => watchShareSetting(player.schoolName, player.classNo, setShareOn),
    [player.schoolName, player.classNo]
  );
  useEffect(
    () => watchClassPins(player.schoolName, player.classNo, setPins),
    [player.schoolName, player.classNo]
  );

  const studentCount = new Set(pins.map((p) => p.creatorUid)).size;

  async function toggleShare() {
    if (busy) return;
    setBusy(true);
    try {
      await setShareSetting(player.schoolName, player.classNo, !shareOn, uid);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {/* 서로 보기 토글 */}
      <div className="rounded-2xl bg-[var(--md-sys-color-surface-container)] p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-bold text-[var(--md-sys-color-on-surface)]">
              👀 학생들이 서로의 핀 보기
            </p>
            <p className="mt-0.5 text-xs leading-relaxed text-[var(--md-sys-color-on-surface-variant)]">
              켜면 같은 반 학생들이 서로의 핀과 ‘우리 반 지도’를 볼 수 있어요. 끄면 각자 자기
              핀만 보여요(입력 단계용).
            </p>
          </div>
          <button
            onClick={toggleShare}
            disabled={busy}
            role="switch"
            aria-checked={shareOn}
            className={[
              "relative h-8 w-14 shrink-0 rounded-full transition disabled:opacity-50",
              shareOn
                ? "bg-[var(--md-sys-color-primary)]"
                : "bg-[var(--md-sys-color-surface-container-highest)] border border-[var(--md-sys-color-outline)]",
            ].join(" ")}
          >
            <span
              className={[
                "absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-all",
                shareOn ? "left-7" : "left-1",
              ].join(" ")}
            />
          </button>
        </div>
        <p className="mt-2 text-xs font-semibold text-[var(--md-sys-color-primary)]">
          현재: {shareOn ? "공개 (서로 볼 수 있음)" : "비공개 (자기 핀만 보임)"}
        </p>
      </div>

      {/* 참여 현황 */}
      <div className="rounded-2xl bg-[var(--md-sys-color-surface-container)] p-4">
        <p className="mb-2 text-sm font-bold text-[var(--md-sys-color-on-surface)]">
          📊 참여 현황 — {player.schoolName} 6학년 {player.classNo}반
        </p>
        <div className="grid grid-cols-2 gap-2 text-center">
          <div className="rounded-xl bg-[var(--md-sys-color-surface-container-high)] py-3">
            <p className="text-2xl font-black text-[var(--md-sys-color-primary)]">{studentCount}</p>
            <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">참여 학생</p>
          </div>
          <div className="rounded-xl bg-[var(--md-sys-color-surface-container-high)] py-3">
            <p className="text-2xl font-black text-[var(--md-sys-color-primary)]">{pins.length}</p>
            <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">전체 핀</p>
          </div>
        </div>
        {pins.length > 0 && (
          <p className="mt-2 text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
            학생별 핀:{" "}
            {Array.from(
              pins.reduce((m, p) => m.set(p.creatorUid, (m.get(p.creatorUid) ?? 0) + 1), new Map<string, number>())
            )
              .map(([u, n]) => `${avatarFromUid(u)}×${n}`)
              .join(" · ")}
          </p>
        )}
      </div>

      {user && <SendResultCard player={player} pins={pins} uid={uid} shareOn={shareOn} />}
    </div>
  );
}

/** 모든 제출이 끝나면 — 차시 '수업 후' 결과물(링크 활동)로 보내기 */
function SendResultCard({
  player,
  pins,
  uid,
  shareOn,
}: {
  player: Player;
  pins: TownPin[];
  uid: string;
  shareOn: boolean;
}) {
  const { user } = useAuth();
  const [classes, setClasses] = useState<{ id: string; name: string }[] | null>(null);
  const [cid, setCid] = useState("");
  const [lessons, setLessons] = useState<Lesson[] | null>(null);
  const [lid, setLid] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    listMyClasses(uid)
      .then((cs) => {
        const list = cs.map((c) => ({ id: c.id, name: c.name }));
        setClasses(list);
        if (list.length) setCid((p) => p || list[0].id);
      })
      .catch(() => setClasses([]));
  }, [uid]);

  useEffect(() => {
    if (!cid) {
      setLessons(null);
      return;
    }
    setLessons(null);
    setLid("");
    listLessons(cid)
      .then((ls) => {
        const sorted = [...ls].sort((a, b) => (a.date < b.date ? 1 : -1));
        setLessons(sorted);
        if (sorted.length) setLid(sorted[0].id);
      })
      .catch(() => setLessons([]));
  }, [cid]);

  async function send() {
    if (!user || !cid || !lid || busy) return;
    setBusy(true);
    setErr(null);
    try {
      const studentCount = new Set(pins.map((p) => p.creatorUid)).size;
      // 결과를 보내면 학생들이 함께 봐야 하므로 서로 보기를 켠다
      if (!shareOn) {
        await setShareSetting(player.schoolName, player.classNo, true, uid);
      }
      const url = `${window.location.origin}/eng/54/?tab=class`;
      await createQuestion(cid, lid, user, {
        phase: "post",
        kind: "link",
        title: "🗺️ 우리 동네 감정 지도 — 결과 보기",
        text: `영어 5단원 '우리 동네 감정 지도' 활동 결과예요. 참여 ${studentCount}명 · 핀 ${pins.length}개. 링크에서 우리 반 지도(감정 히트맵·군집·인사이트)를 함께 봐요!`,
        links: [{ title: "우리 반 감정 지도 열기", url }],
      });
      setDone(true);
    } catch (e) {
      console.error("결과 보내기 실패", e);
      setErr("결과를 보내지 못했어요. 이 학급의 교사 권한인지 확인해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl bg-[var(--md-sys-color-surface-container)] p-4">
      <p className="text-sm font-bold text-[var(--md-sys-color-on-surface)]">
        📤 수업 후 결과물로 보내기
      </p>
      <p className="mt-0.5 mb-3 text-xs leading-relaxed text-[var(--md-sys-color-on-surface-variant)]">
        모든 학생의 제출이 끝나면, 러닝크루 학급 차시의 <b>수업 후</b> 활동으로 결과
        링크를 보내요. 보내면 ‘서로 보기’가 자동으로 켜져요.
      </p>
      {classes === null ? (
        <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">학급 불러오는 중…</p>
      ) : classes.length === 0 ? (
        <p className="rounded-xl bg-[var(--md-sys-color-surface-container-high)] px-3 py-2 text-xs text-[var(--md-sys-color-on-surface-variant)]">
          러닝크루 학급이 없어요. 먼저 학급을 만들어 주세요.
        </p>
      ) : done ? (
        <p className="rounded-xl bg-[var(--md-sys-color-tertiary-container)] px-3 py-2 text-sm font-bold text-[var(--md-sys-color-on-tertiary-container)]">
          ✅ 차시의 수업 후 활동으로 보냈어요!
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          <select value={cid} onChange={(e) => setCid(e.target.value)} className="m3-field w-full">
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          {lessons === null ? (
            <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">차시 불러오는 중…</p>
          ) : lessons.length === 0 ? (
            <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
              이 학급에 차시가 없어요. 러닝크루에서 차시를 먼저 만들어 주세요.
            </p>
          ) : (
            <select value={lid} onChange={(e) => setLid(e.target.value)} className="m3-field w-full">
              {lessons.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.date} · {l.title}
                </option>
              ))}
            </select>
          )}
          <button
            onClick={send}
            disabled={!cid || !lid || busy || pins.length === 0}
            className="rounded-full bg-[var(--md-sys-color-primary)] px-5 py-2.5 text-sm font-bold text-[var(--md-sys-color-on-primary)] transition hover:brightness-105 disabled:opacity-40"
          >
            {busy ? "보내는 중…" : `이 차시의 수업 후 활동으로 보내기 (핀 ${pins.length}개)`}
          </button>
        </div>
      )}
      {err && (
        <p className="mt-2 rounded-xl bg-[var(--md-sys-color-error-container)] px-3 py-2 text-xs font-semibold text-[var(--md-sys-color-on-error-container)]">
          {err}
        </p>
      )}
    </div>
  );
}
