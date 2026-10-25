import { test } from "node:test";
import assert from "node:assert/strict";
import { createLessonPacket } from "../../../packages/learningcrew-cli/lib/lesson.mjs";
import { parseLessonEvidence, parseLessonReview, evidenceStats } from "../../../src/features/jamworld/lib/agent/lesson-evidence";
import { parseLessonEvidence as serverParse } from "../../../functions/src/jamworld/lib/agent/lesson-evidence";

const source = () => createLessonPacket({classId:"class-a",lessonId:"lesson-a",origin:"https://jammanboeng.web.app",students:[{code:"S01",name:"김학생"},{code:"S02",name:"박학생"}],responses:{
  lesson:{title:"물의 상태 변화",date:"2026-10-22"},activities:[
    {id:"q1",title:"수증기",kind:"quiz",prompt:"물이 증발하면?",options:["수증기","없어짐"],answerIndex:0,responses:[{student:"김학생(S01)",content:"없어짐"},{student:"박학생(S02)",content:"수증기"}]},
    {id:"q2",title:"이유",kind:"question",prompt:"왜 그럴까요?",responses:[{student:"김학생(S01)",content:'[{"content":[{"type":"text","text":"김학생은 물이 없어졌다고 생각해요. secret@example.com https://private.example/file"}]}]'}]},
  ],reflections:[]},goal:"물의 상태 변화를 설명하기"});

test("CLI packets round-trip through both parsers, anonymize records and recompute quiz grading",()=>{
 const raw=source(),parsed=parseLessonEvidence(raw);assert.ok(parsed);assert.deepEqual(serverParse(raw),parsed);
 assert.doesNotMatch(JSON.stringify(parsed),/김학생|박학생|secret@example|private.example/);
 assert.equal(parsed.records[0].correct,false);assert.equal(parsed.records.find(r=>r.student === "S02")?.correct,true);
 const tampered=JSON.parse(JSON.stringify(raw));tampered.records[0].correct=true;
 assert.equal(parseLessonEvidence(tampered)?.records[0].correct,false);
 const stats=evidenceStats(parsed);assert.equal(stats.quizzes[0].correct,1);assert.equal(stats.quizzes[0].graded,2);assert.equal(stats.respondents,2);
});

test("Evidence is sampled across activities and malformed/unbounded packet contents are rejected",()=>{
 const packet=source();
 const records=(packet.records as Array<Record<string,unknown>>);
 for(const bad of [
   {...packet,classId:"../other"},
   {...packet,records:[...records,{...records[0]}]},
   {...packet,records:[{...records[0],activityId:"missing"}]},
   {...packet,records:[{...records[0],text:"x".repeat(801)}]},
   {...packet,records:[{...records[0],selectedIndex:100}]},
   {...packet,options:{minutes:1,participants:2,groupSize:4,goal:""}},
 ]) assert.equal(parseLessonEvidence(bad),null);
 const sampled=createLessonPacket({classId:"c",lessonId:"l",origin:"https://jammanboeng.web.app",students:[{code:"S01"}],responses:{lesson:{title:"test",date:""},activities:[{id:"early",responses:Array.from({length:200},()=>({student:"S01",content:"early"}))},{id:"late",responses:[{student:"S01",content:"late"}]}]}});
 assert.equal((sampled.records as unknown[]).length,120);assert.ok((sampled.records as Array<{activityId:string}>).some(r=>r.activityId==="late"));
 assert.equal(evidenceStats(parseLessonEvidence(sampled)!).sampled,true);
});

test("AI review must cite existing evidence and allocate the requested lesson duration",()=>{
 const evidence=parseLessonEvidence(source())!;
 const review={facts:[{text:"응답 두 개 중 하나는 물이 없어졌다고 선택했어요.",evidenceIds:["e1","e3"]}],hypotheses:[{text:"증발 후 물의 상태를 더 확인할 필요가 있어요.",evidenceIds:["e1"]}],goals:["물질 보존을 설명해요"],sequence:[{title:"탐구",minutes:25,purpose:"변화를 관찰",zone:"탐구실",check:"물이 어디로 갔나요?"},{title:"공유",minutes:15,purpose:"근거로 설명",zone:"광장",check:"처음 생각과 비교"}],uncertainties:["표본만으로 전체 학생을 단정하지 않아요."]};
 assert.ok(parseLessonReview(review,evidence,40));
 assert.equal(parseLessonReview({...review,facts:[{text:"가짜 근거",evidenceIds:["e999"]}]},evidence,40),null);
 assert.equal(parseLessonReview(review,evidence,45),null);
});
