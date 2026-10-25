import { handle } from "../../../lib/server/workshop/http";
import { noStore } from "../../../lib/server/workshop/runtime";
import { catalogAdmin, publishedAssets } from "../../../lib/server/workshop/catalog";
export async function GET(req: Request) {
  return handle(req, async () => Response.json({ assets: await publishedAssets(), canManage: !!(await catalogAdmin(req)) }, { headers: noStore }));
}
