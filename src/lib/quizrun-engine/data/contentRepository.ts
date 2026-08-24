// 학습 콘텐츠 로더 — 어솔 원본은 자체 Firestore(learningPacks/default)에서
// 최신 팩을 받아오고 실패하면 내장본으로 떨어졌다.
//
// 러닝크루로 옮기며 원격 조회는 뺐다. 원격 팩은 어솔 프로젝트(earsoul-hsy)에
// 있어 러닝크루에서 읽을 수 없고, 지금은 내장 팩(3개 맵)이 곧 최신이다.
// 나중에 러닝크루 쪽에 팩을 두고 싶으면 여기만 바꾸면 된다 — 호출부는 그대로.
import type { LearningPack } from '../types'
import { fallbackLearningPack } from './learningPack'

export async function loadLearningPack(): Promise<LearningPack> {
  return fallbackLearningPack
}
