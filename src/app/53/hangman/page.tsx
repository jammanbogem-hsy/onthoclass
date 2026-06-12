"use client";

// 5단원 행맨 게임 — 독립 페이지(/53/hangman). LMS(로그인·DB)와 분리된 자체 완결 화면.
// 진행: 교사가 알파벳/힌트를 클릭, 큰 화면으로 학생들이 관전. 단어: UNDERGROUND.
import { useMemo, useState } from "react";

const WORD = "UNDERGROUND";
const MAX_WRONG = 6; // 머리·몸통·양팔·양다리 = 6단계
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

// 힌트는 버튼을 눌러야 공개(약 → 강). 교사가 학생 반응 보며 단계적으로 연다.
const HINTS = [
  "장소·위치를 나타내는 영어 단어예요. 11글자, under 로 시작해요.",
  "뜻은 ‘땅 아래’ = 지하(地下)! ‘under(아래)’ + ‘ground(땅)’ 를 합친 말이에요.",
  "영국에서는 ‘지하철’을 the ___ 라고 해요. 예: Let’s take the underground.",
];

export default function HangmanPage() {
  const [guessed, setGuessed] = useState<Set<string>>(new Set());
  const [hints, setHints] = useState<Set<number>>(new Set());

  const wrongLetters = useMemo(
    () => [...guessed].filter((l) => !WORD.includes(l)),
    [guessed]
  );
  const wrongCount = wrongLetters.length;
  const won = useMemo(
    () => [...new Set(WORD.split(""))].every((l) => guessed.has(l)),
    [guessed]
  );
  const lost = wrongCount >= MAX_WRONG;
  const over = won || lost;

  function guess(letter: string) {
    if (over || guessed.has(letter)) return;
    setGuessed((prev) => new Set(prev).add(letter));
  }
  function reset() {
    setGuessed(new Set());
    setHints(new Set());
  }
  function showHint(i: number) {
    setHints((prev) => new Set(prev).add(i));
  }

  return (
    <main className="flex min-h-screen flex-col items-center bg-[var(--md-sys-color-surface)] px-4 py-6 text-[var(--md-sys-color-on-surface)]">
      <div className="w-full max-w-4xl">
        <header className="mb-4 text-center">
          <p className="text-sm font-semibold text-[var(--md-sys-color-primary)]">
            6학년 5단원 · 영어 단어 게임
          </p>
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
            행맨 (Hangman)
          </h1>
          <p className="mt-1 text-sm text-[var(--md-sys-color-on-surface-variant)]">
            선생님이 알파벳을 눌러 진행해요. 틀리면 그림이 하나씩 그려져요!
          </p>
        </header>

        <div className="grid gap-5 sm:grid-cols-2">
          {/* 교수대 그림 */}
          <section className="flex flex-col items-center justify-center rounded-3xl bg-[var(--md-sys-color-surface-container)] p-5">
            <Gallows wrong={over && lost ? MAX_WRONG : wrongCount} />
            <p className="mt-3 text-sm font-semibold text-[var(--md-sys-color-on-surface-variant)]">
              남은 기회 {Math.max(0, MAX_WRONG - wrongCount)} / {MAX_WRONG}
            </p>
            {wrongLetters.length > 0 && (
              <p className="mt-1 text-center text-sm">
                <span className="text-[var(--md-sys-color-on-surface-variant)]">
                  틀린 글자:{" "}
                </span>
                <span className="font-bold text-[var(--md-sys-color-error)]">
                  {wrongLetters.join(" ")}
                </span>
              </p>
            )}
          </section>

          {/* 단어 + 힌트 */}
          <section className="flex flex-col gap-4">
            {/* 단어 칸 */}
            <div className="flex flex-wrap items-end justify-center gap-2 rounded-3xl bg-[var(--md-sys-color-surface-container)] p-6">
              {WORD.split("").map((ch, i) => {
                const shown = guessed.has(ch) || lost;
                return (
                  <span
                    key={i}
                    className={`flex h-14 w-9 items-end justify-center border-b-4 pb-1 text-3xl font-extrabold sm:h-16 sm:w-11 sm:text-4xl ${
                      shown && !guessed.has(ch)
                        ? "border-[var(--md-sys-color-error)] text-[var(--md-sys-color-error)]"
                        : "border-[var(--md-sys-color-outline)] text-[var(--md-sys-color-on-surface)]"
                    }`}
                  >
                    {shown ? ch : ""}
                  </span>
                );
              })}
            </div>

            {/* 힌트 버튼 */}
            <div className="rounded-3xl bg-[var(--md-sys-color-surface-container)] p-4">
              <p className="mb-2 text-sm font-bold">💡 힌트 (누르면 공개)</p>
              <div className="flex flex-wrap gap-2">
                {HINTS.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => showHint(i)}
                    className={`rounded-full px-4 py-2 text-sm font-bold transition ${
                      hints.has(i)
                        ? "bg-[var(--md-sys-color-secondary-container)] text-[var(--md-sys-color-on-secondary-container)]"
                        : "bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)] hover:brightness-105"
                    }`}
                  >
                    힌트 {i + 1}
                  </button>
                ))}
              </div>
              {hints.size > 0 && (
                <ul className="mt-3 flex flex-col gap-2">
                  {[...hints]
                    .sort((a, b) => a - b)
                    .map((i) => (
                      <li
                        key={i}
                        className="rounded-2xl bg-[var(--md-sys-color-surface-container-high)] px-4 py-2.5 text-sm leading-relaxed"
                      >
                        <b className="text-[var(--md-sys-color-primary)]">
                          힌트 {i + 1}.
                        </b>{" "}
                        {HINTS[i]}
                      </li>
                    ))}
                </ul>
              )}
            </div>
          </section>
        </div>

        {/* 결과 배너 */}
        {over && (
          <div
            className={`mt-5 rounded-3xl p-5 text-center ${
              won
                ? "bg-[var(--md-sys-color-tertiary-container)] text-[var(--md-sys-color-on-tertiary-container)]"
                : "bg-[var(--md-sys-color-error-container)] text-[var(--md-sys-color-on-error-container)]"
            }`}
          >
            <p className="text-2xl font-extrabold">
              {won ? "🎉 정답이에요!" : "아쉬워요!"}
            </p>
            <p className="mt-1 text-lg font-bold">
              정답: <span className="tracking-widest">{WORD}</span> (지하의, 땅속의)
            </p>
          </div>
        )}

        {/* 알파벳 키보드 (교사 진행) */}
        <div className="mt-5 flex flex-wrap justify-center gap-1.5 sm:gap-2">
          {ALPHABET.map((letter) => {
            const used = guessed.has(letter);
            const correct = used && WORD.includes(letter);
            return (
              <button
                key={letter}
                onClick={() => guess(letter)}
                disabled={used || over}
                className={`flex h-11 w-9 items-center justify-center rounded-xl text-lg font-bold transition disabled:cursor-not-allowed sm:h-12 sm:w-11 sm:text-xl ${
                  correct
                    ? "bg-[var(--md-sys-color-tertiary-container)] text-[var(--md-sys-color-on-tertiary-container)]"
                    : used
                      ? "bg-[var(--md-sys-color-error-container)] text-[var(--md-sys-color-on-error-container)] opacity-70"
                      : over
                        ? "bg-[var(--md-sys-color-surface-container)] text-[var(--md-sys-color-on-surface-variant)] opacity-40"
                        : "bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface)] hover:bg-[var(--md-sys-color-primary)] hover:text-[var(--md-sys-color-on-primary)]"
                }`}
              >
                {letter}
              </button>
            );
          })}
        </div>

        {/* 다시 하기 */}
        <div className="mt-6 flex justify-center">
          <button
            onClick={reset}
            className="inline-flex items-center gap-2 rounded-full border border-[var(--md-sys-color-outline)] px-6 py-2.5 text-sm font-bold text-[var(--md-sys-color-primary)] transition hover:bg-[color-mix(in_srgb,var(--md-sys-color-primary)_8%,transparent)]"
          >
            ↺ 다시 하기
          </button>
        </div>
      </div>
    </main>
  );
}

