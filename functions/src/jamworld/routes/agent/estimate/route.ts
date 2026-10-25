import { handle, jsonBody, need } from "../../../lib/server/workshop/http";
import { actorFrom, noStore, workshopStatus } from "../../../lib/server/workshop/runtime";
import { parseDesignExtras } from "../../../lib/agent/design";
import { estimateImages } from "../../../lib/server/workshop/estimate";
import { WorkshopError } from "../../../lib/server/workshop/service";

export async function POST(req: Request) {
  return handle(req, async ws => {
    need(await actorFrom(req, ws));
    const parsed = parseDesignExtras(await jsonBody(req, 12000));
    if (!parsed?.assets?.length) throw new WorkshopError("draft", "제작할 에셋 내용을 확인해 주세요");
    const estimates = parsed.assets.map(({ draft }) => estimateImages({ version: 1, draft, uploadKey: null, uploadSha256: null, outputs: draft.category === "terrain" ? ["texture"] : ["td", "iso"] }, workshopStatus().imageModel, ws.pricing));
    return Response.json({ estimates }, { headers: noStore });
  });
}
