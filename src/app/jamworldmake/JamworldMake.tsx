"use client";

import {
  GlassButton,
  GlassLink,
} from "@/features/jamworld/components/glass-surface";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { Icon } from "@/components/Icon";
import {
  api,
  getMe,
  type Me,
} from "@/features/jamworld/components/workshop-api";
import { setStorageScope } from "@/features/jamworld/lib/world/storage";
import GlassSurface, {
  WaterBackdrop,
} from "@/features/jamworld/components/glass-surface";
import { ClassroomProvider } from "@/features/jamworld/components/classroom-context";
import {
  ClassroomChrome,
  ClassroomNav,
  ClassroomView,
} from "@/features/jamworld/components/classroom-ui";
import AssetLibrary from "@/features/jamworld/components/asset-library";
import Workshop from "@/features/jamworld/components/workshop";
import JoinClass from "@/features/jamworld/components/join-class";
import MyPage from "@/features/jamworld/components/my-page";
import "./jamworld.css";

const Dashboard = dynamic(
  () => import("@/features/jamworld/components/dashboard"),
  { ssr: false },
);
const Editor = dynamic(() => import("@/features/jamworld/components/editor"), {
  ssr: false,
});
const Play = dynamic(() => import("@/features/jamworld/components/play"), {
  ssr: false,
});

