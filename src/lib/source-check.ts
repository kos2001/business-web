/**
 * Checking an answer against the document it claims to be reading.
 *
 * ## Why
 *
 * A contract review is a set of claims about a specific piece of paper. Two of
 * those claims are checkable without judgement:
 *
 * - **Quotations.** The `contract-review` playbook requires every finding to
 *   carry the clause text it rests on (`원문: "…"`). Either that string is in
 *   the document or it is not.
 * - **Figures.** 단가 14,200원, 월 최소물량 8,000개, 지연배상 2.5%, 납기 21일 —
 *   these live in the 품목표 and the clauses, and they are what a negotiation is
 *   actually about. A review that quietly rounds 14,200 to 14,000 is worse than
 *   one that omits the figure, because the number reads as sourced.
 *
 * Both are string comparisons against the parsed source. No model is involved
 * and none should be: a judge asked "is this quoted correctly" can be wrong,
 * and `indexOf` cannot.
 *
 * ## What this deliberately does not do
 *
 * It does not flag a figure as an *error*. An answer legitimately contains
 * numbers the document does not: 2.5% per day worked out to a yearly rate,
 * a proposed cap of 10%, a suggested 영업일 10일 검수 기한. Marking those wrong
 * would train people to ignore the warnings, so unmatched figures are reported
 * as "문서에 없는 수치" — a list to glance at, not a verdict. Only a quotation
 * that is absent from the source is called what it is: a misquote.
 */

export interface SourceIssue {
  kind: "misquote" | "unsourced-number";
  label: string;
  evidence: string;
}

export interface SourceReport {
  /** False only when something is definitely wrong — a misquote. */
  ok: boolean;
  issues: SourceIssue[];
  /** How many quotations were checked, so "0 problems" can be read honestly. */
  quotesChecked: number;
}

/**
 * Collapse everything that a converter can legitimately change: whitespace,
 * quote glyphs, and the spaces Docling inserts around table cell boundaries.
 * What survives is the text a human would call "the same sentence".
 */
function normalise(text: string): string {
  return text
    .replace(/[“”„‟＂]/g, '"')
    .replace(/[‘’‚‛']/g, "'")
    .replace(/[–—―]/g, "-")
    .replace(/\s+/g, "")
    .toLowerCase();
}

/** `원문: "…"` and bare quoted spans long enough to be a claim about the text. */
const QUOTE_RE = /(?:원문|인용)\s*[:：]\s*["“]([^"”]{10,400})["”]|["“]([^"”]{25,400})["”]/g;

/**
 * Figures that belong to the contract rather than to prose.
 *
 * The unit is what makes a number checkable. A bare "3" is a clause number, a
 * list index, or a count of findings; 8,000개 is a quantity that came from
 * somewhere. Clause references are excluded outright — 제5조 is a pointer, not
 * a value, and the document is full of them.
 */
const FIGURE_RE = /(\d[\d,]*(?:\.\d+)?)\s*(원|개|%|일|개월|년|만원|억원|배)/g;
const CLAUSE_REF_RE = /제\s*\d+\s*조/g;

/** Numbers small enough to be ordinals rather than data. */
function isTrivial(value: string, unit: string): boolean {
  const n = Number(value.replace(/,/g, ""));
  if (Number.isNaN(n)) return true;
  // A cap of "10%" or a deadline of "7일" is a real figure worth checking, so
  // percentages and day counts stay in. Bare small counts do not.
  if (unit === "개" || unit === "배") return n < 10;
  return false;
}

/**
 * Every numeric value in the source, as a bare digit string.
 *
 * Built as a set rather than searched for as a substring, because a substring
 * search finds "10" inside "SEM-A100" and inside "1,200" — which passed every
 * proposed figure as sourced and made the check useless in the direction that
 * matters. A value is either present in the document or it is not.
 */
function figuresIn(text: string): Set<string> {
  const out = new Set<string>();
  for (const m of text.matchAll(/\d[\d,]*(?:\.\d+)?/g)) {
    out.add(m[0].replace(/,/g, "").replace(/\.0+$/, ""));
  }
  return out;
}

export function checkAgainstSource(answer: string, source: string): SourceReport {
  const issues: SourceIssue[] = [];
  const haystack = normalise(source);
  if (!haystack) return { ok: true, issues, quotesChecked: 0 };
  const sourceFigures = figuresIn(source);

  let quotesChecked = 0;
  QUOTE_RE.lastIndex = 0;
  for (let m = QUOTE_RE.exec(answer); m; m = QUOTE_RE.exec(answer)) {
    const quote = (m[1] ?? m[2] ?? "").trim();
    if (!quote) continue;
    quotesChecked += 1;
    if (haystack.includes(normalise(quote))) continue;
    issues.push({
      kind: "misquote",
      label: "문서에서 찾을 수 없는 인용",
      evidence: quote.length > 90 ? `${quote.slice(0, 90)}…` : quote,
    });
  }

  const withoutClauseRefs = answer.replace(CLAUSE_REF_RE, " ");
  const unsourced = new Set<string>();
  FIGURE_RE.lastIndex = 0;
  for (let m = FIGURE_RE.exec(withoutClauseRefs); m; m = FIGURE_RE.exec(withoutClauseRefs)) {
    const [, value, unit] = m;
    if (isTrivial(value, unit)) continue;
    const figure = `${value}${unit}`;
    // Compare the value, not the rendering: the document may write 14,200 원
    // with a space, or the converter may drop the comma.
    const digits = value.replace(/,/g, "").replace(/\.0+$/, "");
    if (sourceFigures.has(digits)) continue;
    unsourced.add(figure);
  }

  for (const figure of unsourced) {
    issues.push({
      kind: "unsourced-number",
      label: "문서에 없는 수치",
      evidence: figure,
    });
  }

  // Only a misquote is a failure. Unsourced figures are usually the agent's own
  // proposal, which is what it was asked for.
  return {
    ok: !issues.some((i) => i.kind === "misquote"),
    issues,
    quotesChecked,
  };
}
