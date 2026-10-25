# 수업 채팅·교사 제어·공간 효과

## 사용

1. 선생님은 에셋 공방에서 공방을 만들고 기존 초대 링크로 학생을 초대한다.
2. 내 월드 카드 또는 편집기의 **수업으로 공유**를 누른다. 공유 대상은 수업 채팅 패널의 공방 선택에서 바꿀 수 있다.
3. 학생은 상단 **수업**을 눌러 선생님이 공유한 월드를 연다. 개인 브라우저의 프로젝트를 덮어쓰지 않는다.
4. **수업 채팅**에서 전체 대화 또는 교사·학생 간 개별 대화를 보낸다. 교사의 **학생 관리**에서 전체/한 학생을 골라 이동 정지, 화면 가리기, 채팅 잠금을 제어한다. **모두 정상으로**는 모든 제어와 예외를 해제한다.
5. 편집기의 **공간 효과**에서 구역별 흔들림·반대 조작·시야·속도·안내를 설정한다. 도우미에게 “광장에 들어가면 화면이 흔들리고 방향키가 반대로 되고 시야가 좁아지게 해 줘”라고 요청할 수도 있다. 변경안을 확인하고 적용한 뒤 공유한다.

공유 월드는 수업용 읽기 화면이다. 원본 개인 프로젝트는 계속 로컬 편집기에서 고치고 다시 공유한다. 같은 학급 학생들은 공유된 동일한 맵 구성을 각자의 플레이어로 탐험한다. 원격 아바타 좌표 복제나 영상·음성 통화는 포함하지 않는다. 화면 가리기는 이 웹 앱의 학생 화면에 적용한다.

## ZEP 조사

