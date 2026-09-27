# 학급 뿌요뿌요

## 교사·학생 사용 흐름

1. 학급 관리 → **학급 게임** → **뿌요뿌요**를 선택합니다.
2. 제한 시간을 1~15분으로 정하고 **학급 게임 시작**을 누릅니다. 수업/폴더 연결은 선택 사항입니다.
3. 학급 화면을 열어 둔 학생은 `/puyo/?class=…&game=…` 대기실로 이동합니다.
4. 선생님이 접속한 학생을 체크합니다. 홀수면 선생님이 참가하고, 짝수면 학생끼리 무작위 1:1 대결합니다. 최대 40명의 학생을 선택할 수 있습니다.
5. 6초 준비 후 동시에 시작합니다. 각 대결의 두 참가자는 같은 순서의 뿌요를 받습니다.
6. 보드의 시작 위치가 막히면 패배합니다. 제한 시간 또는 교사 수동 종료 시 높은 점수가 승리하며 동점은 무승부입니다. 25초 이상 상태 전송이 끊기면 접속 종료로 판정합니다.
7. 결과 화면과 학급 게임 이력에서 대진·점수·승패·종료 사유를 확인합니다.

`/puyo/`에서는 로그인 없이 혼자 연습할 수 있습니다.

조작: ← → 이동, ↓ 빠르게 내리기, Z/X 또는 ↑ 회전, Space 바로 낙하. 화면 버튼으로 터치 조작도 지원합니다.

## 구성

- `src/lib/puyo-engine.ts`: 6×12 보드 + 숨은 1행, 시드 난수, 회전 보정, 중력, 4개 연결, 연쇄 점수, 방해 상쇄, 최대 30개 방해 낙하, 전체 제거 보너스, 재접속용 상태 파싱.
- `src/components/puyo/`: 로비, 참가 선택, 경기, 관전 점수판, 결과, 연습, CSS 애니메이션, Web Audio 효과음.
- `public/puyo/assets/`: 직접 그린 팬텀·잠만보·파이리·꼬부기·회색 방해 SVG.
- `functions/src/puyo.ts`: 서버 시각, 교사 권한 확인, 온라인 구성원 확인, 대진 생성, 트랜잭션 승패 판정.
- `functions/src/puyoLogic.ts`: 대진 및 판정 순수 함수.
- Firestore: 기존 `classes/{cid}/games/{gid}` 아래 `puyoPresence`, `puyoStates`. 기존 빙고 제출 데이터와 별도입니다.

자기 보드 상태는 초당 한 번 전송하고 학생은 자기 대결의 두 상태만 구독합니다. 교사는 전체 상태를 구독합니다. 점수는 클라이언트 계산 후 규칙으로 범위·증가량·본인 문서·서버 시간·순번을 확인하며, 서버에서 게임 입력 전체를 재생하는 부정행위 방지 방식은 아닙니다. 이 게임은 XP/쿠폰을 지급하지 않습니다.

## 검증

```sh
npm ci
npm --prefix functions ci
node --test tests/puyo-engine.test.cjs
npx tsc --noEmit
npm --prefix functions run build
npm run build
```

에뮬레이터 통합 테스트는 `demo-puyo` 프로젝트에서만 실행합니다. Auth 9099, Firestore 8080, Functions 5001 포트가 필요합니다.

```sh
firebase emulators:start --project demo-puyo --only auth,firestore,functions
node tests/puyo-emulator.cjs
# 별도 터미널에서 브라우저용 사용자/대기실 생성
node tests/puyo-emulator.cjs --seed
NEXT_PUBLIC_USE_FIREBASE_EMULATORS=true NEXT_PUBLIC_FIREBASE_PROJECT_ID=demo-puyo npm run dev
```

로컬 테스트 계정: `teacher@puyo.test`, `student-a@puyo.test`, `student-b@puyo.test`; 비밀번호 `puyo-test-1234`. **운영 계정이 아닙니다.** 테스트 학급은 `puyo-test`, 방은 `browser-room`입니다. 기본 Firebase 설정에서는 에뮬레이터를 사용하지 않습니다.

검증 범위: 연쇄·방해·회전·낙하·패배, 홀짝 대진, 동점 및 제한 시간, 권한 거부, 상대 상태 변경 거부, 종료 후 변경 거부, 잘못된 상태 무시, 실제 교사·학생 브라우저 연동, 모바일 조작/배치 및 학급 복귀.

## 배포 주의점

이 작업의 기준은 GitHub `main`의 `4488204`입니다. 2026-09-27 운영 Hosting 버전 `b75d27beb84f343e`와 비교했을 때, 운영의 대시보드/차시 정렬 관련 JavaScript가 더 최신입니다. **최신 소스를 병합하기 전 전체 Hosting 운영 배포를 하지 마세요.** 본 변경에서는 기존 화면과 게임을 보존하기 위해 Hosting 미리보기로 검토합니다.

Firestore 운영 규칙 원본은 기준 소스와 일치함을 확인했습니다. 새 규칙과 세 개 함수만 선택해서 배포할 수 있습니다. 기존 함수 전체 배포/삭제는 필요하지 않습니다.

```sh
firebase deploy --project jammanboeng --only functions:puyoStart,functions:puyoFinish,functions:puyoClock,firestore:rules
firebase hosting:channel:deploy puyo-review --project jammanboeng --expires 7d
```

Hosting 미리보기도 같은 Firebase 인증/학급 데이터를 사용합니다. 학급 게임을 시작하면 해당 학급의 활성 게임이 변경됩니다. 실서비스 학급에서 시험하기 전 해당 학급의 진행 중 게임을 확인하세요.
