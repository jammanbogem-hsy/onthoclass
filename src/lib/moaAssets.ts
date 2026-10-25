// 모아 월드에서 만든 내 에셋을 러닝크루에서 쓰기(functions/src/moaBridge.ts)
import { httpsCallable } from "firebase/functions";
import { getFunctionsClient } from "@/lib/firebase";
import type { Attachment } from "@/lib/lessons";

export type MoaAsset = { id: string; name: string; category: string; image: string };
export type MoaTarget = { kind: "submission"; cid: string; lid: string; qid: string } | { kind: "canvas"; cid: string };

const call = <T,>(data: Record<string, unknown>) => httpsCallable<Record<string, unknown>, T>(getFunctionsClient(), "moaAssets")(data).then(r => r.data);

export const listMoaAssets = () => call<{ assets: MoaAsset[] }>({ action: "list" }).then(r => r.assets);
export const attachMoaAsset = (assetId: string, target: MoaTarget) => call<{ attachment: Attachment }>({ action: "attach", assetId, target }).then(r => r.attachment);
