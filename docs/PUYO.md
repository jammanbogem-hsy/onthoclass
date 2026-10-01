# 학급 뿌요뿌요

## 교사·학생 사용 흐름 (= 규칙)

규칙과 진행 흐름의 원본은 `src/lib/puyo-rules.ts` 하나이며, 게임 열기 창·대기실·경기 중 [규칙] 대화상자가 모두 이를 읽는다. 서버는 `functions/src/puyoLogic.ts`의 `normalizeRules`·`validatePlan`으로 같은 규칙을 다시 검증한다.

교사가 정하는 규칙(게임 열기 → 뿌요뿌요):
- 경기 시간 1~15분, 1:1 짝 정하기(무작위 / 선생님이 직접 자리 바꾸기), 홀수일 때(선생님 참가 / 한 명 쉬기, 쉰 친구는 다음 판 먼저), 이긴 학생 보상 0·5·10·15·20 XP.

진행 흐름:
1. 게임 열기(교사) → 2. 대기실 입장(학생 자동 이동) → 3. 참가자 고르기(최대 40명) → 4. 1:1 짝 미리보기·확정(다시 섞기 / 직접 바꾸기, 선택·접속이 바뀌면 다시 만들기) → 5. 6초 준비(짝은 같은 뿌요 순서) → 6. 대결 → 7. 승부 결정(먼저 막히면 패, 시간·교사 종료 시 점수, 동점 무승부, 25초 끊김 패) → 8. 결과·보상(교사 승리·무승부 보상 없음) → 9. 한 판 더(같은 규칙, 활성 포인터 이동으로 모두 함께 이동, 지난 참가자 미리 체크) 또는 마치기.

`/puyo/`에서는 로그인 없이 혼자 연습할 수 있습니다.

조작: ← → 이동, ↓ 빠르게 내리기, Z/X 또는 ↑ 회전, Space 바로 낙하. 화면 버튼으로 터치 조작도 지원합니다.

## 구성

- `src/lib/puyo-engine.ts`: 6×12 보드 + 숨은 1행, 시드 난수, 회전 보정, 중력, 4개 연결, 연쇄 점수, 방해 상쇄, 최대 30개 방해 낙하, 전체 제거 보너스, 재접속용 상태 파싱.
- `src/components/puyo/`: 로비, 참가 선택, 경기, 관전 점수판, 결과, 연습, CSS 애니메이션, Web Audio 효과음.
- `public/puyo/assets/`: 팬텀·잠만보·파이리·꼬부기·회색 방해 SVG. 같은 조명(좌상단 키라이트·하단 반사광·접지 그림자)의 입체 젤리 스타일이며 `node scripts/puyo-sprites.cjs`로 다시 생성합니다.
- `functions/src/puyo.ts`: 서버 시각, 교사 권한 확인, 온라인 구성원 확인, 대진 생성, 트랜잭션 승패 판정.
- `functions/src/puyoLogic.ts`: 대진 및 판정 순수 함수.
- `src/lib/puyo-realtime.ts`, `database.puyo.rules.json`: Realtime Database의 임시 보드 전송. 서버가 만든 대진의 본인/상대와 교사만 읽을 수 있고, 본인 보드만 경기 시간 안에 쓸 수 있습니다.
- `src/lib/puyo-sync.ts`: 단일 전송과 최신 상태 병합으로 느린 연결에서도 오래된 전송이 쌓이지 않게 합니다.
- Firestore: 기존 `classes/{cid}/games/{gid}` 아래 `puyoPresence`, `puyoStates`. 기존 빙고 제출 데이터와 별도입니다.

상대 보드는 Realtime Database로 최대 100ms 간격으로 전송하고, 조작/연쇄/패배는 즉시 전송을 요청합니다. 본인 조작은 서버 응답을 기다리지 않습니다. Firestore에는 매초 복구용 상태를 저장하며 중요한 공격/패배는 바로 저장합니다. 브라우저에도 250ms마다 마지막 경기 상태를 보관해, 연결 복구 직후 저장 응답 전에 새로고침해도 같은 계정·경기를 복원합니다. 실시간 채널 장애나 예전 게임방은 Firestore로 대체합니다. 교사는 Firestore의 전체 점수판을 구독합니다.

승패 확정 시 서버는 두 채널의 최신 점수와 패배 상태를 확인하고 최종 보드를 보관한 뒤 실시간 방을 삭제합니다. 결과·XP·지급 기록·만보를 하나의 Firestore 트랜잭션으로 처리하며 `puyo_{gameId}_{matchId}` 기록으로 중복 지급을 막습니다. 점수 자체는 클라이언트 계산과 규칙 검증 방식이며, 모든 입력을 서버에서 재생하는 완전한 부정행위 방지는 아닙니다.

