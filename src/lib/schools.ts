// 학교 검색 (NEIS 나이스 오픈API 프록시 호출)
//
// 회원가입(온보딩) 시 학교 자동완성 콤보박스에 쓰인다.
// Cloud Function(searchSchools)이 NEIS open.neis.go.kr 를 프록시한다.
// 실패하거나 NEIS 키가 없어 결과가 없으면 빈 배열을 반환한다(throw 안 함) —
// 화면은 빈 목록이면 자유 입력으로 폴백한다.
import { httpsCallable } from "firebase/functions";
import { getFunctionsClient } from "@/lib/firebase";

export type School = { name: string; address: string };

export async function searchSchools(query: string): Promise<School[]> {
  const q = query.trim();
  if (q.length < 1) return [];
  try {
    const fn = httpsCallable<{ query: string }, { schools: School[] }>(
      getFunctionsClient(),
      "searchSchools"
    );
    const res = await fn({ query: q });
    return Array.isArray(res.data?.schools) ? res.data.schools.slice(0, 15) : [];
  } catch {
    return [];
  }
}
