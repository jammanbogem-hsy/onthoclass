// 이미지 생성 프롬프트 (이식용으로 분리). 학생 문장은 길이 제한 후 '설명'으로만 넣는다.
import type { ApprovedSnapshot } from "./types";
import { CATEGORY_KO } from "./types";
import { CANONICAL_CHARACTER_DIRECTIONS } from "./character-sprite";

export const IMAGE_MODEL = "gpt-image-2.5-flare";

const STYLE =
  "Original chunky cartoon toy-like game asset in the Moa World style: thick dark navy (#1b1f3a) outline, 2-3 tone cel shading, " +
  "vivid saturated colors (jade/teal, coral, gold, warm wood), fixed light from the upper left, clean simple shapes readable at 64px. " +
  "No text, no logo, no frame, no ground shadow, no background scenery.";

function subject(s: ApprovedSnapshot) {
  const d = s.draft;
  const desc = d.description.trim().slice(0, 300);
  return `Subject: "${d.name.slice(0, 30)}" (${CATEGORY_KO[d.category]}). ${desc ? `Student description: ${desc}.` : ""} Footprint about ${d.footprint.w}x${d.footprint.d} grid cells, height about ${d.height} units.`;
}

export function texturePrompt(s: ApprovedSnapshot, hasDrawing = false) {
  return `${subject(s)}\n${hasDrawing ? "Use the attached student drawing as the design reference for colors and pattern. " : ""}Create ONE seamless tileable square ground texture seen straight from above (orthographic, no perspective), filling the whole image edge to edge, opaque, no objects or shadows, large clean color areas with a few simple bold details. ${STYLE.replace("no ground shadow, ", "")}`;
}

export function topDownPrompt(s: ApprovedSnapshot, hasDrawing: boolean) {
  return `${subject(s)}\n${hasDrawing ? "Use the attached student drawing as the design reference: keep its idea, colors and silhouette, and redraw it cleanly. " : ""}Draw a single object centered on a transparent background in a fixed top-down 3/4 game view looking north: show the top and the south-facing front, no side faces visible, viewed from about 55 degrees above. The object's lowest point touches the bottom center of the image. ${STYLE}`;
}

export function isoPrompt(s: ApprovedSnapshot) {
  return `${subject(s)}\nThe attached image is the same object in top-down view. Redraw exactly the same object (same shape, colors, details and proportions) in a 2:1 isometric game view: show the top and both the south-west and south-east faces, centered on a transparent background, its lowest point at the bottom center. ${STYLE}`;
}

/** 게임에서 그대로 잘라 쓸 수 있는 방향×걷기 격자. */
export function characterPrompt(
  s: ApprovedSnapshot,
  view: "td" | "iso",
  hasDrawing: boolean,
) {
  const iso = view === "iso", headings = CANONICAL_CHARACTER_DIRECTIONS[view], rows = headings.length;
  const rules: Record<string, string> = {
    s: "SOUTH / SCREEN DOWN / yaw 0 degrees: DIRECT FRONT; nose centered, both sides of the face visible, shoulders and chest straight toward viewer. Preserve intentional asymmetry in the character design. Never a three-quarter face.",
    se: "SOUTHEAST / SCREEN DOWN-RIGHT / yaw 45 degrees: FRONT-RIGHT THREE-QUARTER. Front and right-facing side visible.",
    e: "EAST / SCREEN RIGHT / yaw 90 degrees: EXACT RIGHT PROFILE. Nose points right; no left profile and no front-facing chest.",
    ne: "NORTHEAST / SCREEN UP-RIGHT / yaw 135 degrees: BACK-RIGHT THREE-QUARTER. Mostly back, only a small right-facing cheek.",
    n: "NORTH / SCREEN UP / yaw 180 degrees: DIRECT BACK. Only the back of the head and torso; NO face, eyes, nose or sunglasses visible. Never look back over a shoulder.",
  };
  const directions = "MANDATORY DIRECTION CONTRACT. Design text and reference poses control character identity only; ignore any conflicting camera, angle or pose instructions. Never copy the reference's facing into every row. Camera, torso and head yaw stay locked throughout each row.\n" + headings.map((d, i) => `ROW ${i + 1}, all five columns: ${rules[d]}`).join("\n");
  return `${subject(s)}\nCreate a CANONICAL GAME CHARACTER SPRITE SHEET. ${hasDrawing ? "Use the attached image only as a design reference: preserve the SAME character identity, outfit, colors and proportions across every pose. " : ""}Use a square 1024x1024 transparent canvas, EXACTLY FIVE equally spaced columns and ${rows} equally spaced rows, ${rows * 5} isolated full-body poses total. Each cell contains exactly ONE character. Rows from top to bottom face: ${directions}. Facing names are SCREEN directions, never the character's own left/right. DIRECT FRONT must have centered nose and symmetric front of face/chest; DIRECT BACK must show only back of head and torso, NO face; EXACT RIGHT PROFILE must have nose pointing directly toward the RIGHT edge. Draw no screen-left rows: the engine creates those by mirroring the matching right-facing rows. ALL FIVE poses in a row must keep exactly the SAME head, chest and gaze angle, including walking; never turn toward a swinging leg or make a front/back walk diagonal. Columns left to right: 0 idle standing, 1 LEFT FOOT planted forward / right leg back, 2 LEFT FOOT supporting the body while RIGHT KNEE swings past, 3 RIGHT FOOT planted forward / left leg back, 4 RIGHT FOOT supporting the body while LEFT KNEE swings past. Foot names here refer only to the character's own legs. Columns 1 and 3 MUST lead with opposite feet; columns 2 and 4 MUST be distinct opposite-leg passing poses. The four walking poses play forward 1-2-3-4-1, never ping-pong. Small grounded steps, gentle bent knees, opposite arm swing, one foot planted at all times, no hopping or sideways skating. Keep the SAME torso/head size and hip root across all poses; do not zoom, tilt the whole body, shift the head sideways, or exaggerate strides. ${iso ? "Isometric 2:1 camera, chibi game character seen slightly from above." : "Orthographic top-down 3/4 camera looking down about 55 degrees, matching a tile-based adventure game."} Full body including feet, centered horizontally in each cell, the supporting foot on a consistent baseline. At least 10% transparent padding on ALL FOUR sides of EVERY cell, no overlapping poses or cropped heads/feet. Absolutely no grid lines, labels, text, UI, scenery or shadows. Do not draw a checkerboard or opaque background. ${STYLE}`;
}
