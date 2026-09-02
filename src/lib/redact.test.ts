import { describe, expect, it } from "vitest";
import { redact } from "./redact";

describe("redact", () => {
  it("is a no-op on text with no identifiers", () => {
    const { text, hits } = redact("이번 분기 경쟁사 동향을 정리해 줘.");
    expect(text).toBe("이번 분기 경쟁사 동향을 정리해 줘.");
    expect(hits).toEqual({});
  });

  it("removes an email and counts it", () => {
    const { text, hits } = redact("담당자는 kim.os@example.co.kr 입니다.");
    expect(text).toBe("담당자는 [EMAIL] 입니다.");
    expect(hits).toEqual({ email: 1 });
  });

  it("counts repeated matches of the same rule", () => {
    expect(redact("a@b.com 그리고 c@d.com").hits).toEqual({ email: 2 });
  });

  it("removes a resident registration number", () => {
    expect(redact("900101-1234567").text).toBe("[RRN]");
  });

  it("removes a business registration number", () => {
    expect(redact("사업자 124-81-00998 확인").text).toBe("사업자 [BIZNO] 확인");
  });
});

describe("phone detection", () => {
  it("removes Korean mobile numbers", () => {
    expect(redact("010-1234-5678").text).toBe("[PHONE]");
    expect(redact("01098765432").text).toBe("[PHONE]");
  });

  it("removes landline numbers, which are the common B2B contact", () => {
    expect(redact("02-555-1234").text).toBe("[PHONE]");
    expect(redact("031-123-4567").text).toBe("[PHONE]");
    expect(redact("070-8888-1234").text).toBe("[PHONE]");
  });

  it("leaves an ordinary number that is not phone-shaped", () => {
    expect(redact("계약금 500만원, 납기 30일").text).toBe("계약금 500만원, 납기 30일");
  });
});

describe("card detection", () => {
  it("removes a Luhn-valid card number", () => {
    const { text, hits } = redact("결제 4111-1111-1111-1111 처리");
    expect(text).toBe("결제 [CARD] 처리");
    expect(hits).toEqual({ card: 1 });
  });

  it("leaves a 16-digit run that fails Luhn", () => {
    // Order ids, serials and timestamps are long digit runs too. Masking them
    // is the false positive that makes people switch protection off.
    const { text, hits } = redact("주문번호 1234567812345678 확인");
    expect(text).toBe("주문번호 1234567812345678 확인");
    expect(hits).toEqual({});
  });

  it("does not swallow a resident registration number as a card", () => {
    expect(redact("900101-1234567").text).toBe("[RRN]");
  });
});

describe("secret detection", () => {
  it("removes provider API keys pasted from a config or log", () => {
    expect(redact("OPENAI_API_KEY=sk-abcdefghijklmnop1234").text).toContain("[SECRET]");
    expect(redact("AKIAIOSFODNN7EXAMPLE").text).toBe("[SECRET]");
    expect(redact("ghp_abcdefghijklmnopqrstuvwxyz0123").text).toBe("[SECRET]");
  });

  it("removes a JWT", () => {
    const jwt =
      "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U";
    expect(redact(`Authorization: Bearer ${jwt}`).text).toContain("[SECRET]");
  });

  it("leaves ordinary words that merely look technical", () => {
    expect(redact("sk-필드를 확인해 주세요").text).toBe("sk-필드를 확인해 주세요");
  });
});

describe("ip detection", () => {
  it("removes a valid IPv4 address", () => {
    expect(redact("서버 192.168.10.20 접속").text).toBe("서버 [IP] 접속");
  });

  it("leaves a dotted number with an out-of-range octet", () => {
    expect(redact("버전 999.888.777.666").text).toBe("버전 999.888.777.666");
  });
});

describe("placeholder safety", () => {
  it("emits placeholders that later detectors cannot re-match", () => {
    // Placeholders carry no digits and no '@', so a second pass is a no-op.
    const once = redact("a@b.com 010-1234-5678 4111111111111111");
    const twice = redact(once.text);
    expect(twice.text).toBe(once.text);
    expect(twice.hits).toEqual({});
  });

  it("handles several identifier types in one message", () => {
    const { hits } = redact(
      "김부장 kim@acme.co.kr / 010-1234-5678 / 사업자 124-81-00998 / 서버 10.0.0.1",
    );
    expect(hits).toEqual({ email: 1, phone: 1, bizno: 1, ip: 1 });
  });
});