/** 교수대 + 행맨 figure. wrong(0~6) 단계만큼 신체 부위가 나타난다. */
function Gallows({ wrong }: { wrong: number }) {
  const stroke = "var(--md-sys-color-on-surface)";
  const body = "var(--md-sys-color-error)";
  const part = (n: number) => (wrong >= n ? body : "transparent");
  return (
    <svg
      viewBox="0 0 200 220"
      className="h-56 w-auto sm:h-64"
      aria-label={`틀린 횟수 ${wrong}`}
    >
      {/* 교수대 */}
      <g stroke={stroke} strokeWidth={5} strokeLinecap="round" fill="none">
        <line x1="20" y1="210" x2="120" y2="210" />
        <line x1="50" y1="210" x2="50" y2="20" />
        <line x1="50" y1="20" x2="140" y2="20" />
        <line x1="140" y1="20" x2="140" y2="45" />
      </g>
      {/* figure (틀릴 때마다 1개씩) */}
      <g strokeWidth={5} strokeLinecap="round" fill="none">
        {/* 1 머리 */}
        <circle cx="140" cy="62" r="17" stroke={part(1)} />
        {/* 2 몸통 */}
        <line x1="140" y1="79" x2="140" y2="135" stroke={part(2)} />
        {/* 3 왼팔 */}
        <line x1="140" y1="95" x2="116" y2="115" stroke={part(3)} />
        {/* 4 오른팔 */}
        <line x1="140" y1="95" x2="164" y2="115" stroke={part(4)} />
        {/* 5 왼다리 */}
        <line x1="140" y1="135" x2="120" y2="170" stroke={part(5)} />
        {/* 6 오른다리 */}
        <line x1="140" y1="135" x2="160" y2="170" stroke={part(6)} />
      </g>
    </svg>
  );
}
