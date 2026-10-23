// 플레이 퀴즈 점수: 문제별로 처음 맞혔을 때 한 번만 가산한다. 오답 뒤 재도전 정답도 인정, 중복 가산 없음.
import { getAsset } from "./catalog";
import type { MapDoc } from "./types";

export interface QuizScore {
  correct: ReadonlySet<string>;
  attempts: number;
}

export const emptyScore = (): QuizScore => ({ correct: new Set(), attempts: 0 });

export function recordAnswer(score: QuizScore, quizId: string, isCorrect: boolean): QuizScore {
  if (!isCorrect || score.correct.has(quizId)) return { ...score, attempts: score.attempts + 1 };
  return { correct: new Set(score.correct).add(quizId), attempts: score.attempts + 1 };
}

/** Individual progress for one map in the current play session, separate from authored data. */
export interface QuizProgress {
  score: QuizScore;
  completed: ReadonlyMap<string, string>;
  boardLabels: ReadonlyMap<string, string>;
}

export const emptyQuizProgress = (): QuizProgress => ({ score: emptyScore(), completed: new Map(), boardLabels: new Map() });

export function validQuizLabel(label: unknown): label is string {
  return typeof label === "string" && label.trim().length > 0 && Array.from(label).length <= 12 && !/[\u0000-\u001f\u007f]/.test(label);
}

/** Script completion never invents a correct answer or awards quiz points. */
export function completeQuiz(doc: MapDoc, progress: QuizProgress, id: string, label = "완료"): QuizProgress {
  const quiz = doc.interactions.find(i => i.type === "quiz" && i.id === id);
  if (!quiz) throw Error(`퀴즈 ‘${id}’를 찾을 수 없어요. 상호작용 ID를 확인해 주세요`);
  if (!validQuizLabel(label)) throw Error("완료 문구는 1~12자로 입력해 주세요");
  label = label.trim();
  if (progress.completed.get(id) === label) return progress;
  const completed = new Map(progress.completed).set(id, label), boardLabels = new Map(progress.boardLabels);
  // Link using the authored position, so script-moved boards keep the same completion state.
  for (const object of doc.objects) {
    if (object.x === quiz.x && object.y === quiz.y && getAsset(object.assetId)?.interaction === "quiz") boardLabels.set(object.id, label);
  }
  return { ...progress, completed, boardLabels };
}

export function answerQuiz(doc: MapDoc, progress: QuizProgress, id: string, correct: boolean): QuizProgress {
  if (progress.completed.has(id)) return progress;
  if (!doc.interactions.some(i => i.type === "quiz" && i.id === id)) throw Error("퀴즈를 찾을 수 없어요");
  const next = { ...progress, score: recordAnswer(progress.score, id, correct) };
  return correct ? completeQuiz(doc, next, id) : next;
}
