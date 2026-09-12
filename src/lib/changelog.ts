// 앱 버전과 업데이트 내역 — 좌하단 피드백 버튼 안의 [업데이트] 탭에서 보여준다.
// 학생도 읽는 화면이므로 문구는 쉬운 말로 쓴다.
//
// ── 번호 규칙 ────────────────────────────────────────────────
//   앞자리   v1 → v2      기능이 전면적으로 바뀌거나 새 영역이 통째로 들어올 때
//   가운데   v1.0 → v1.1  기존 기능을 넓히거나 눈에 띄게 고칠 때
//   끝자리   v1.1 → v1.1.1 안정화·최적화·버그 수정
//
// ── 새 버전을 낼 때 ──────────────────────────────────────────
//   1) CHANGELOG 맨 앞에 항목을 하나 추가한다(맨 앞이 최신).
//   2) APP_VERSION 을 그 버전으로 올린다.
//   버전이 올라가면 학생·교사의 피드백 버튼에 빨간 점이 떠서 새 소식을 알린다.

export const APP_VERSION = "1.3.0";

export type ChangeKind = "major" | "minor" | "patch";

export type ChangeEntry = {
  version: string;
  /** YYYY-MM-DD (KST). 아주 오래된 항목은 비워 둘 수 있다. */
  date?: string;
  kind: ChangeKind;
  title: string;
  items: string[];
};

export const KIND_META: Record<
  ChangeKind,
  { label: string; bg: string; fg: string }
> = {
  major: {
    label: "큰 변화",
    bg: "var(--md-sys-color-primary-container)",
    fg: "var(--md-sys-color-on-primary-container)",
  },
  minor: {
    label: "기능 추가",
    bg: "var(--md-sys-color-tertiary-container)",
    fg: "var(--md-sys-color-on-tertiary-container)",
  },
  patch: {
    label: "안정화",
    bg: "var(--md-sys-color-surface-container-highest)",
    fg: "var(--md-sys-color-on-surface-variant)",
  },
};

export const CHANGELOG: readonly ChangeEntry[] = [
  {
    version: "1.3.0",
    date: "2026-08-31",
    kind: "minor",
    title: "여름 앨범이 '잼 컴퓨터' 바탕화면으로",
    items: [
      "Lesson 7 여름 앨범 화면이 진짜 컴퓨터처럼 바뀌었어요. 위에는 메뉴 막대, 아래에는 Dock, 가운데는 바탕화면이에요.",
      "학급 앨범·친구 작품 폴더·내 작품 올리기가 바탕화면 아이콘이 됐어요. 두 번 누르면 창이 열리고, 창은 끌어서 옮길 수 있어요.",
      "책을 볼 때 '전체 화면으로 보기'를 누르면 화면 가득 펼쳐서 읽을 수 있어요.",
      "소감을 쓰면 내 이름이 붙은 쪽지가 바탕화면에 생겨요. 친구 쪽지를 두 번 누르면 무슨 이야기를 썼는지 읽을 수 있어요.",
      "바탕화면 그림이 잔잔하게 움직여요(느린 인터넷·모션 최소화 설정에서는 정지 그림으로 보여요).",
    ],
  },
  {
    version: "1.2.2",
    date: "2026-08-27",
    kind: "patch",
    title: "학급 화면 정리",
    items: [
      "선생님 학급 화면에서 '최근 퀴즈런' 카드를 뺐어요. 지난 퀴즈런 순위와 러닝볼은 학급 관리 → 게임 이력에서 더 자세히 볼 수 있어요.",
      "학생 화면에는 그대로 남아 있어요 — 자기 러닝볼과 등수를 여기서 보니까요.",
    ],
  },
  {
    version: "1.2.1",
    date: "2026-08-26",
    kind: "patch",
    title: "대회 설명 붙이기",
    items: [
      "주식대회를 열 때 설명을 적을 수 있어요. 대회 취지나 규칙, 상품 같은 걸 적어 두면 학생들이 대회를 열어볼 때 맨 위에 보여요.",
      "대회 이름을 다 적었는데도 '이름을 정해 주세요' 경고가 남아 있던 문제를 고쳤어요.",
    ],
  },
  {
    version: "1.2.0",
    date: "2026-08-26",
    kind: "minor",
    title: "주식대회와 새 계좌 화면",
    items: [
      "주식대회가 생겼어요 — 선생님이 대회를 열면 수익률(비율)이나 번 금액으로 등수를 매겨요. 대회를 연 순간부터의 성적만 겨루니 공평해요.",
      "내 계좌 화면이 진짜 증권 앱처럼 바뀌었어요. [잔고]에서 종목마다 매입가·현재가·평가손익을, [실현손익]에서 팔아서 확정한 손익을 볼 수 있어요.",
      "오늘 · 1주일 · 1개월 · 전체 중에 기간을 골라 수익을 볼 수 있어요. 날짜별·종목별로도 나눠서 보여줘요.",
      "거래 기록의 '매도' 줄마다 그때 확정된 실현손익이 함께 나와요.",
      "선생님은 학생 이름을 누르면 그 학생의 계좌 현황을 똑같이 볼 수 있어요.",
    ],
  },
  {
    version: "1.1.0",
    date: "2026-07-19",
    kind: "minor",
    title: "만보 트레이딩",
    items: [
      "모은 만보로 진짜 주식 시세를 따라가는 모의 투자를 할 수 있어요.",
      "캔들 차트, 오늘의 시장 지수, 우리 반 거래 소식과 수익률 랭킹이 있어요.",
      "실제 증시처럼 평일 오전 9시 ~ 오후 3시 30분에만 사고팔 수 있어요.",
      "거래할 때마다 아주 작은 수수료가 붙어요 — 너무 자주 사고팔면 손해예요.",
    ],
  },
  {
    version: "1.0.0",
    kind: "major",
    title: "러닝크루",
    items: [
      "학급과 차시, 과제와 질문 활동, 경험치와 만보, 러닝마켓, 칭찬, 함께 쓰는 캔버스, 수업 게임 등 기본 기능이 갖춰졌어요.",
    ],
  },
];

const SEEN_KEY = "jam:changelog:seen";

/** 이 브라우저에서 마지막으로 확인한 버전 — 저장이 막혀 있으면 null. */
export function lastSeenVersion(): string | null {
  try {
    return localStorage.getItem(SEEN_KEY);
  } catch {
    return null;
  }
}

/** 아직 못 본 새 버전이 있는가 — 버튼에 빨간 점을 띄울지 판단. */
export function hasUnseenUpdate(): boolean {
  return lastSeenVersion() !== APP_VERSION;
}

/** 업데이트 탭을 열었을 때 호출 — 이 버전을 봤다고 기록한다. */
export function markChangelogSeen(): void {
  try {
    localStorage.setItem(SEEN_KEY, APP_VERSION);
  } catch {
    // 사생활 보호 모드 등으로 저장이 막혀도 화면은 정상 동작해야 한다.
  }
}