[REA](https://github.com/morluto/rea) 6.7.0으로 [ZEP 공개 화면](https://zep.us/en), [이벤트 API 문서](https://docs.zep.us/zep-script/zep-script-api/scriptapp/event-listeners)의 DOM·접근성 트리·화면을 캡처하고, 공개 랜딩 페이지의 엔트리 JavaScript 모듈(2014바이트)을 정적으로 분석했다.

- 공개 화면: `ev_56dd05f107544d5b6e78a3ae68a3650094c3a927d9527e4f6ba3132d80cad8d4`
- 이벤트 문서: `ev_a97e27d9fec3449d31b7dc433b2712ebd7c7a0926608069394c8b9f8de50a2c1`
- 공개 엔트리 모듈: `ev_9894d48a052d6fc7f884bbc744808bdd15ea0ab80f5b35199f691248467b9849`

전체 웹 번들 그래프 분석은 REA 프로세스의 기본 4GB 힙 한도를 넘어 완료되지 않았다. 위 기록은 제한된 공개 엔트리와 공개 화면의 관찰이며, 로그인한 ZEP 학급이나 내부 서버 구현을 조사한 결과가 아니다. ZEP의 코드를 앱에 복제하거나 비공개 API를 호출하지 않는다.

공식 문서에서 다음 구조를 확인하고 모아 월드의 인증·맵 구조에 맞게 독립적으로 구현했다.

| 조사한 ZEP API | 모아 월드 적용 |
| --- | --- |
| [onSay](https://docs.zep.us/zep-script/zep-script-api/scriptapp/event-listeners), [sendMessage](https://docs.zep.us/zep-script/zep-script-api/scriptplayer/methods) | 학급 전체 대화와 서버에서 수신자를 판정하는 교사·학생 개별 대화 |
| [플레이어 이동 정지 예시](https://docs.zep.us/zep-script/zep-script-guide/explore-zep-script/tutorials/creating-a-2-second-stun-effect) | 담당 교사의 전체/개별 정지와 복구 |
| [구역·키·시간 콜백](https://docs.zep.us/zep-script/zep-script-api/scriptapp/callbacks) | 구역 진입·퇴장·업데이트 이벤트와 자연어 도우미 작업 |
| [카메라 효과](https://docs.zep.us/zep-script/zep-script-api/scriptapp/field) | 플레이어를 따라가는 좁은 시야, 맵 흔들림, HUD와 효과 레이어 분리 |

## 서버와 실시간 갱신

`/api/jamworld/classroom/{classId}`는 기존 Firebase 교사 세션과 공방 학생 세션을 사용한다. 담당 교사·같은 공방 학생만 조회한다. 공유·제어·대화 비우기는 담당 교사만 가능하다. 대화의 발신자 이름·역할은 클라이언트가 지정할 수 없다. 학생의 개별 수신자는 자기 선생님만 가능하며, 다른 학생에게 보낸 개인 대화는 서버에서 제외한다. 학생의 채팅 잠금도 서버에서 검사한다.

- `jamworldClassrooms/{classId}`: 버전, 전체 제어, 학생별 예외, 최근 80개 대화, 공유 월드 정보.
- `jamworldClassroomWorlds/{classId}`: 검증한 프로젝트 스냅샷. 게시 가능한 번들은 700KB 이하이며 모든 맵·포털·효과·스크립트를 검사한다.
- `jamworldClassrooms/{classId}/presence/{actorId}`: 서버 기준 접속 시각. 20초마다 갱신하고 55초를 넘기면 비접속으로 표시한다.
- `jamworldClassroomEvents`: 교사의 제어·복구·대화 비우기 이력.

이 컬렉션은 기존 Firestore 규칙의 기본 거부 대상이며 Admin SDK를 사용하는 API로만 접근한다. 원본 대화 문서에는 개별 대화가 함께 있으므로 직접 클라이언트 읽기를 열면 안 된다. 응답은 `private, no-store`다.

연결은 20초 이내의 긴 폴링이다. Firestore 문서 변경 시 대기 중인 요청이 즉시 깨어난다. 수업 화면 또는 열린 채팅 패널에서만 연결하며, 숨겨진 탭은 폴링과 접속 신호를 중단하고 다시 보이면 최신 상태부터 읽는다. 학생 접속 신호는 45초 간격이며 110초 이상 신호가 없으면 오프라인으로 표시한다. 교사 접속 신호는 보내지 않는다. 연결 종료·시간 초과 시 리스너를 해제하고, 대기 후 응답 전 권한을 다시 확인한다. 대화는 사용자별 10초에 20회, 교사 제어는 분당 60회로 제한한다. 대화 nonce를 사용해 같은 메시지의 재전송을 중복 저장하지 않는다.

새 클라이언트는 `compact=1`로 요청한다. 버전이 그대로면 `{unchanged:true,rev}`만 반환해 명단·접속 목록을 다시 읽지 않는다. 약 30~40초마다 전체 상태를 요청해 교사 접속 목록은 계속 갱신한다. 학생에게는 자신의 제어 상태와 허용된 대화만 전달하며 전체 학생 명단·접속 컬렉션을 조회하지 않는다. 기존 클라이언트의 전체 응답도 지원한다. 공방 요청 피드 역시 버전이 같으면 요청·생성 기록·명단 조회를 생략하고, 클라이언트가 최소 분당 한 번 전체 조회를 요청해 오래 멈춘 생성 복구를 유지한다. 접근 권한이 사라진 연결은 즉시 재시도를 중단한다. 권한 검사와 개인 대화 필터는 캐시하지 않는다.

학생의 제어 상태는 서버에 보관한다. 새로고침 후 제어 상태를 읽기 전에는 플레이어 이동을 허용하지 않는다. 화면 가리기 중에는 앱의 다른 요소를 inert 처리하고, 해제하면 키보드 포커스와 조작을 복구한다. 교사의 정지·화면 가리기는 맵 코드보다 우선한다.

## 맵과 도우미

기존 맵 버전과 호환되는 선택 필드를 추가했다.

- `Zone.effects`: `shake` 0~6px, `reverseControls` boolean, `vision` 반경 2~12칸, `speed` 0.25~2배, `message` 100자 이내.
- `MapDoc.script`: 최대 8000자의 JavaScript.
- `zoneEffect{zoneId,effects}`와 `setScript{source}`를 수동 편집기와 도우미의 공통 작업으로 추가했다.

맵 복제·저장·가져오기·내보내기·공유 시 모두 유지한다. 잘못된 효과 값은 원본을 바꾸지 않고 거부한다. 효과 변경 구역의 경계를 미리보기로 강조하고, 코드 변경은 적용 전 펼쳐 볼 수 있다. 서버의 에이전트 응답도 문법·맵 검증을 거치며 기존 1회 자동 수정 흐름을 따른다. 교사 공유도 코드 문법을 검사하되 서버에서 사용자 코드를 실행하지 않는다.

흔들림은 카메라의 작은 이동이며 `prefers-reduced-motion`에서는 끈다. 반대 조작은 키보드와 조이스틱 모두에 적용한다. 좁은 시야는 플레이어 위치를 따라가며 메뉴·채팅을 가리지 않는다.

## JavaScript

복합 조건은 공간 효과 패널의 접힌 코드 편집기를 사용한다. 모아 월드 전용 API이며 ZEP SDK와 호환되는 코드는 아니다.

```js
World.onEnter("광장", () => {
  World.shake(3, 1500);
  World.message("광장에 오신 걸 환영해요!", 2000);
});
World.onUpdate(ctx => {
  if (ctx.zones.includes("비밀 정원")) {
    World.reverseControls(true, 500);
    World.vision(4, 500);
  }
});
```

`onEnter(구역 id 또는 이름, 함수)`, `onLeave(구역, 함수)`, `onUpdate(함수)`를 지원한다. 콜백에는 `{x,y,time,zones}`를 전달한다. `time`은 맵 플레이 경과 초, `zones`는 현재 구역의 id와 이름이다. 효과 명령은 `shake`, `reverseControls`, `vision`, `speed`, `message`이며 마지막 인자는 100~10000ms 지속 시간이다(기본 1000ms).

코드는 인증된 앱 컨텍스트에서 실행하지 않는다. 불투명 출처 iframe 안의 별도 Worker를 사용하며 CSP로 외부 통신·이미지·프레임을 차단한다. DOM·세션·학생 정보·교사 명령 API를 전달하지 않는다. 메시지는 iframe 출처 창·임의 채널 토큰을 확인하고, 허용된 효과와 범위만 적용한다. 직접 메시지 전송과 하위 Worker 생성을 막고 한 번에 32개 이하의 효과만 받는다. 응답이 없거나 실행이 350ms를 넘으면 중단하고 원래 맵 조작을 유지한다(시작 준비 제한 2.5초). CPU 무한 반복의 종료와 통신 차단을 브라우저에서 검증한다. 브라우저 프로세스의 메모리 사용량을 OS 수준에서 제한하는 구조는 아니다.

## 검증

기존 검증 외에 다음을 추가했다. 교사·학생 데이터 검증은 실제 서비스와 분리된 `demo-jamworld` 에뮬레이터에서 실행한다.

```sh
npx tsx --test scripts/jamworld/core/*.test.ts
node --test scripts/jamworld/classroom.test.cjs
node --test scripts/jamworld/classroom-browser.test.cjs
node --test scripts/jamworld/map-effects.test.cjs
node --test --test-force-exit scripts/jamworld/polling-cost-browser.test.cjs
```

서버 검증은 학급 격리·직접 Firestore 읽기 거부·역할 위조·개별 대화·중복 전송·채팅 잠금·긴 폴링·개별 제어·재접속·권한 회수를 다룬다. 브라우저 검증은 교사 공유→학생 입장→쌍방 대화→정지→개별 화면 가리기→새로고침→복구와 모바일 배치를 다룬다. 맵 효과는 실제 역방향 이동, 좁은 시야, 동작 감소, JavaScript 안내·속도 변경, 통신 차단, 무한 반복 종료를 확인한다.

2026-10-21 `jamworldApi`와 메인 Hosting을 배포했다. 배포 주소에서도 맵 효과 브라우저 검증을 통과했다(`JAMWORLD_ORIGIN=https://jammanboeng.web.app`). 이 검증은 별도 브라우저의 로컬 프로젝트와 모의 인증 응답만 사용하며 실제 학급·학생·에셋 데이터를 만들거나 변경하지 않는다. 실제 수업 API의 익명 요청은 `401`, `private, no-store`로 거부되는 것을 확인했다.
