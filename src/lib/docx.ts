// 의존성 0으로 .docx(OOXML) 문서를 생성·다운로드한다.
// ZIP은 store(무압축) 방식 — Word·Pages·한글(HWP) 모두 무압축 엔트리를 정상 인식.

// ---------- ZIP(store) ----------
function crc32(bytes: Uint8Array): number {
  let crc = ~0;
  for (let i = 0; i < bytes.length; i++) {
    crc ^= bytes[i];
    for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (~crc) >>> 0;
}

const u16 = (n: number) => new Uint8Array([n & 0xff, (n >>> 8) & 0xff]);
const u32 = (n: number) =>
  new Uint8Array([
    n & 0xff,
    (n >>> 8) & 0xff,
    (n >>> 16) & 0xff,
    (n >>> 24) & 0xff,
  ]);

function concat(chunks: Uint8Array[]): Uint8Array {
  const len = chunks.reduce((s, c) => s + c.length, 0);
  const out = new Uint8Array(len);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}

function makeZip(files: { name: string; data: Uint8Array }[]): Uint8Array {
  const enc = new TextEncoder();
  const TIME = 0;
  const DATE = 33; // 1980-01-01
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name);
    const data = f.data;
    const crc = crc32(data);
    const lh = concat([
      u32(0x04034b50),
      u16(20),
      u16(0),
      u16(0),
      u16(TIME),
      u16(DATE),
      u32(crc),
      u32(data.length),
      u32(data.length),
      u16(name.length),
      u16(0),
      name,
      data,
    ]);
    locals.push(lh);
    centrals.push(
      concat([
        u32(0x02014b50),
        u16(20),
        u16(20),
        u16(0),
        u16(0),
        u16(TIME),
        u16(DATE),
        u32(crc),
        u32(data.length),
        u32(data.length),
        u16(name.length),
        u16(0),
        u16(0),
        u16(0),
        u16(0),
        u32(0),
        u32(offset),
        name,
      ])
    );
    offset += lh.length;
  }
  const localsAll = concat(locals);
  const cd = concat(centrals);
  const eocd = concat([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(files.length),
    u16(files.length),
    u32(cd.length),
    u32(localsAll.length),
    u16(0),
  ]);
  return concat([localsAll, cd, eocd]);
}

// ---------- OOXML 빌더 ----------
export function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export type RunOpt = {
  bold?: boolean;
  size?: number; // half-points (예: 22 = 11pt)
  color?: string; // "595959"
  align?: "left" | "center";
  spaceBefore?: number; // twips
};

/** 문단 한 개 */
export function wPara(text: string, opt: RunOpt = {}): string {
  const jc = opt.align === "center" ? '<w:jc w:val="center"/>' : "";
  const sp = opt.spaceBefore ? `<w:spacing w:before="${opt.spaceBefore}"/>` : "";
  const pPr = jc || sp ? `<w:pPr>${sp}${jc}</w:pPr>` : "";
  const rPr =
    (opt.bold ? "<w:b/>" : "") +
    (opt.size ? `<w:sz w:val="${opt.size}"/><w:szCs w:val="${opt.size}"/>` : "") +
    (opt.color ? `<w:color w:val="${opt.color}"/>` : "");
  const rPrEl = rPr ? `<w:rPr>${rPr}</w:rPr>` : "";
  return `<w:p>${pPr}<w:r>${rPrEl}<w:t xml:space="preserve">${xmlEscape(
    text
  )}</w:t></w:r></w:p>`;
}

/** 표 한 행 — cells/ widths(dxa) */
export function wRow(
  cells: { text: string; bold?: boolean; align?: "left" | "center" }[],
  widths: number[]
): string {
  const tcs = cells
    .map((c, i) => {
      const para = wPara(c.text, {
        bold: c.bold,
        size: 18,
        align: c.align ?? (i === 0 ? "left" : "center"),
      });
      return `<w:tc><w:tcPr><w:tcW w:w="${widths[i]}" w:type="dxa"/></w:tcPr>${para}</w:tc>`;
    })
    .join("");
  return `<w:tr>${tcs}</w:tr>`;
}

/** 표 전체 (모든 셀 단선 테두리) */
export function wTable(rows: string[], widths: number[]): string {
  const b = '<w:top w:val="single" w:sz="4" w:space="0" w:color="auto"/>';
  const borders =
    "<w:tblBorders>" +
    b +
    b.replace("top", "left") +
    b.replace("top", "bottom") +
    b.replace("top", "right") +
    b.replace("top", "insideH") +
    b.replace("top", "insideV") +
    "</w:tblBorders>";
  const grid =
    "<w:tblGrid>" +
    widths.map((w) => `<w:gridCol w:w="${w}"/>`).join("") +
    "</w:tblGrid>";
  return (
    `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/>${borders}</w:tblPr>${grid}` +
    rows.join("") +
    "</w:tbl>"
  );
}

/** body 내부 XML(문단·표 문자열들)을 받아 완전한 .docx 로 다운로드 */
export function downloadDocx(filename: string, bodyXml: string): void {
  const enc = new TextEncoder();
  const contentTypes =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
    "</Types>";
  const rels =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
    "</Relationships>";
  const sectPr =
    '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>' +
    '<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr>';
  const documentXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
    `<w:body>${bodyXml}${sectPr}</w:body></w:document>`;

  const zip = makeZip([
    { name: "[Content_Types].xml", data: enc.encode(contentTypes) },
    { name: "_rels/.rels", data: enc.encode(rels) },
    { name: "word/document.xml", data: enc.encode(documentXml) },
  ]);

  const blob = new Blob([zip as BlobPart], {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
  const url = URL.createObjectURL(blob);
  const a = window.document.createElement("a");
  a.href = url;
  a.download = filename;
  window.document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
