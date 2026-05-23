"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut as fbSignOut,
  type User,
} from "firebase/auth";
import {
  getAuthClient,
  googleProvider,
  isFirebaseConfigured,
} from "@/lib/firebase";
import {
  ensureUserDoc,
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
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

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
      setProfile(await getUserProfile(u.uid));
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
    await signInWithPopup(getAuthClient(), googleProvider);
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
