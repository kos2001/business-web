import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { hwpxSectionToText, decodeParaText, parseHwpx, isHwp } from "./hwp";

const SECTION = `<?xml version="1.0" encoding="UTF-8"?>
<hs:sec xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph">
 <hp:p><hp:run><hp:t>물품공급계약서</hp:t></hp:run></hp:p>
 <hp:p><hp:run><hp:t>제5조 (지연배상) 1일당 계약금액의 2.5%를 배상한다.</hp:t></hp:run></hp:p>
 <hp:p><hp:run><hp:tbl>
   <hp:tr>
     <hp:tc><hp:subList><hp:p><hp:run><hp:t>품목</hp:t></hp:run></hp:p></hp:subList></hp:tc>
     <hp:tc><hp:subList><hp:p><hp:run><hp:t>단가</hp:t></hp:run></hp:p></hp:subList></hp:tc>
   </hp:tr>
   <hp:tr>
     <hp:tc><hp:subList><hp:p><hp:run><hp:t>SEM-A100</hp:t></hp:run></hp:p></hp:subList></hp:tc>
     <hp:tc><hp:subList><hp:p><hp:run><hp:t>14,200원</hp:t></hp:run></hp:p></hp:subList></hp:tc>
   </hp:tr>
 </hp:tbl></hp:run></hp:p>
</hs:sec>`;

describe("isHwp", () => {
  it("claims both 한글 formats and nothing else", () => {
    expect(isHwp(".hwp")).toBe(true);
    expect(isHwp(".HWPX")).toBe(true);
    expect(isHwp(".docx")).toBe(false);
  });
});

describe("hwpxSectionToText", () => {
  const out = hwpxSectionToText(SECTION);

  it("keeps paragraphs on their own lines", () => {
    expect(out).toContain("물품공급계약서");
    expect(out).toContain("제5조 (지연배상) 1일당 계약금액의 2.5%를 배상한다.");
  });

  it("keeps the 품목표 as pipe rows, which is what the review reads", () => {
    expect(out).toContain("| 품목 | 단가 |");
    expect(out).toContain("| SEM-A100 | 14,200원 |");
  });

  it("does not leak XML tags into the text", () => {
    expect(out).not.toMatch(/<[a-z]/i);
  });

  it("unescapes the entities OWPML writes", () => {
    const xml = `<hp:p><hp:run><hp:t>갑 &amp; 을 &quot;계약&quot; &lt;조항&gt;</hp:t></hp:run></hp:p>`;
    expect(hwpxSectionToText(xml)).toBe(String.raw`갑 & 을 "계약" <조항>`);
  });

  it("joins runs split mid-sentence, which 한글 does constantly", () => {
    const xml = `<hp:p><hp:run><hp:t>배상액 </hp:t><hp:t>상한은 </hp:t><hp:t>두지 아니한다.</hp:t></hp:run></hp:p>`;
    expect(hwpxSectionToText(xml)).toBe("배상액 상한은 두지 아니한다.");
  });

  it("returns empty for a section with no text", () => {
    expect(hwpxSectionToText("<hs:sec></hs:sec>")).toBe("");
  });
});

describe("parseHwpx", () => {
  it("reads a real zip end to end", async () => {
    const data = readFileSync("/private/tmp/claude-501/-Users-kos2001-gitspace-business-web/36cf96c5-022d-4106-b87e-9cb236ce0423/scratchpad/샘플계약서.hwpx");
    const text = await parseHwpx(new Uint8Array(data));
    expect(text).toContain("물품공급계약서");
    expect(text).toContain("| SEM-A100 | 14,200원 |");
  });

  it("refuses a file that is not a zip, with a reason", async () => {
    await expect(parseHwpx(new TextEncoder().encode("not a zip"))).rejects.toThrow(
      /열지 못했습니다/,
    );
  });
});

describe("decodeParaText", () => {
  function utf16(s: string): Uint8Array {
    const b = new Uint8Array(s.length * 2);
    const v = new DataView(b.buffer);
    [...s].forEach((c, i) => v.setUint16(i * 2, c.charCodeAt(0), true));
    return b;
  }

  it("decodes UTF-16LE Korean", () => {
    expect(decodeParaText(utf16("지연배상"))).toBe("지연배상");
  });

  it("drops an extended control and its seven trailing words", () => {
    // Copying controls through is what produces the CJK-looking garbage a naive
    // decode gives; the run after the control must survive intact.
    const b = new Uint8Array(2 + 16 + 6);
    const v = new DataView(b.buffer);
    v.setUint16(0, "가".charCodeAt(0), true);
    v.setUint16(2, 2, true);
    [..."나다라"].forEach((c, i) => v.setUint16(18 + i * 2, c.charCodeAt(0), true));
    expect(decodeParaText(b)).toBe("가나다라");
  });

  it("keeps tabs and newlines", () => {
    const b = new Uint8Array(6);
    const v = new DataView(b.buffer);
    v.setUint16(0, 9, true);
    v.setUint16(2, 13, true);
    v.setUint16(4, "가".charCodeAt(0), true);
    expect(decodeParaText(b)).toBe("\t\n가");
  });
});