## 검증

```sh
npm ci
npm --prefix functions ci
node --test tests/puyo-engine.test.cjs tests/puyo-sync.test.cjs
npx tsc --noEmit
npm --prefix functions run build
npm run build
```

에뮬레이터 통합 테스트는 `demo-puyo` 프로젝트에서만 실행합니다. Auth 9099, Firestore 8080, Functions 5001, Realtime Database 9000 포트가 필요합니다.

```sh
firebase emulators:start --project demo-puyo --only auth,firestore,functions,database
node tests/puyo-emulator.cjs
node tests/puyo-load.cjs # 40명 / 20경기 동시 부하
# 별도 터미널에서 브라우저용 사용자/대기실 생성
node tests/puyo-emulator.cjs --seed
NEXT_PUBLIC_USE_FIREBASE_EMULATORS=true NEXT_PUBLIC_FIREBASE_PROJECT_ID=demo-puyo npm run dev
```

로컬 테스트 계정: `teacher@puyo.test`, `student-a@puyo.test`, `student-b@puyo.test`; 비밀번호 `puyo-test-1234`. **운영 계정이 아닙니다.** 테스트 학급은 `puyo-test`, 방은 `browser-room`입니다. 기본 Firebase 설정에서는 에뮬레이터를 사용하지 않습니다.

검증 범위: 연쇄·방해·회전·낙하·패배, 홀짝 대진, 동점 및 제한 시간, 권한 거부, 상대 상태 변경 거부, 종료 후 변경 거부, 잘못된 상태 무시, 실제 교사·학생 브라우저 연동, 모바일 조작/배치 및 학급 복귀.

## 배포 주의점

이 브랜치는 운영에 배포된 최신 main(`a38135e`, v1.3.1)을 병합한 상태라 전체 Hosting 배포가 기존 화면을 되돌리지 않습니다.

Firestore 운영 규칙 원본은 기준 소스와 일치함을 확인했습니다. Firestore 규칙·뿌요 Realtime Database 규칙과 세 개 함수만 선택해서 배포할 수 있습니다. 기존 함수 전체 배포/삭제는 필요하지 않습니다.

```sh
firebase deploy --project jammanboeng --only functions:puyoStart,functions:puyoFinish,functions:puyoClock,firestore:rules,database
firebase hosting:channel:deploy puyo-review --project jammanboeng --expires 7d
```

Hosting 미리보기도 같은 Firebase 인증/학급 데이터를 사용합니다. 학급 게임을 시작하면 해당 학급의 활성 게임이 변경됩니다. 실서비스 학급에서 시험하기 전 해당 학급의 진행 중 게임을 확인하세요.

실시간 데이터베이스: `jammanboeng-default-rtdb` (asia-southeast1), 게임 전용 `/puyo/{classId}/{gameId}` 경로입니다. 운영 Hosting은 최신 소스 병합 전까지 유지하고 미리보기 채널만 업데이트합니다.

## 2026-09-28 실시간 / 보상 확인

- 실제 Firebase, 같은 컴퓨터·회선의 독립 Chromium 학생 세션 2개: 상대 점수 DOM 반영 29건 중앙값 133ms, p95 184ms, 최대 347ms. 본인 조작 DOM 반영 중앙값 1ms, p95 2ms.
- 실제 2연쇄: 누적 방해 5→35개가 상대에게 152ms / 117ms 뒤 도착, 중복 수신 없음.
- 로컬 Firebase 에뮬레이터 40 클라이언트 / 20경기 / 12초: 4,600회 수신, 오류 0, 중앙값 12ms / p95 50ms / 최대 86ms. 실제 학교망 40기기 측정과는 다릅니다.
- 약 5초 오프라인 중 얻은 9점을 연결 복구 직후 새로고침해도 보존하고 상대 화면에 동일하게 반영되는지 확인.
- 실제 임시 QA 학생 승리 시 XP 10 지급, 같은 경기 종료를 재요청해도 동일 XP 유지 확인. 임시 데이터는 검증 후 삭제합니다.
- 에뮬레이터에서 동시 6회 종료·결과 재처리·다음 라운드·교사 승리·무승부·마지막 실시간 점수 판정·XP/만보 중복 방지 검증.

위 수치는 해당 환경의 표본이며 네트워크 무지연을 보장하지 않습니다.
