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

/**
 * Which quoted spans are claims about the document.
 *
 * Not every quotation is one. A review of an unfavourable contract is mostly
 * *proposed replacement wording* — 수정안: "보증기간은 납품일로부터 12개월로
 * 한다." — which by definition is not in the document, and an earlier version
 * of this check reported every one of them as a missing quotation. A panel that
 * cries wolf on the agent doing its job is worse than no panel: the first live
 * run produced eight false alarms and nothing true.
 *
 * So a quote counts only where the answer presents it as the source text:
 * introduced by `원문:`/`인용:`, or set as a markdown blockquote, which is how
 * the playbook's clause citations are rendered. Anything introduced as a
 * proposal is skipped outright.
 */
const QUOTE_IN_LINE = /["“]([^"”]{10,400})["”]/g;
const SOURCE_LEAD_RE = /(원문|인용)\s*[:：]/;
const PROPOSAL_RE = /(수정안|제안|대안|권고|문안|신설|추가)\s*[:：]?/;

/** Yields the spans a line offers as the document's own words. */
function quotedClaims(answer: string): string[] {
  const out: string[] = [];
  for (const raw of answer.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const isBlockquote = line.startsWith(">");
    const lead = SOURCE_LEAD_RE.exec(line);
    if (!isBlockquote && !lead) continue;

    // "…원문은 이렇고, 수정안: '…'" — everything from the proposal onward is the
    // agent's wording, not the contract's.
    const proposal = PROPOSAL_RE.exec(line);
    const cut = proposal ? line.slice(0, proposal.index) : line;
    // A blockquote whose only content is a proposal has nothing left to check.
    const body = lead ? cut.slice(lead.index + lead[0].length) : cut;

    QUOTE_IN_LINE.lastIndex = 0;
    for (let m = QUOTE_IN_LINE.exec(body); m; m = QUOTE_IN_LINE.exec(body)) {
      out.push(m[1].trim());
    }
  }
  return out;
}

/**
 * Figures that belong to the contract rather than to prose.
 *
 * The unit is what makes a number checkable. A bare "3" is a clause number, a
 * list index, or a count of findings; 8,000개 is a quantity that came from
 * somewhere. Clause references are excluded outright — 제5조 is a pointer, not
 * a value, and the document is full of them.
 */
// Longer units first: with 개 ahead of 개월, "12개월" matches as "12개" and
// is then reported as an unsourced quantity that nobody wrote.
const FIGURE_RE = /(\d[\d,]*(?:\.\d+)?)\s*(개월|만원|억원|원|개|%|일|년|배)/g;

/**
 * The same figures in an English contract.
 *
 * Written separately rather than folded into the pattern above because the
 * shapes differ: Korean puts the unit after the number, and a currency puts it
 * before — `USD 14,200`, not `14,200 USD`. Tested against a real English
 * supply agreement, where the Korean-only pattern saw `10%` and nothing else:
 * a unit price stated as 14,000 when the schedule says 14,200 went straight
 * through, which is the exact error this check exists to catch.
 */
const CURRENCY_RE = /(?:USD|EUR|JPY|KRW|CNY|GBP|\$|€|¥|₩)\s*(\d[\d,]*(?:\.\d+)?)/gi;
const EN_UNIT_RE =
  /(\d[\d,]*(?:\.\d+)?)\s*(business\s+days?|calendar\s+days?|days?|weeks?|months?|years?|units?|pcs|pieces?|%)/gi;
const CLAUSE_REF_RE = /제\s*\d+\s*조/g;

/** Small counts of things are ordinals; a deadline or a rate is data. */
function isTrivialEn(value: string, unit: string): boolean {
  const n = Number(value.replace(/,/g, ""));
  if (Number.isNaN(n)) return true;
  return /units?|pcs|pieces?/i.test(unit) && n < 10;
}

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
  for (const quote of quotedClaims(answer)) {
    if (!quote) continue;
    quotesChecked += 1;
    if (haystack.includes(normalise(quote))) continue;
    issues.push({
      kind: "misquote",
      label: "문서에서 찾을 수 없는 인용",
      evidence: quote.length > 90 ? `${quote.slice(0, 90)}…` : quote,
    });
  }

  const withoutClauseRefs = answer
    .replace(CLAUSE_REF_RE, " ")
    // "Article 5" is a pointer like 제5조, not a value.
    .replace(/\b(?:article|clause|section|schedule)\s+\d+/gi, " ");
  // Keyed by value, not by label: the Korean and English patterns both match
  // "10%" (as "10%" and "10 %"), and reporting one figure twice makes the panel
  // look like it found more than it did.
  const unsourced = new Map<string, string>();

  const consider = (value: string, label: string) => {
    const digits = value.replace(/,/g, "").replace(/\.0+$/, "");
    if (sourceFigures.has(digits) || unsourced.has(digits)) return;
    unsourced.set(digits, label);
  };

  FIGURE_RE.lastIndex = 0;
  for (let m = FIGURE_RE.exec(withoutClauseRefs); m; m = FIGURE_RE.exec(withoutClauseRefs)) {
    const [, value, unit] = m;
    if (isTrivial(value, unit)) continue;
    // Compare the value, not the rendering: the document may write 14,200 원
    // with a space, or the converter may drop the comma.
    consider(value, `${value}${unit}`);
  }

  CURRENCY_RE.lastIndex = 0;
  for (let m = CURRENCY_RE.exec(withoutClauseRefs); m; m = CURRENCY_RE.exec(withoutClauseRefs)) {
    consider(m[1], m[0].replace(/\s+/g, " ").trim());
  }

  EN_UNIT_RE.lastIndex = 0;
  for (let m = EN_UNIT_RE.exec(withoutClauseRefs); m; m = EN_UNIT_RE.exec(withoutClauseRefs)) {
    const [, value, unit] = m;
    if (isTrivialEn(value, unit)) continue;
    consider(value, `${value} ${unit}`.replace(/\s+/g, " "));
  }

  for (const figure of unsourced.values()) {
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
