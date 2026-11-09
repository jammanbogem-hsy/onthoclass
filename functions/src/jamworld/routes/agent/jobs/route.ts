import { createJob } from "../route";

export const POST = (request: Request) => createJob(request);
