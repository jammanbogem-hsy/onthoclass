"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as fbSignOut,
  updateProfile,
  type User,
} from "firebase/auth";
import {
  getAuthClient,
  googleProvider,
  isFirebaseConfigured,
} from "@/lib/firebase";
import {
  ensureUserDoc,
  ensureTeacherClaim,
  getUserProfile,
  type UserProfile,
} from "@/lib/users";

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  profile: UserProfile | null;
  profileLoading: boolean;
  /** .env.local 미설정 시 false */
  configured: boolean;
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (
    email: string,
    password: string,
    displayName?: string
  ) => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

// Firebase Auth 에러코드 → 한국어 메시지
function authErrorMessage(code: string): string {
  switch (code) {
    case "auth/invalid-email":
      return "이메일 형식이 올바르지 않아요.";
    case "auth/email-already-in-use":
      return "이미 가입된 이메일이에요. 로그인해 주세요.";
    case "auth/weak-password":
      return "비밀번호는 6자 이상이어야 해요.";
    case "auth/user-not-found":
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return "이메일 또는 비밀번호가 올바르지 않아요.";
    case "auth/too-many-requests":
      return "시도가 너무 많아요. 잠시 후 다시 시도해 주세요.";
    case "auth/network-request-failed":
      return "네트워크 오류예요. 인터넷 연결을 확인해 주세요.";
    default:
      return "처리에 실패했어요. 잠시 후 다시 시도해 주세요.";
  }
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);

  async function loadProfile(u: User) {
    setProfileLoading(true);
    try {
      await ensureUserDoc(u);
      const p = await getUserProfile(u.uid);
      setProfile(p);
      // Storage 규칙이 교사 판정에 쓰는 커스텀 클레임을 보정(누락된 계정 복구)
      if (p?.role === "teacher") void ensureTeacherClaim(u);
    } catch {
      setProfile(null);
    } finally {
      setProfileLoading(false);
    }
  }

  useEffect(() => {
    if (!isFirebaseConfigured) {
      setLoading(false);
      setProfileLoading(false);
      return;
    }
    const unsub = onAuthStateChanged(getAuthClient(), (u) => {
      setUser(u);
      setLoading(false);
      if (u) {
        loadProfile(u);
      } else {
        setProfile(null);
        setProfileLoading(false);
      }
    });
    return () => unsub();
  }, []);

  async function signInWithGoogle() {
    if (!isFirebaseConfigured) {
      alert(
        "Firebase가 아직 설정되지 않았습니다.\n.env.local 에 Firebase 웹앱 설정값을 입력해 주세요."
      );
      return;
    }
    try {
      await signInWithPopup(getAuthClient(), googleProvider);
    } catch (err) {
      const code = (err as { code?: string })?.code ?? "";
      // 사용자가 팝업을 직접 닫은 경우는 조용히 무시
      if (
        code === "auth/popup-closed-by-user" ||
        code === "auth/cancelled-popup-request"
      ) {
        return;
      }
      throw new Error(
        code === "auth/popup-blocked"
          ? "로그인 팝업이 차단됐어요. 브라우저 팝업 차단을 해제하고 다시 시도해주세요."
          : "Google 로그인에 실패했어요. 인터넷 연결을 확인하고 다시 시도해주세요."
      );
    }
  }

  async function signInWithEmail(email: string, password: string) {
    if (!isFirebaseConfigured) {
      throw new Error("Firebase가 아직 설정되지 않았습니다.");
    }
    try {
      await signInWithEmailAndPassword(
        getAuthClient(),
        email.trim(),
        password
      );
    } catch (err) {
      throw new Error(authErrorMessage((err as { code?: string })?.code ?? ""));
    }
  }

  async function signUpWithEmail(
    email: string,
    password: string,
    displayName?: string
  ) {
    if (!isFirebaseConfigured) {
      throw new Error("Firebase가 아직 설정되지 않았습니다.");
    }
    try {
      const cred = await createUserWithEmailAndPassword(
        getAuthClient(),
        email.trim(),
        password
      );
      if (displayName?.trim()) {
        await updateProfile(cred.user, {
          displayName: displayName.trim(),
        }).catch(() => {});
      }
      // 인증 메일 발송(차단하지 않음 — 실패해도 가입은 완료) 즉시 사용 가능
      await sendEmailVerification(cred.user).catch(() => {});
    } catch (err) {
      throw new Error(authErrorMessage((err as { code?: string })?.code ?? ""));
    }
  }

  async function sendPasswordReset(email: string) {
    if (!isFirebaseConfigured) {
      throw new Error("Firebase가 아직 설정되지 않았습니다.");
    }
    try {
      await sendPasswordResetEmail(getAuthClient(), email.trim());
    } catch (err) {
      throw new Error(authErrorMessage((err as { code?: string })?.code ?? ""));
    }
  }

  async function signOut() {
    if (!isFirebaseConfigured) return;
    await fbSignOut(getAuthClient());
  }

  async function refreshProfile() {
    if (user) await loadProfile(user);
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        profile,
        profileLoading,
        configured: isFirebaseConfigured,
        signInWithGoogle,
        signInWithEmail,
        signUpWithEmail,
        sendPasswordReset,
        signOut,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
