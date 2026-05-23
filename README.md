# 잼클래스 · LMS

수업용 학습 관리 시스템. 구글 클래스룸처럼 **학급 생성 → 초대 코드 → 참여** 흐름을 제공하며,
애플 스타일의 **Liquid Glass** UI로 구성했습니다.

- **스택**: Next.js 16 (App Router) + TypeScript + Tailwind v4
- **DB/인증**: Firebase (Firestore + Google 로그인)
- **배포**: Firebase Hosting (정적 export)

## 폴더 구조

```
src/
  app/
    layout.tsx          루트 레이아웃 (Pretendard, AuthProvider)
    globals.css          Liquid Glass 디자인 토큰/유틸리티
    page.tsx             로그인 (Google)
    dashboard/page.tsx   학급 목록 + 생성/코드참여 모달
    class/page.tsx       학급 상세 (?id=...) + 초대 코드
  components/
    Glass.tsx            GlassCard / GlassButton
    TopBar.tsx           상단 바
  contexts/
    AuthContext.tsx      구글 로그인 상태 전역 관리
  lib/
    firebase.ts          Firebase 지연 초기화 (브라우저 전용)
    classes.ts           학급 Firestore 헬퍼 (임시 스키마)
```

## 설정 (최초 1회)

1. **Firebase 웹앱 등록**
   [콘솔 > jammanboeng > 프로젝트 설정](https://console.firebase.google.com/project/jammanboeng/settings/general)
   에서 웹앱을 추가하고 SDK 구성 값을 복사합니다.

2. **`.env.local` 채우기** — `apiKey`, `messagingSenderId`, `appId` 등 빈 값을 입력합니다.
   (`.env.example` 참고)

3. **Google 로그인 활성화**
   콘솔 > Authentication > 시작하기 > Sign-in method > **Google** 사용 설정.

4. **Firestore 생성**
   콘솔 > Firestore Database > 데이터베이스 만들기 (테스트 모드로 시작 가능).

## 개발 / 배포

```bash
npm run dev        # 로컬 개발 (http://localhost:3000)
npm run build      # 정적 export → out/
npx firebase login # 최초 1회
npm run deploy     # build + Firebase Hosting 배포
```

## 다음 단계 (기능 구현 예정)

- Firestore 정식 스키마 확정 (학급/멤버/역할)
- 보안 규칙(firestore.rules) 작성
- 학급 상세: 공지 · 과제 · 자료 · 출석
- 교사/학생 역할 분리
