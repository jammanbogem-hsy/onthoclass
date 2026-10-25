import OpenAI, { toFile } from "openai";
import type { ImageProvider } from "./service";
import type { ImageUsage } from "./pricing";
/** 참조 이미지가 있으면 edit, 없으면 generate. 인물은 투명 PNG, 일반 에셋은 WebP. */
export class OpenAIImages implements ImageProvider {
  readonly model: string;
  private readonly client: OpenAI;
  constructor(apiKey: string, model: string) {
    this.model = model;
    // 자동 재시도 끔: 재시도 시 과금 여부가 불명확해지므로 실패는 교사가 명시적으로 '다시 시도'(시도 횟수·usage 기록) 한다
    this.client = new OpenAI({ apiKey, maxRetries: 0, timeout: 180_000 });
  }
  async create(o: {
    prompt: string;
    background: "transparent" | "opaque";
    format?: "png" | "webp";
    references?: Array<{ bytes: Uint8Array; contentType: string }>;
  }) {
    const common = {
      model: this.model,
      prompt: o.prompt,
      size: "1024x1024" as const,
      quality: "medium" as const,
      output_format: o.format ?? ("webp" as const),
      background: o.background,
      n: 1,
    };
    const res = o.references?.length
      ? await this.client.images.edit({
          ...common,
          image: await Promise.all(
            o.references.map((r, i) =>
              toFile(
                r.bytes,
                `ref-${i}.${r.contentType.split("/")[1] ?? "png"}`,
                { type: r.contentType },
              ),
            ),
          ),
        })
      : await this.client.images.generate(common);
    const b64 = res.data?.[0]?.b64_json;
    if (!b64) throw new Error("이미지 응답이 비어 있습니다");
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    // 응답 usage(토큰)는 비용 계산용으로 그대로 보관 (가격 추정은 설정된 단가로만)
    return {
      bytes,
      contentType: o.format === "png" ? "image/png" : "image/webp",
      usage: (res as { usage?: ImageUsage }).usage ?? null,
    };
  }
}
