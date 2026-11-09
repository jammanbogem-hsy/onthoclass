import { jobStatus } from "../../route";

export const GET = async (request: Request, ctx: { params: Promise<Record<string, string | string[]>> }) =>
  jobStatus(request, String((await ctx.params).id));
