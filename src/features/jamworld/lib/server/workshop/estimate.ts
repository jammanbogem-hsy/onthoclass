export interface ImageEstimate {
  model: string; images: number; outputUsd: number | null;
  lowUsd: number | null; highUsd: number | null; pricingVersion: string;
  quality: "medium"; size: "1024x1024"; referenceImages: number;
}
export interface GenerationQuote extends ImageEstimate { id: string; requestId: string; rev: number; attempt: number }

