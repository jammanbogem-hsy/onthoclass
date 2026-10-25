import {
  classroomGet,
  classroomPost,
} from "../../../lib/server/classroom/service";
type Context = { params: Promise<Record<string, string | string[]>> };
export async function GET(req: Request, context: Context) {
  return classroomGet(req, String((await context.params).id));
}
export async function POST(req: Request, context: Context) {
  return classroomPost(req, String((await context.params).id));
}
