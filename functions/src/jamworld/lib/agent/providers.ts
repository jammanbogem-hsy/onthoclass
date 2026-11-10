// 서버 전용 모델 어댑터. 키는 Worker 환경변수에서만 읽고 응답·로그에 남기지 않는다.
import type { AgentResult } from "./design";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { SYSTEM_PROMPT, TOOL_DESCRIPTION, TOOL_NAME, TOOL_SCHEMA, parseToolInput } from "./prompt";

export type Provider = "openai" | "anthropic";

export const DEFAULT_MODELS: Record<Provider, string> = {
  openai: "gpt-6-luna",
  anthropic: "claude-sonnet-5-5",
};

export interface ProviderEnv {
  OPENAI_API_KEY?: string;
  ANTHROPIC_API_KEY?: string;
  OPENAI_MODEL?: string;
  ANTHROPIC_MODEL?: string;
}

/** 사용자 차례에 붙는 참고 자료(그림·PDF). base64 본문, 접두어 없이 */
export type TurnFile = { type: "image"; mime: "image/png" | "image/jpeg" | "image/webp" | "image/gif"; data: string } | { type: "pdf"; name: string; data: string };

export interface Turn {
  role: "user" | "assistant";
  text: string;
  files?: TurnFile[];
}

function anthropicContent(t: Turn): string | Anthropic.ContentBlockParam[] {
  if (t.role !== "user" || !t.files?.length) return t.text;
  return [
    ...t.files.map((f): Anthropic.ContentBlockParam => f.type === "image"
      ? { type: "image", source: { type: "base64", media_type: f.mime, data: f.data } }
      : { type: "document", title: f.name, source: { type: "base64", media_type: "application/pdf", data: f.data } }),
    { type: "text", text: t.text },
  ];
}

function openaiContent(t: Turn) {
  if (t.role !== "user" || !t.files?.length) return t.text;
  return [
    ...t.files.map(f => f.type === "image"
      ? { type: "input_image" as const, image_url: `data:${f.mime};base64,${f.data}`, detail: "auto" as const }
      : { type: "input_file" as const, filename: f.name, file_data: `data:application/pdf;base64,${f.data}` }),
    { type: "input_text" as const, text: t.text },
  ];
}

export interface ModelResult extends AgentResult {
  model: string;
}

export class ProviderError extends Error {
  readonly status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.status = status;
  }
}

export function providerStatus(env: ProviderEnv) {
  const one = (p: Provider) => {
    const key = p === "openai" ? env.OPENAI_API_KEY : env.ANTHROPIC_API_KEY;
    const model = (p === "openai" ? env.OPENAI_MODEL : env.ANTHROPIC_MODEL) || DEFAULT_MODELS[p];
    const name = p === "openai" ? "OPENAI_API_KEY" : "ANTHROPIC_API_KEY";
    return key ? { configured: true, model } : { configured: false, model, reason: `서버 환경변수 ${name} 가 설정되지 않았습니다` };
  };
  return { openai: one("openai"), anthropic: one("anthropic") };
}

/** SDK 오류를 사용자용 한국어 사유로 바꾼다 (키 값은 절대 포함하지 않음) */
function explain(provider: Provider, e: unknown): ProviderError {
  const label = provider === "openai" ? "OpenAI" : "Anthropic";
  const status = (e as { status?: number })?.status;
  if (e instanceof Error && (e.name === "AbortError" || /abort|timeout|timed out/i.test(e.message))) return new ProviderError(`${label} 응답이 너무 오래 걸려 멈췄어요. 방이나 문제 수를 나눠서 부탁해 주세요`, 504);
  if (status === 401 || status === 403) return new ProviderError(`${label} 인증 실패 (${status}): 키가 잘못됐거나 권한이 없습니다`, 502);
  if (status === 404) return new ProviderError(`${label} 모델을 찾을 수 없습니다 (404): 계정에서 이 모델을 쓸 수 없을 수 있습니다`, 502);
  if (status === 429) return new ProviderError(`${label} 요청 한도 초과 (429): 잠시 후 다시 시도하세요`, 429);
  if (status === 400) return new ProviderError(`${label} 요청 거부 (400): ${(e as Error).message?.slice(0, 200)}`, 502);
  if (typeof status === "number" && status >= 500) return new ProviderError(`${label} 서버 오류 (${status})`, 502);
  if (e instanceof Error && /fetch|network|ENOTFOUND|ECONN|connect/i.test(e.message + String((e as { cause?: unknown }).cause ?? ""))) {
    return new ProviderError(`${label} 서버에 연결할 수 없습니다 (네트워크·방화벽 차단 가능)`, 502);
  }
  return new ProviderError(`${label} 호출 실패: ${e instanceof Error ? e.message.slice(0, 200) : "알 수 없는 오류"}`, 502);
}

