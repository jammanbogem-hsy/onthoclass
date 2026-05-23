// Firebase 초기화 (프로젝트: jammanboeng)
// 정적 export(빌드 프리렌더)와 SSR에서 실행되지 않도록 "지연 초기화"합니다.
// auth/db 는 실제 사용(브라우저, useEffect/이벤트 핸들러) 시점에 초기화됩니다.
import {
  initializeApp,
  getApps,
  getApp,
  type FirebaseApp,
  type FirebaseOptions,
} from "firebase/app";
import { getAuth, GoogleAuthProvider, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";
import { getFunctions, type Functions } from "firebase/functions";

const firebaseConfig: FirebaseOptions = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// .env.local 이 채워졌는지 (apiKey 존재 여부로 판단)
export const isFirebaseConfigured = Boolean(firebaseConfig.apiKey);

let _app: FirebaseApp | undefined;
let _auth: Auth | undefined;
let _db: Firestore | undefined;
let _fns: Functions | undefined;

function app(): FirebaseApp {
  if (!_app) _app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  return _app;
}

export function getAuthClient(): Auth {
  if (!_auth) _auth = getAuth(app());
  return _auth;
}

export function getDbClient(): Firestore {
  if (!_db) _db = getFirestore(app());
  return _db;
}

export function getFunctionsClient(): Functions {
  // Cloud Functions 배포 리전과 일치해야 함 (서울)
  if (!_fns) _fns = getFunctions(app(), "asia-northeast3");
  return _fns;
}

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });
