import { characterPrompt, isoPrompt, texturePrompt, topDownPrompt } from "./prompts";
import type { ApprovedSnapshot } from "./types";
import type { PricingConfig } from "./pricing";

export interface ImageEstimate {
  model: string; images: number; outputUsd: number | null;
  lowUsd: number | null; highUsd: number | null; pricingVersion: string;
  quality: "medium"; size: "1024x1024"; referenceImages: number;
}
export interface GenerationQuote extends ImageEstimate { id: string; requestId: string; rev: number; attempt: number }

/** Official 2.5 output calculator, checked 2026-10-22. Inputs are planning assumptions, not a billing cap. */
export function estimateImages(s: ApprovedSnapshot, model: string, pricing: PricingConfig): ImageEstimate {
  const drawing = !!s.uploadKey, terrain = s.draft.category === "terrain", character = s.draft.category === "character";
  const prompts = terrain ? [texturePrompt(s, drawing)] : character
    ? [characterPrompt(s, "td", drawing), characterPrompt(s, "iso", true)]
    : [topDownPrompt(s, drawing), isoPrompt(s)];
  const references = (drawing ? 1 : 0) + (terrain ? 0 : 1);
  const result: ImageEstimate = { model, images: prompts.length, outputUsd: null, lowUsd: null, highUsd: null, pricingVersion: pricing.version, quality: "medium", size: "1024x1024", referenceImages: references };
  const rates = pricing.table[model];
  if (!/^gpt-image-2\.5-(flare|sunburst)$/.test(model) || !rates ||
      [rates.input_text, rates.input_image, rates.output_image].some(r => typeof r !== "number" || !Number.isFinite(r) || r < 0)) return result;
  const outputTokens = Math.ceil(24 * 24 * (2_000_000 + 1024 * 1024) / 4_000_000);
  const output = prompts.length * outputTokens * rates.output_image! / 1e6;
  const bytes = prompts.reduce((n, p) => n + new TextEncoder().encode(p).length, 0);
  const round = (n: number) => Math.ceil(n * 1e5) / 1e5;
  return { ...result, outputUsd: round(output),
    lowUsd: round(output + (bytes / 4 * rates.input_text! + references * 1000 * rates.input_image!) / 1e6),
    highUsd: round(output + (bytes * rates.input_text! + references * 5000 * rates.input_image!) / 1e6),
  };
}
