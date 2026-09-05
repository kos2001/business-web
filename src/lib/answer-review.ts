/**
 * A second agent that reads the answer and says whether it is fit to send.
 *
 * ## What this catches that the mechanical checks cannot
 *
 * `answer-quality.ts` finds decoder loops and foreign scripts; `source-check.ts`
 * compares quotations and figures against the document. Neither can see the
 * damage that is still made of ordinary Hangul:
 *
 *   구조젹으로 · 반돋시 관철할 것 · 재량에 맺겠습니다 · 원거지 소송을 강당합니다
 *
 * Every one of those is a real syllable in a plausible position. Only something
 * that reads Korean can tell they are wrong. The same is true of a paragraph
 * that changes subject halfway through, and of a table figure that was copied
 * accurately but understood backwards — 월 최소물량 read as a cap rather than a
 * floor is a number-perfect sentence that would lose a negotiation.
 *
 * ## Why a different upstream
 *
 * The reviewer must not share the failure being reviewed. The sales profile runs
 * a flash-tier model, which is where the corruption comes from; asking it to
 * grade itself invites the same derailment inside the verdict. `REVIEW_UPSTREAM`
 * points at a profile on a stronger model, and the review's output is short —
 * a verdict and a list — which is the regime where these failures are rarest.
 *
 * ## Why it reports and never rewrites
 *
 * Handing back a cleaned-up contract review would destroy the only signal the
 * reader has that the analysis was unreliable. The reviewer says what is wrong
 * and where; what to do about it is the salesperson's call.
 */

import { runBlocking } from "./hermes";
import { inspectAnswer, type QualityIssue } from "./answer-quality";
import { checkAgainstSource, type SourceIssue } from "./source-check";

/**
 * The profile the reviewer runs on. Deliberately not the sales profile — see
 * the module note. Overridable so the choice is one environment variable rather
 * than a code change when the model line-up moves.
 */
const REVIEW_UPSTREAM = process.env.HERMES_REVIEW_UPSTREAM ?? "voc-agent";
const REVIEW_MODEL = process.env.HERMES_REVIEW_MODEL ?? "voc-agent";

/** Long answers are the ones that derail; the tail is where it usually starts. */
const MAX_CHARS = 12_000;

export interface ReviewFinding {
  kind: "spelling" | "broken-context" | "table-misread" | "number";
  /** The offending fragment, quoted from the answer. */
  quote: string;
  /** What is wrong with it, in one line. */
  reason: string;
}

export interface AnswerReview {
  /** True when nothing was found, or when the review could not run. */
  ok: boolean;
  /** False when the reviewing agent did not answer — the answer is unjudged. */
  ran: boolean;
  findings: ReviewFinding[];
  mechanical: QualityIssue[];
  source: SourceIssue[];
}

const KINDS = new Set(["spelling", "broken-context", "table-misread", "number"]);

const PROMPT_HEAD = `당신은 한국어 영업 문서 검수자입니다. 아래 [답변]을 읽고 **잘못된 곳만** 찾습니다.
내용의 옳고 그름은 판단하지 않습니다. 표현과 정합성만 봅니다.

찾을 것:
1. spelling — 맞춤법·오타. 실제로 존재하는 음절이라도 문맥상 틀린 단어면 해당됩니다 (예: "반돋시"→"반드시", "구조젹으로"→"구조적으로", "강당합니다"→"감당합니다").
2. broken-context — 문장이 중간에 끊기거나, 앞뒤가 이어지지 않거나, 같은 말이 무의미하게 반복되는 구간.
3. table-misread — 표의 수치나 항목을 잘못 읽은 곳. 특히 최소물량을 상한으로, 단가를 총액으로 읽는 종류의 오독.
4. number — 계산이 맞지 않는 수치.

규칙:
- 문제가 없으면 빈 배열을 반환합니다. 억지로 찾지 않습니다.
- quote 는 [답변]에 있는 그대로를 40자 이내로 옮깁니다. 고쳐 쓰지 않습니다.
- reason 은 한 줄로 무엇이 왜 틀렸는지만 씁니다.
- **JSON 배열만 출력합니다.** 코드펜스, 설명, 그 외 어떤 글자도 붙이지 않습니다.

출력 형식:
[{"kind":"spelling","quote":"구조젹으로","reason":"'구조적으로'의 오타입니다."}]`;

/**
 * Pulls the JSON array out of a reply.
 *
 * Models wrap JSON in prose and fences however often they are told not to, and
 * a reviewer whose verdict is discarded over a stray ``` is a reviewer that
 * silently stops working. Scanning for the first balanced array is the same
 * lesson mi-report and marketing-agent both had to learn: assuming the first
 * brace starts the payload breaks the moment a sentence precedes it.
 */
export function extractJsonArray(text: string): unknown[] | null {
  const start = text.indexOf("[");
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i += 1) {
    const c = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === "[") depth += 1;
    else if (c === "]") {
      depth -= 1;
      if (depth === 0) {
        try {
          const parsed: unknown = JSON.parse(text.slice(start, i + 1));
          return Array.isArray(parsed) ? parsed : null;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

/** Keeps only entries shaped like a finding, so a malformed one cannot render. */
export function coerceFindings(raw: unknown[]): ReviewFinding[] {
  const out: ReviewFinding[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) continue;
    const r = item as Record<string, unknown>;
    const kind = typeof r.kind === "string" && KINDS.has(r.kind) ? r.kind : null;
    const quote = typeof r.quote === "string" ? r.quote.trim() : "";
    const reason = typeof r.reason === "string" ? r.reason.trim() : "";
    if (!kind || !quote || !reason) continue;
    out.push({
      kind: kind as ReviewFinding["kind"],
      quote: quote.slice(0, 80),
      reason: reason.slice(0, 200),
    });
  }
  return out;
}

/**
 * Runs every check over one answer.
 *
 * `source` is the parsed document the answer was about, when there was one —
 * without it the quotation and figure checks are skipped rather than guessed at.
 */
export async function reviewAnswer(
  answer: string,
  source?: string,
): Promise<AnswerReview> {
  const mechanical = inspectAnswer(answer).issues;
  const sourceIssues = source ? checkAgainstSource(answer, source).issues : [];

  const body = answer.length > MAX_CHARS ? answer.slice(0, MAX_CHARS) : answer;
  let reply: string | null = null;
  try {
    reply = await runBlocking({
      upstream: REVIEW_UPSTREAM,
      model: REVIEW_MODEL,
      input: `${PROMPT_HEAD}\n\n[답변]\n${body}`,
    });
  } catch {
    reply = null;
  }

  if (reply === null) {
    // The answer is unjudged, not judged clean. `ran: false` is what lets the
    // UI say so instead of showing a green tick nobody earned.
    return { ok: mechanical.length === 0 && sourceIssues.length === 0, ran: false, findings: [], mechanical, source: sourceIssues };
  }

  const parsed = extractJsonArray(reply);
  const findings = parsed ? coerceFindings(parsed) : [];
  return {
    ok: findings.length === 0 && mechanical.length === 0 && sourceIssues.length === 0,
    ran: parsed !== null,
    findings,
    mechanical,
    source: sourceIssues,
  };
}
