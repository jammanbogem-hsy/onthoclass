import { Script } from "node:vm";
/** Parse only. User code never executes in a privileged server context. */
export function scriptSyntaxError(source: string | undefined): string | null {
  if (!source?.trim()) return null;
  try {
    new Script(`(function(World){"use strict";\n${source}\n})`);
    return null;
  } catch (e) {
    return `맵 코드 문법을 확인해 주세요: ${e instanceof Error ? e.message.slice(0, 120) : "문법 오류"}`;
  }
}
