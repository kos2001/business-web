/**
 * Adapter for the marketing-agent backend (`~/gitspace/marketing-agent`, :8012).
 *
 * That repo is a ten-agent harness that turns raw sales/marketing performance
 * material into a diagnosis: channel-level findings with verbatim citations,
 * a metrics dashboard, per-customer strategy, three strategic axes, a
 * recommended timeline, and prioritised action items. It carries the same
 * accuracy discipline as `weekly-report-harness` — independent re-derivation,
 * verbatim quote grounding, explicit "판단 보류" marking — so reimplementing any
 * of it here would be strictly worse.
 *
 * Two things make this adapter different from `mi-report.ts`:
 *
 * 1. **No SSE.** `POST /pipeline/run` blocks until all ten agents finish. The
 *    UI would sit dead for minutes, so this module emits its own progress
 *    frames around each step. They are honest about what is happening — they
 *    just are not streamed from the agents themselves.
 *
 * 2. **Material has to be registered first.** The pipeline reads sources
 *    attached to a cycle, so the user's text becomes a source document and a
 *    fresh cycle is minted per run.
 *
 * The output is a structured report, not prose, so this module renders it to
 * Markdown — including the citations, which are the whole reason to trust it.
 */

const BASE = process.env.MARKETING_AGENT_URL ?? "http://127.0.0.1:8012";

export interface DiagnoseInput {
  /** The raw performance material the user pasted or attached. */
  text: string;
  /** Shown as the source document title. */
  title?: string;
}

export async function maHealthy(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/health`, {
      cache: "no-store",
      signal: AbortSignal.timeout(2000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function maDiagnoseAsRunEvents(
  runId: string,
  input: DiagnoseInput,
  signal?: AbortSignal,
): Promise<ReadableStream<Uint8Array>> {
  const encoder = new TextEncoder();

  return new ReadableStream({
    async start(controller) {
      const emit = (event: Record<string, unknown>) =>
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              run_id: runId,
              timestamp: Date.now() / 1000,
              ...event,
            })}\n\n`,
          ),
        );

      const step = async <T>(
        tool: string,
        preview: string,
        work: () => Promise<T>,
      ): Promise<T> => {
        emit({ event: "tool.started", tool, preview });
        const result = await work();
        emit({ event: "tool.completed", tool });
        return result;
      };

      try {
        const cycleId = `bw-${new Date().toISOString().slice(0, 10)}-${Math.random()
          .toString(36)
          .slice(2, 8)}`;

        await step("source_register", "자료 등록", () =>
          post("/sources", {
            cycle_id: cycleId,
            title: input.title || "영업 실적 자료",
            text: input.text,
            source_type: "manual",
          }, signal),
        );

        const report = await step(
          "pipeline_run",
          "10개 에이전트 분석 — 현황진단 · 지표 · 고객별 전략 · 전략 3축 · Action Items",
          () =>
            post<CycleReport>(
              `/pipeline/run?cycle_id=${encodeURIComponent(cycleId)}`,
              undefined,
              signal,
            ),
        );

        emit({ event: "run.completed", output: renderReport(report) });
      } catch (err) {
        emit({
          event: "run.failed",
          error: err instanceof Error ? err.message : "현황진단에 실패했습니다.",
        });
      } finally {
        controller.close();
      }
    },
  });
}

async function post<T = unknown>(
  path: string,
  body: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
    signal,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `marketing-agent 오류 (${res.status}): ${detail.slice(0, 200)}`,
    );
  }
  return (await res.json()) as T;
}

// ── Report shape ──────────────────────────────────────────────────────────
// Mirrors marketing-agent's `CycleReport`. Every field is optional here: this
// app should render whatever a given pipeline version produced rather than
// break when the upstream model gains or loses a section.

interface Citation {
  quote?: string;
  source_id?: string;
}

interface Finding {
  channel?: string;
  summary?: string;
  kind?: string;
  status?: string;
  title?: string;
  description?: string;
  citations?: Citation[];
}

interface Metric {
  metric?: string;
  current?: string;
  prior?: string;
  change?: string;
  target?: string;
  status?: string;
}

interface ActionItem {
  title?: string;
  owner?: string;
  due?: string;
  priority?: string;
  impact?: string;
  effort?: string;
}