export default function JamworldMake() {
  const {
    user,
    loading,
    profileLoading,
    profile,
    configured,
    signInWithGoogle,
    signOut,
  } = useAuth();
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState("");
  const query = useSearchParams();
  const route = {
    view: query.get("view") || "workshop",
    id: query.get("id") || "",
    invite: query.get("invite") || "",
  };
  const reload = useCallback(() => {
    getMe()
      .then((m) => {
        setError("");
        setStorageScope(m.student?.id || m.teacher?.id || user?.uid || "guest");
        setMe(m);
      })
      .catch((e) => setError(e.message));
  }, [user?.uid]);
  useEffect(() => {
    if (!loading && !profileLoading) reload();
  }, [loading, profileLoading, reload]);
  async function login() {
    setBusy(true);
    setError("");
    try {
      await signInWithGoogle();
    } catch (e) {
      setError(e instanceof Error ? e.message : "로그인하지 못했어요.");
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    setBusy(true);
    try {
      await api("/api/jamworld/workshop/logout", { method: "POST" });
      if (user) await signOut();
      window.location.href = "/jamworldmake/";
    } catch {
      setError("로그아웃하지 못했어요. 다시 시도해 주세요.");
      setBusy(false);
    }
  }
  const name = me?.teacher?.name || me?.student?.nickname || user?.displayName;
  const inEditor =
    ["editor", "play", "classroom"].includes(route.view) && !!route.id;
  const ready = !loading && !profileLoading && !!me;
  const isProfile = route.view === "profile" || (route.view === "workshop" && query.get("tab") === "avatar");
  const avatar = me?.avatar ?? me?.student?.avatar;
  return (
    <ClassroomProvider
      me={me}
      routeClassId={route.view === "classroom" ? route.id : undefined}
    >
      <div className={`jamworld ${inEditor ? "jamworld-canvas" : ""}`}>
        <WaterBackdrop />
        <GlassSurface
          className="nav-lens"
          radius={24}
          frost={0.03}
          refraction={55}
          bezel={14}
        >
          <header className="world-nav">
            <Link href="/jamworldmake/?view=workshop" className="world-brand">
              <span className="world-mark">
                <Icon name="deployed_code" size={24} />
              </span>
              <span>모아 월드</span>
            </Link>
            <nav className="world-switch" aria-label="월드 메뉴">
              <Link
                href="/jamworldmake/?view=workshop"
                aria-current={route.view === "workshop" && !isProfile ? "page" : undefined}
              >
                <Icon name="auto_awesome" size={18} />
                에셋 공방
              </Link>
              <Link
                href="/jamworldmake/?view=worlds"
                aria-current={
                  ["worlds", "editor", "play"].includes(route.view)
                    ? "page"
                    : undefined
                }
              >
                <Icon name="public" size={18} />내 월드
              </Link>
              <Link
                href="/jamworldmake/?view=catalog"
                aria-current={route.view === "catalog" ? "page" : undefined}
              >
                <Icon name="category" size={18} />
                에셋 모음
              </Link>
              <ClassroomNav active={route.view === "classroom"} />
            </nav>
            <div className="world-account">
              {name ? (
                <>
                  <span className="account-name">{name}</span>
                  {(me?.role === "teacher" || me?.role === "student") && <Link href="/jamworldmake/?view=profile" className="account-profile" aria-current={isProfile ? "page" : undefined}>
                    {avatar?.asset ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={avatar.asset.iso} alt="" />
                    ) : <Icon name="account_circle" size={20} />}
                    마이페이지
                  </Link>}
                  <GlassButton
                    className="btn sm"
                    disabled={busy}
                    onClick={() => void logout()}
                  >
                    로그아웃
                  </GlassButton>
                </>
              ) : (
                <GlassLink href="/" className="btn sm ghost">
                  러닝크루 <Icon name="arrow_outward" size={16} />
                </GlassLink>
              )}
            </div>
          </header>
        </GlassSurface>
        {error && (
          <div className="world-error" role="alert">
            {error}
            <GlassButton className="btn sm" onClick={reload}>
              다시 시도
            </GlassButton>
          </div>
        )}
        {!ready ? (
          <div className="world-loading" role="status">
            {error ? "연결 상태를 확인해 주세요." : "작업실을 준비하고 있어요…"}
          </div>
        ) : route.invite ? (
          <JoinClass token={route.invite} />
        ) : isProfile && (me.role === "student" || me.role === "teacher") ? (
          <MyPage key={`${me.student?.id || me.teacher?.id}-${query.get("asset") || ""}`} me={me} assetId={query.get("asset") || undefined} onSaved={look => setMe(current => current ? { ...current, avatar: look, ...(current.student ? { student: { ...current.student, avatar: look } } : {}) } : current)} />
        ) : route.view === "classroom" ? (
          <ClassroomView />
        ) : route.view === "editor" && route.id ? (
          <Editor key={route.id} projectId={route.id} />
        ) : route.view === "play" && route.id ? (
          <Play projectId={route.id} />
        ) : route.view === "worlds" ? (
          <Dashboard />
        ) : route.view === "catalog" ? (
          <main className="dash">
            <AssetLibrary />
          </main>
        ) : me.role ? (
          <Workshop me={me} />
        ) : (
          <main className="world-landing">
            <section className="world-hero">
              <div>
                <h1>
                  상상한 대로,
                  <br />
                  <em>우리만의 월드.</em>
                </h1>
                <p>그림을 만들고, 나만의 세상에 놓아 보세요.</p>
              </div>
              <div className="world-scene" aria-hidden="true">
                <div className="bubble-orbit" />
                <GlassSurface
                  className="hero-lens"
                  radius={120}
                  refraction={155}
                  bezel={38}
                  frost={0.01}
                >
                  <span className="bubble-house">
                    <Icon name="cottage" size={114} />
                  </span>
                </GlassSurface>
                <GlassSurface
                  className="small-lens lens-palette"
                  radius={50}
                  frost={0.03}
                >
                  <Icon name="palette" size={40} />
                </GlassSurface>
                <GlassSurface
                  className="small-lens lens-tree"
                  radius={50}
                  frost={0.03}
                >
                  <Icon name="park" size={46} />
                </GlassSurface>
              </div>
            </section>
            <div className="entry-grid">
              <GlassSurface className="entry-lens" frost={0.06}>
                <section className="entry-card student-entry">
                  <span className="entry-icon">
                    <Icon name="palette" size={25} />
                  </span>
                  <h2>학생 공방에 들어가기</h2>
                  <p>초대 코드를 넣으면 바로 시작할 수 있어요.</p>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const text = code.trim();
                      let token = text;
                      try {
                        token =
                          new URL(text).searchParams.get("invite") ||
                          text.split("/join/").pop() ||
                          text;
                      } catch {}
                      if (token)
                        window.location.href = `/jamworldmake/?invite=${encodeURIComponent(token)}`;
                    }}
                  >
                    <label className="sr-only" htmlFor="workshop-code">
                      초대 링크 또는 코드
                    </label>
                    <div className="entry-input">
                      <Icon name="key" size={19} />
                      <input
                        id="workshop-code"
                        placeholder="초대 링크 또는 코드"
                        value={code}
                        onChange={(e) => setCode(e.target.value)}
                        required
                      />
                      <GlassButton
                        className="btn primary"
                        disabled={!code.trim()}
                      >
                        공방 입장 <Icon name="arrow_forward" size={18} />
                      </GlassButton>
                    </div>
                  </form>
                  <small>별명과 숫자 비밀번호만 있으면 돼요.</small>
                </section>
              </GlassSurface>
              <GlassSurface className="entry-lens" frost={0.06}>
                <section className="entry-card teacher-entry">
                  <span className="entry-icon">
                    <Icon name="school" size={25} />
                  </span>
                  <h2>선생님 공방 만들기</h2>
                  <p>공방을 열고 학생들의 그림을 함께 완성해요.</p>
                  {user && !user.isAnonymous && profile?.role !== "teacher" ? (
                    <GlassLink
                      className="btn teacher-login"
                      href="/onboarding/"
                    >
                      러닝크루 교사 등록 <Icon name="arrow_forward" size={18} />
                    </GlassLink>
                  ) : (
                    <GlassButton
                      className="btn teacher-login"
                      disabled={busy || !configured}
                      onClick={() => void login()}
                    >
                      <span className="google-g">G</span>
                      {busy ? "로그인 중…" : "구글로 로그인"}
                      <Icon name="arrow_forward" size={18} />
                    </GlassButton>
                  )}
                  <small>
                    {!configured
                      ? "Google 로그인 설정이 필요합니다."
                      : "러닝크루에 등록된 교사 계정으로 시작해요."}
                  </small>
                </section>
              </GlassSurface>
            </div>
            <footer className="world-footer">
              <Link href="/jamworldmake/?view=worlds">
                월드 편집기 둘러보기 <Icon name="arrow_forward" size={16} />
              </Link>
            </footer>
          </main>
        )}
        <ClassroomChrome />
      </div>
    </ClassroomProvider>
  );
}
