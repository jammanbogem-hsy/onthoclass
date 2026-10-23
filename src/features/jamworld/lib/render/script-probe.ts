import { MapScriptRuntime } from "./map-script";
import { ScriptScene, type ScriptChoice, type ScriptObjectPatch } from "../world/script-scene";
import { zonesAt } from "../world/effects";
import type { MapDoc } from "../world/types";
import { answerQuiz, completeQuiz, emptyQuizProgress } from "../world/quiz";

/** A bounded smoke run of generated code in the same isolated runtime used by Play. */
export async function probeMapScript(doc: MapDoc, signal: AbortSignal): Promise<string | null> {
  if (!doc.script?.trim()) return null;
  let error: string | null = null;
  const runtime = new MapScriptRuntime(doc.script, e => { error = e; });
  const scene = new ScriptScene(doc);
  let progress = emptyQuizProgress();
  let player = scene.world.spawnState();
  const wait = () => new Promise<void>(resolve => setTimeout(resolve, 120));
  try {
    const end = performance.now() + 3000;
    while (!runtime.isReady && !error && !signal.aborted && performance.now() < end) await wait();
    if (!runtime.isReady) return error || "코드를 준비하지 못했어요";
    const points = [doc.spawn, ...doc.zones.slice(0, 6).map(z => ({ x: z.x, y: z.y }))];
    const interactions = scene.objects().filter(o => runtime.bindings.some(b => [o.id, o.name, o.assetId].includes(b))).slice(0, 6);
    const quizzes = doc.interactions.filter(v => v.type === "quiz").slice(0, 6);
    const applyActions = () => {
      for (const action of runtime.drainActions()) {
        if (action.kind === "object") {
          const v = action.value as { id: string; patch: ScriptObjectPatch };
          scene.changeObject(v.id, v.patch, player);
        } else if (action.kind === "teleport") {
          const v = action.value as { x: number; y: number };
          if (scene.world.collides(v.x + 0.5, v.y + 0.5)) throw Error("이동할 위치가 막혀 있어요");
          player = { ...player, x: v.x + 0.5, y: v.y + 0.5 };
        } else if (action.kind === "choose") {
          runtime.event({ kind: "choice", name: (action.value as ScriptChoice).id, value: 0 });
        } else if (action.kind === "completeQuiz") {
          const v = action.value as { id: string; label?: string };
          progress = completeQuiz(doc, progress, v.id, v.label);
        }
      }
    };
    for (let i = 0; i < Math.max(points.length, interactions.length, quizzes.length) + 2 && !error && !signal.aborted; i++) {
      applyActions();
      const point = points[i];
      if (point && !scene.world.collides(point.x + 0.5, point.y + 0.5)) player = { ...player, x: point.x + 0.5, y: point.y + 0.5 };
      if (interactions[i]) runtime.event({ kind: "interact", value: interactions[i] });
      const quiz = quizzes[i];
      if (quiz && !progress.completed.has(quiz.id)) {
        progress = answerQuiz(doc, progress, quiz.id, true);
        runtime.event({ kind: "quiz", value: { id: quiz.id, question: quiz.question, correct: true, index: quiz.answer } });
      }
      runtime.tick({ x: player.x, y: player.y, time: i, zones: zonesAt(doc, player.x, player.y).flatMap(z => [z.id, z.name]), objects: scene.objects() });
      await wait();
    }
    // Give the watchdog time to report a blocked callback before accepting the proposal.
    await new Promise<void>(resolve => setTimeout(resolve, 400));
    applyActions();
    return error;
  } catch (e) { return e instanceof Error ? e.message : "코드 실행을 확인하지 못했어요"; }
  finally { runtime.dispose(); }
}
