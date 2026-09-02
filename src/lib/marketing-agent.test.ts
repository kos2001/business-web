import { describe, expect, it } from "vitest";
import { renderReport, type CycleReport } from "./marketing-agent";

const FULL: CycleReport = {
  cycle_id: "bw-2026-09-03-ab12cd",
  diagnosis_summary: {
    executive_summary: "이메일 채널이 악화되고 법인 고객 이탈 신호가 있다.",
    metrics: [
      {
        metric: "이메일 오픈율",
        current: "8%",
        prior: "12%",
        change: "-4%p",
        target: "15%",
        status: "off_track",
      },
    ],
    customer_strategies: [
      { title: "ACME", description: "계약 재검토 요청에 선제 대응", citations: [] },
    ],
  },
  diagnosis: [
    {
      channel: "이메일 뉴스레터",
      summary: "오픈율이 12%에서 8%로 하락",
      kind: "weakness",
      status: "confirmed",
      citations: [
        { quote: "오픈율이 지난달 12%에서 이번 달 8%로 하락했다", source_id: "s1" },
      ],
    },
  ],
  strategy_timeline: {
    strategic_axes: [{ title: "이메일 콘텐츠 재건", description: "근본 원인 개선" }],
  },
  action_items: {
    immediate_check: [
      {
        title: "ACME 계약 재검토 대응",
        owner: "계정 담당 AE",
        due: "2026-09-10",
        priority: "high",
      },
    ],
    final_summary: "이메일 채널이 최우선이다.",
  },
  coverage_note: "자료 1건 기준.",
};

describe("renderReport", () => {
  it("leads with the conclusion", () => {
    const md = renderReport(FULL);
    const summaryAt = md.indexOf("## 요약");
    const diagnosisAt = md.indexOf("## 진단");
    expect(summaryAt).toBeGreaterThan(-1);
    expect(summaryAt).toBeLessThan(diagnosisAt);
  });

  it("keeps the verbatim citations", () => {
    // An uncited diagnosis of a sales channel is an opinion. Dropping the
    // quotes would throw away the only reason to trust the pipeline.
    expect(renderReport(FULL)).toContain(
      '"오픈율이 지난달 12%에서 이번 달 8%로 하락했다"',
    );
    expect(renderReport(FULL)).toContain("s1");
  });

  it("renders metrics as a table", () => {
    const md = renderReport(FULL);
    expect(md).toContain("| 지표 | 현재 | 이전 | 변화 | 목표 | 상태 |");
    expect(md).toContain("| 이메일 오픈율 | 8% | 12% | -4%p | 15% | off_track |");
  });

  it("renders action items as checkboxes with owner and due date", () => {
    const md = renderReport(FULL);
    expect(md).toContain("- [ ] **ACME 계약 재검토 대응**");
    expect(md).toContain("담당 계정 담당 AE");
    expect(md).toContain("기한 2026-09-10");
  });

  it("surfaces overview warnings prominently", () => {
    const md = renderReport({ overview_warnings: ["근거가 부족한 항목이 있습니다."] });
    expect(md).toContain("⚠️ 근거가 부족한 항목이 있습니다.");
  });

  it("omits sections the pipeline did not produce", () => {
    // The upstream report shape changes as the harness evolves; rendering
    // whatever arrived beats breaking on a missing section.
    const md = renderReport({ cycle_id: "c1" });
    expect(md).toContain("# 영업 현황진단");
    expect(md).not.toContain("## 진단");
    expect(md).not.toContain("## 지표");
    expect(md).not.toContain("Action Items");
  });

  it("does not throw on an empty report", () => {
    expect(() => renderReport({})).not.toThrow();
  });

  it("falls back to overview when there is no executive summary", () => {
    const md = renderReport({ overview: "개요만 있는 경우" });
    expect(md).toContain("## 요약\n\n개요만 있는 경우");
  });
});
