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
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from "firebase/firestore";
import { getFunctions, type Functions } from "firebase/functions";
import { getStorage, type FirebaseStorage } from "firebase/storage";

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
let _storage: FirebaseStorage | undefined;

function app(): FirebaseApp {
  if (!_app) _app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  return _app;
}

export function getAuthClient(): Auth {
  // getAuth 는 기본으로 IndexedDB 우선 지속성(브라우저 재시작 후에도 로그인 유지) +
  // 팝업 리졸버(signInWithPopup)를 모두 등록한다. initializeAuth 로 커스터마이즈하면
  // popupRedirectResolver 를 직접 넘기지 않는 한 Google 팝업 로그인이 깨지므로 getAuth 사용.
  if (!_auth) _auth = getAuth(app());
  return _auth;
}

export function getDbClient(): Firestore {
  if (_db) return _db;
  // 디스크(IndexedDB) 캐시를 켠다.
  //
  // 기본값인 메모리 캐시는 새로고침·새 탭마다 비워져서, 그때마다 구독 중인
  // 컬렉션을 통째로 다시 내려받는다(= Firestore 읽기 과금). 한 반 25명이
  // 하루에도 여러 번 화면을 여니 이게 읽기 대부분을 차지했다.
  //
  // 디스크 캐시를 쓰면 재방문 때 캐시에서 먼저 그리고, 리스너는 마지막
  // 동기화 이후의 "변경분"만 받아온다. 화면·기능은 그대로이고 로딩만 빨라진다.
  // 탭을 여러 개 열어도 캐시를 공유하도록 multipleTab 관리자를 쓴다.
  try {
    _db = initializeFirestore(app(), {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager(),
      }),
    });
  } catch {
    // IndexedDB 를 못 쓰는 환경(사생활 보호 모드 등)이거나 이미 초기화된 경우
    _db = getFirestore(app());
  }
  return _db;
}

export function getFunctionsClient(): Functions {
  // Cloud Functions 배포 리전과 일치해야 함 (서울)
  if (!_fns) _fns = getFunctions(app(), "asia-northeast3");
  return _fns;
}

export function getStorageClient(): FirebaseStorage {
  if (!_storage) _storage = getStorage(app());
  return _storage;
}

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });
