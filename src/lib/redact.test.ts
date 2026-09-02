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

  it("removes a Korean mobile number in common formats", () => {
    expect(redact("010-1234-5678").text).toBe("[PHONE]");
    expect(redact("02-555-1234").text).toBe("[PHONE]");
  });

  it("removes a resident registration number", () => {
    expect(redact("900101-1234567").text).toBe("[RRN]");
  });

  it("removes a business registration number", () => {
    expect(redact("사업자 124-81-00998 확인").text).toBe("사업자 [BIZNO] 확인");
  });

  it("prefers the card rule over the phone rule on a 16-digit number", () => {
    const { text, hits } = redact("결제 4111-1111-1111-1111 처리");
    expect(text).toBe("결제 [CARD] 처리");
    expect(hits).toEqual({ card: 1 });
  });

  it("counts repeated matches of the same rule", () => {
    const { hits } = redact("a@b.com 그리고 c@d.com");
    expect(hits).toEqual({ email: 2 });
  });
});
