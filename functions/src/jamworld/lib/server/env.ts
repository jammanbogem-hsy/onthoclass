import type { ProviderEnv } from "../agent/providers";
export function providerEnv(): ProviderEnv {
  return { OPENAI_API_KEY: process.env.OPENAI_API_KEY, ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY, OPENAI_MODEL: process.env.OPENAI_MODEL, ANTHROPIC_MODEL: process.env.ANTHROPIC_MODEL };
}