async function callAnthropic(env: ProviderEnv, turns: Turn[], signal: AbortSignal): Promise<ModelResult> {
  const model = env.ANTHROPIC_MODEL || DEFAULT_MODELS.anthropic;
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 0, timeout: 600_000 }) // 시간 제한은 signal(바깥 작업 예산)이 정함;
  try {
    // Sonnet 5.5: 강제 tool_choice 는 400 → auto + 지시문. 정책 거절 시 서버측 기본 fallback 사용
    const res = await client.messages.create(
      {
        model,
        max_tokens: 16000,
        output_config: { effort: "medium" },
        system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
        tools: [{ name: TOOL_NAME, description: TOOL_DESCRIPTION, input_schema: TOOL_SCHEMA as unknown as Anthropic.Tool.InputSchema }],
        tool_choice: { type: "auto" },
        messages: turns.map((t) => ({ role: t.role, content: anthropicContent(t) })),
      },
      { signal },
    );
    if (res.stop_reason === "refusal") throw new ProviderError("Anthropic 모델이 요청을 거절했습니다", 422);
    if (res.stop_reason === "max_tokens") throw new ProviderError("Anthropic 응답이 길이 제한에 걸려 잘렸습니다. 요청 범위를 줄여 주세요", 422);
    for (const block of res.content) {
      if (block.type === "tool_use" && block.name === TOOL_NAME) {
        const parsed = parseToolInput(block.input);
        if (parsed) return { ...parsed, model: res.model };
      }
    }
    const text = res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("\n");
    const parsed = parseToolInput(text);
    if (parsed) return { ...parsed, model: res.model };
    console.warn("agent anthropic: no valid map tool output", JSON.stringify(res.content).slice(0, 4000));
    throw new ProviderError("Anthropic 모델이 맵 작업을 제출하지 않았습니다", 422);
  } catch (e) {
    if (e instanceof ProviderError) throw e;
    throw explain("anthropic", e);
  }
}

async function callOpenAI(env: ProviderEnv, turns: Turn[], signal: AbortSignal): Promise<ModelResult> {
  const model = env.OPENAI_MODEL || DEFAULT_MODELS.openai;
  const client = new OpenAI({ apiKey: env.OPENAI_API_KEY, maxRetries: 0, timeout: 600_000 }) // 시간 제한은 signal(바깥 작업 예산)이 정함;
  try {
    const res = await client.responses.create(
      {
        model,
        instructions: SYSTEM_PROMPT,
        input: turns.map((t) => ({ role: t.role, content: openaiContent(t) })) as OpenAI.Responses.ResponseInput,
        tools: [{ type: "function", name: TOOL_NAME, description: TOOL_DESCRIPTION, parameters: TOOL_SCHEMA as unknown as Record<string, unknown>, strict: false }],
        tool_choice: "required",
        max_output_tokens: 16000,
      },
      { signal },
    );
    for (const item of res.output ?? []) {
      if (item.type === "function_call" && item.name === TOOL_NAME) {
        const parsed = parseToolInput(item.arguments);
        if (parsed) return { ...parsed, model: res.model };
      }
    }
    const parsed = parseToolInput(res.output_text ?? "");
    if (parsed) return { ...parsed, model: res.model };
    if (res.status === "incomplete")
      throw new ProviderError("OpenAI 응답이 길이 제한에 걸려 잘렸습니다. 요청을 나눠서 부탁해 주세요", 422);
    console.warn("agent openai: no valid map tool output", JSON.stringify(res.output ?? []).slice(0, 4000));
    throw new ProviderError("OpenAI 모델이 맵 작업을 제출하지 않았습니다", 422);
  } catch (e) {
    if (e instanceof ProviderError) throw e;
    throw explain("openai", e);
  }
}

export async function callModel(provider: Provider, env: ProviderEnv, turns: Turn[], signal: AbortSignal): Promise<ModelResult> {
  const key = provider === "openai" ? env.OPENAI_API_KEY : env.ANTHROPIC_API_KEY;
  if (!key) throw new ProviderError(providerStatus(env)[provider].reason ?? "키 없음", 503);
  return provider === "openai" ? callOpenAI(env, turns, signal) : callAnthropic(env, turns, signal);
}
