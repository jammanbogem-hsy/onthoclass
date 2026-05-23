// 더미 학생 응답 20개를 'ㅇㅇㅇ' 프로젝트의 '테스트' 차시 질문(들)에 주입.
// firebase-tools 의 refresh token 으로 OAuth 액세스 토큰을 받아 Firestore REST API 호출.
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

const PROJECT = "jammanboeng";
const DB = `projects/${PROJECT}/databases/(default)/documents`;
const ROOT = `https://firestore.googleapis.com/v1/${DB}`;

const cfgPath = path.join(
  os.homedir(),
  ".config/configstore/firebase-tools.json"
);
const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
const refresh = cfg.tokens.refresh_token;

async function token() {
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id:
        "563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com",
      client_secret: "j9iVZfS8kkCEFUPaAeJV0sAi",
      refresh_token: refresh,
      grant_type: "refresh_token",
    }),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error("token: " + JSON.stringify(j));
  return j.access_token;
}

async function listColl(tok, parentPath, coll) {
  // parentPath like "" (root) or "classes/xxx/lessons/yyy"
  let url;
  if (!parentPath) url = `${ROOT}/${coll}`;
  else url = `${ROOT}/${parentPath}/${coll}`;
  const out = [];
  let pageToken = "";
  for (;;) {
    const u = pageToken ? `${url}?pageToken=${pageToken}&pageSize=200` : `${url}?pageSize=200`;
    const r = await fetch(u, {
      headers: { Authorization: "Bearer " + tok },
    });
    if (!r.ok) {
      const t = await r.text();
      throw new Error(`listColl ${u} :: ${r.status} ${t}`);
    }
    const j = await r.json();
    for (const d of j.documents ?? []) out.push(d);
    if (!j.nextPageToken) break;
    pageToken = j.nextPageToken;
  }
  return out;
}

function fields(o) {
  const out = {};
  for (const [k, v] of Object.entries(o)) {
    if (v === null) out[k] = { nullValue: null };
    else if (typeof v === "string") out[k] = { stringValue: v };
    else if (typeof v === "number")
      out[k] = Number.isInteger(v)
        ? { integerValue: String(v) }
        : { doubleValue: v };
    else if (typeof v === "boolean") out[k] = { booleanValue: v };
    else if (v && v.__server === "ts")
      out[k] = { timestampValue: new Date().toISOString() };
    else if (Array.isArray(v))
      out[k] = {
        arrayValue: {
          values: v.map((x) =>
            typeof x === "string"
              ? { stringValue: x }
              : { stringValue: String(x) }
          ),
        },
      };
    else if (typeof v === "object")
      out[k] = { mapValue: { fields: fields(v) } };
  }
  return out;
}

async function patchDoc(tok, docPath, data) {
  const u = `${ROOT}/${docPath}`;
  const r = await fetch(u, {
    method: "PATCH",
    headers: {
      Authorization: "Bearer " + tok,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ fields: fields(data) }),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`patch ${u} :: ${r.status} ${t}`);
  }
}

// 다양한 응답 풀 (긍정/부정/중립 혼합 + 공유 개념)
const NAMES = [
  "김민서","이지호","박서연","최예준","정하윤","강서아","조도윤","윤하린",
  "장은우","임시우","오지안","한유나","송아인","권채원","황건우","배수아",
  "남이서","문태민","고해린","서지율"
];

// 고조선에서 배운 키워드 5개 — 다양·중복 적절히 섞어 온톨로지 검증용
const RESPONSES = [
  "단군왕검, 비파형동검, 고인돌, 8조법, 청동기",
  "단군신화, 곰, 호랑이, 마늘과 쑥, 환웅",
  "단군왕검, 청동기, 8조법, 비파형동검, 미송리식토기",
  "고조선, 만주, 한반도, 위만조선, 한사군",
  "고인돌, 비파형동검, 청동기시대, 농경, 사유재산",
  "단군왕검, 환웅, 환인, 홍익인간, 제정일치",
  "8조법, 사유재산, 계급사회, 청동기, 노비",
  "위만, 한사군, 멸망, 비파형동검, 고인돌",
  "단군왕검, 청동기, 부족국가, 고인돌, 8조법",
  "환웅, 곰, 마늘, 쑥, 단군",
  "고조선, 청동기, 농경, 미송리식토기, 비파형동검",
  "8조법, 노비, 사유재산, 계급, 청동기",
  "단군신화, 홍익인간, 환웅, 곰, 단군왕검",
  "비파형동검, 고인돌, 청동기, 만주, 한반도",
  "위만조선, 한사군, 멸망, 단군왕검, 고조선",
  "단군왕검, 8조법, 비파형동검, 청동기, 고인돌",
  "농경, 청동기, 사유재산, 계급, 부족국가",
  "고조선, 단군왕검, 위만조선, 한사군, 8조법",
  "환웅, 단군, 곰, 호랑이, 홍익인간",
  "비파형동검, 미송리식토기, 청동기, 고인돌, 8조법"
];

(async () => {
  const tok = await token();
  // 1) 모든 학급 조회
  const classes = await listColl(tok, "", "classes");
  let found = null; // {cid, lid, qids}
  for (const c of classes) {
    const cid = c.name.split("/").pop();
    const projects = await listColl(tok, `classes/${cid}`, "projects");
    const tgtProj = projects.find(
      (p) =>
        (p.fields?.name?.stringValue ?? "").trim() === "ㅇㅇㅇ" ||
        (p.fields?.name?.stringValue ?? "").trim() === "ooo"
    );
    if (!tgtProj) continue;
    const pid = tgtProj.name.split("/").pop();
    const lessons = await listColl(tok, `classes/${cid}`, "lessons");
    const tgtLesson = lessons.find(
      (l) =>
        (l.fields?.projectId?.stringValue ?? "") === pid &&
        (l.fields?.title?.stringValue ?? "").trim() === "테스트"
    );
    if (!tgtLesson) continue;
    const lid = tgtLesson.name.split("/").pop();
    const questions = await listColl(
      tok,
      `classes/${cid}/lessons/${lid}`,
      "questions"
    );
    const qids = questions
      .filter(
        (q) =>
          ((q.fields?.kind?.stringValue ?? "question") === "question")
      )
      .map((q) => q.name.split("/").pop());
    found = { cid, lid, qids };
    break;
  }
  if (!found) {
    console.error("대상 차시를 찾지 못했습니다 (ㅇㅇㅇ/ooo · 테스트).");
    process.exit(2);
  }
  if (found.qids.length === 0) {
    console.error("해당 차시에 'question' 종류 질문이 없습니다.");
    process.exit(3);
  }
  console.log(
    `대상: classes/${found.cid}/lessons/${found.lid} · 질문 ${found.qids.length}개`
  );

  // 2) 각 질문에 20명 더미 응답 주입
  for (const qid of found.qids) {
    console.log(` → 질문 ${qid}`);
    for (let i = 0; i < 20; i++) {
      const uid = `dummy_${String(i + 1).padStart(3, "0")}`;
      const name = NAMES[i % NAMES.length];
      const text = RESPONSES[i % RESPONSES.length];
      const docPath = `classes/${found.cid}/lessons/${found.lid}/questions/${qid}/submissions/${uid}`;
      await patchDoc(tok, docPath, {
        uid,
        studentName: name,
        phase: "pre",
        content: text,
        submittedAt: { __server: "ts" },
      });
    }
  }
  console.log("완료 ✅");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
