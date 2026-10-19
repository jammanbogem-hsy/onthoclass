"use client";

// AI 연결 허용 화면(/mcp-auth/?req=…) — Claude·ChatGPT 가 러닝크루 MCP 에 연결할 때 여기로 온다.
// 선생님이 구글로 로그인 → 무엇을 허용하는지 확인 → 허용하면 AI 앱으로 돌아간다(서버가 1회용 코드를 붙여 준다).
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { httpsCallable } from "firebase/functions";
import { getFunctionsClient } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { Icon } from "@/components/Icon";
import styles from "@/components/idea/Idea.module.css";

type Info = { clientName: string; redirectHost: string };

export default function McpAuth() {
  const id = useSearchParams().get("req") || "";
  const { user, loading, signInWithGoogle, signOut } = useAuth();
  const [info, setInfo] = useState<Info | null>(null);
  const [err, setErr] = useState("");
  const [names, setNames] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!id) return;
    httpsCallable<{ req: string }, Info>(getFunctionsClient(), "mcpAuthInfo")({ req: id })
      .then(r => setInfo(r.data)).catch(e => setErr(e instanceof Error ? e.message : "연결 요청을 찾지 못했어요."));
  }, [id]);

  async function decide(allow: boolean) {
    setBusy(true); setErr("");
    try {
      const r = await httpsCallable<{ req: string; allow: boolean; includeNames: boolean }, { redirect: string }>(getFunctionsClient(), "mcpApprove")({ req: id, allow, includeNames: names });
      window.location.href = r.data.redirect;
    } catch (e) { setErr(e instanceof Error ? e.message : "처리하지 못했어요."); setBusy(false); }
  }

  const card = (body: React.ReactNode) => <main className={styles.landing}><div className={styles.card}>
    <div className={styles.brand}>
      <span className={styles.logo}><Icon name="smart_toy" size={30} fill /></span>
      <h1>AI 연결</h1>
      <p>러닝크루 학급 기록을 AI가 읽도록 허용해요</p>
    </div>
    {body}
  </div></main>;

  if (!id) return card(<p className={styles.err}>잘못된 주소예요. AI 앱에서 다시 연결해 주세요.</p>);
  if (err && !info) return card(<p className={styles.err}>{err}</p>);
  if (!info || loading) return card(<p className={styles.fine}>불러오는 중…</p>);
  if (!user || user.isAnonymous) return card(<>
    <p className={styles.detail}><b>{info.clientName}</b>이(가) 러닝크루에 연결하려고 해요. 선생님 계정으로 로그인해 주세요.</p>
    <button type="button" className={styles.primary} onClick={() => signInWithGoogle().catch(e => setErr(e instanceof Error ? e.message : "로그인하지 못했어요."))}><Icon name="login" size={20} />구글로 로그인</button>
    {err && <p role="alert" className={styles.err}>{err}</p>}
  </>);
  return card(<>
    <p className={styles.detail}><b>{info.clientName}</b>({info.redirectHost})이(가) <b>{user.displayName || user.email}</b> 선생님의 러닝크루에 연결하려고 해요.</p>
    <ul className={styles.detail} style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
      <li>선생님이 맡은 학급의 차시·활동 응답, 브레인스토밍, 게임 결과, 칭찬, 피드백, 아이디어 섬을 <b>읽기만</b> 해요.</li>
      <li>고치거나 지우거나 학생에게 보내는 일은 할 수 없어요.</li>
      <li>사진·첨부 파일과 이메일은 보내지 않아요.</li>
    </ul>
    <label className={styles.detail} style={{ display: "flex", gap: 10, alignItems: "flex-start", cursor: "pointer" }}>
      <input type="checkbox" checked={names} onChange={e => setNames(e.target.checked)} style={{ marginTop: 4, width: 18, height: 18 }} />
      <span><b>학생 이름도 함께 보내기</b><br />끄면 학생은 학생 코드(S01, S02…)로만 보이고, 응답 글 속 이름도 코드로 바뀌어요. 학교 개인정보 지침을 확인한 뒤 켜 주세요.</span>
    </label>
    {err && <p role="alert" className={styles.err}>{err}</p>}
    <button type="button" className={styles.primary} disabled={busy} onClick={() => void decide(true)}><Icon name="check" size={20} />{busy ? "연결하는 중…" : "허용하고 돌아가기"}</button>
    <button type="button" className={styles.subtle} disabled={busy} onClick={() => void decide(false)}>거절</button>
    <button type="button" className={styles.subtle} onClick={() => void signOut()}>다른 계정으로 로그인</button>
    <p className={styles.fine}>연결은 AI 앱의 커넥터 설정에서 언제든 끊을 수 있어요.</p>
  </>);
}