export interface CycleReport {
  cycle_id?: string;
  overview?: string;
  overview_warnings?: string[];
  coverage_note?: string;
  diagnosis?: Finding[];
  opportunities_risks?: Finding[];
  critical_points?: Finding[];
  diagnosis_summary?: {
    executive_summary?: string;
    metrics?: Metric[];
    customer_strategies?: Finding[];
    corporate_response_process?: Finding[];
  };
  strategy_timeline?: {
    issue_guides?: Finding[];
    strategic_axes?: Finding[];
    recommended_timeline?: Finding[];
  };
  action_items?: {
    immediate_check?: ActionItem[];
    action_needed?: ActionItem[];
    final_summary?: string;
  };
}

/**
 * Renders the report in reading order: the conclusion first, then the evidence
 * behind it, then what to do. Citations are kept — an uncited diagnosis of a
 * sales channel is an opinion, and the point of this pipeline is that it is not.
 */
export function renderReport(report: CycleReport): string {
  const out: string[] = [];
  const push = (s: string) => out.push(s);

  push("# 영업 현황진단");
  if (report.cycle_id) push(`\n회차: \`${report.cycle_id}\``);

  const exec = report.diagnosis_summary?.executive_summary || report.overview;
  if (exec) push(`\n## 요약\n\n${exec}`);

  if (report.overview_warnings?.length) {
    push(
      `\n> ⚠️ ${report.overview_warnings.join("\n> ")}`,
    );
  }

  section(push, "진단", report.diagnosis);
  metricsTable(push, report.diagnosis_summary?.metrics);
  section(push, "기회 · 리스크", report.opportunities_risks);
  section(push, "치명적 관리포인트", report.critical_points);
  section(push, "고객별 대응 전략", report.diagnosis_summary?.customer_strategies);
  section(push, "법인 대응 프로세스", report.diagnosis_summary?.corporate_response_process);
  section(push, "이슈 가이드", report.strategy_timeline?.issue_guides);
  section(push, "전략의 3축", report.strategy_timeline?.strategic_axes);
  section(push, "권고 타임라인", report.strategy_timeline?.recommended_timeline);

  actions(push, "즉시 확인", report.action_items?.immediate_check);
  actions(push, "조치 필요", report.action_items?.action_needed);

  if (report.action_items?.final_summary) {
    push(`\n## 최종 요약\n\n${report.action_items.final_summary}`);
  }
  if (report.coverage_note) {
    push(`\n---\n\n_${report.coverage_note}_`);
  }

  return out.join("\n");
}

function section(
  push: (s: string) => void,
  heading: string,
  items?: Finding[],
): void {
  if (!items?.length) return;
  push(`\n## ${heading}`);
  for (const item of items) {
    const label = item.channel || item.title || "항목";
    const tags = [item.kind, item.status].filter(Boolean).join(" · ");
    push(`\n**${label}**${tags ? ` — ${tags}` : ""}`);
    const body = item.summary || item.description;
    if (body) push(`\n${body}`);
    for (const c of item.citations ?? []) {
      if (c.quote) push(`\n> "${c.quote}"${c.source_id ? ` — ${c.source_id}` : ""}`);
    }
  }
}

function metricsTable(push: (s: string) => void, metrics?: Metric[]): void {
  if (!metrics?.length) return;
  push("\n## 지표");
  push("\n| 지표 | 현재 | 이전 | 변화 | 목표 | 상태 |");
  push("|---|---|---|---|---|---|");
  for (const m of metrics) {
    push(
      `| ${m.metric ?? ""} | ${m.current ?? ""} | ${m.prior ?? ""} | ` +
        `${m.change ?? ""} | ${m.target ?? ""} | ${m.status ?? ""} |`,
    );
  }
}

function actions(
  push: (s: string) => void,
  heading: string,
  items?: ActionItem[],
): void {
  if (!items?.length) return;
  push(`\n## Action Items — ${heading}`);
  for (const a of items) {
    const meta = [
      a.owner && `담당 ${a.owner}`,
      a.due && `기한 ${a.due}`,
      a.priority && `우선순위 ${a.priority}`,
      a.impact && `영향 ${a.impact}`,
      a.effort && `공수 ${a.effort}`,
    ]
      .filter(Boolean)
      .join(" · ");
    push(`\n- [ ] **${a.title ?? "항목"}**${meta ? `\n  ${meta}` : ""}`);
  }
}
