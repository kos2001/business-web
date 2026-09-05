/**
 * Catching answers that came back corrupted.
 *
 * ## What goes wrong
 *
 * The sales profile runs a flash-tier model through OpenRouter, and on long
 * Korean generations it sometimes derails mid-sentence. Two runs of the same
 * contract review produced:
 *
 *   "…구조젹으로 을 귀 귀 귀 귀 귀 귀 귀 … 귀귀 귀귀."
 *   "…특정할 수 없이 밟집니데 에넀 즉즉즉 에즉 으 함게 위가 이즉즉칙 앉완은즉좀"
 *
 * plus scattered single-character substitutions (반돋시, 구조젹, 있忌, об향적)
 * that cross into Han and Cyrillic. The second run also stopped after three of
 * six clauses and then wrote a tidy closing section, so the answer *looked*
 * complete.
 *
 * That last part is why this module exists. A visibly broken answer is a
 * nuisance; a plausible one with half the clauses missing is worse, because a
 * contract review is read by someone deciding whether to sign.
 *
 * ## Why a regex and not a model
 *
 * A judge model can also derail, and asking one to grade every answer doubles
 * the cost of every turn. These two signatures are mechanical — a decoder stuck
 * in a loop, and characters from a script that has no business in Korean
 * output. Mechanical faults are worth catching mechanically, immediately, and
 * for free. What this cannot see — a misspelling that is still a real syllable,
 * a paragraph that changes subject halfway — is left to the review pass in
 * `answer-review.ts`, which only runs when it is worth paying for.
 *
 * The rule throughout is to report, never to edit. Silently repairing a
 * corrupted contract review would hide exactly the thing the reader needs to
 * know: that this text cannot be trusted as it stands.
 */

export type QualityIssueKind = "repetition" | "foreign-script" | "orthography";

export interface QualityIssue {
  kind: QualityIssueKind;
  /** Shown to the user, so it says what is wrong in the team's own terms. */
  label: string;
  /** The offending text, trimmed to something readable. */
  evidence: string;
  /**
   * Set only when the check knows the right answer, which today means 률/율.
   * The defect store groups misspellings by what changed rather than by the
   * sentence they appeared in, so it needs the two words apart.
   */
  correction?: { wrong: string; right: string };
}

export interface QualityReport {
  ok: boolean;
  issues: QualityIssue[];
}

/**
 * Scripts that mean something went wrong.
 *
 * Han is included even though Korean legal writing does occasionally gloss a
 * term in hanja (準拠法). The playbooks already forbid it — the team reads and
 * forwards this text, and a hanja gloss is one more thing to strip before
 * sending — so its presence is a defect either way, and the same substitution
 * bug that produces 있忌 also produces the well-formed-looking glosses.
 */
const FOREIGN_SCRIPTS: { name: string; re: RegExp }[] = [
  { name: "한자", re: /[㐀-䶿一-鿿豈-﫿]/g },
  { name: "키릴 문자", re: /[Ѐ-ӿ]/g },
  { name: "가나", re: /[぀-ヿ]/g },
  { name: "타이 문자", re: /[฀-๿]/g },
  { name: "아랍 문자", re: /[؀-ۿ]/g },
  { name: "데바나가리", re: /[ऀ-ॿ]/g },
];

/**
 * The same Hangul syllable three or more times in a row — 즉즉즉, 귀귀귀.
 *
 * Three rather than four because the observed corruption bottomed out at three,
 * and Korean prose does not otherwise triple a syllable. Laughter (하하하) would
 * trip it, which is the right trade: this text is contract review and meeting
 * notes, and an answer containing 하하하 is worth a second look regardless.
 */
const SYLLABLE_RUN = /([가-힣])\1{2,}/;

/**
 * A short token repeated with whitespace between it — "귀 귀 귀 귀".
 *
 * Four repeats, not three: a real sentence can legitimately repeat a one-syllable
 * word twice in a row for emphasis, and lists of the same short label ("갑 갑 갑")
 * do occur in tables. Four in a row does not happen in written Korean.
 */
const TOKEN_RUN = /(?:^|\s)([가-힣A-Za-z]{1,3})(?:\s+\1){3,}/;

/**
 * 률 / 율 — the one misspelling worth checking mechanically.
 *
 * The suffix is decided entirely by the syllable in front of it: no final
 * consonant, or a final ㄴ, takes 율; anything else takes 률. 비율 and 할인율
 * against 배상률 and 가동률. No dictionary is needed, because Hangul encodes
 * the final consonant arithmetically — subtract the block base and take the
 * remainder mod 28, where 0 is "no final" and 4 is ㄴ.
 *
 * This is here rather than in the profile prompt because the prompt already
 * says it. The rule has been in SOUL.md through three workspaces' worth of
 * defect records and 배상율 came back anyway, most recently in a run whose
 * arithmetic was otherwise correct. A rule the model keeps forgetting is a
 * rule that belongs in code — and unlike the other checks in this file, this
 * one is decidable, so it can name the correct spelling rather than merely
 * flagging suspicion.
 *
 * Measured before shipping: across every Korean text in the repository, 61
 * occurrences, 55 agreeing with the rule and 6 disagreeing — all 6 genuine
 * 배상율 defects, no false positives. A separate pass over 51 standard words
 * (효율, 규율, 조율, 요율, 확률, 시청률 …) flagged none.
 */
const RATE_SUFFIX = /([가-힣])([률율])/g;

/** Which of 률/율 belongs after `syllable`, or null if it is not Hangul. */
export function expectedRateSuffix(syllable: string): "률" | "율" | null {
  const code = syllable.codePointAt(0);
  if (code === undefined || code < 0xac00 || code > 0xd7a3) return null;
  const finalConsonant = (code - 0xac00) % 28;
  // 0 = no final consonant, 4 = ㄴ.
  return finalConsonant === 0 || finalConsonant === 4 ? "율" : "률";
}

/** Trim a match to something a person can read in a warning line. */
function evidenceAround(text: string, index: number, length: number): string {
  const start = Math.max(0, index - 25);
  const end = Math.min(text.length, index + length + 25);
  return `${start > 0 ? "…" : ""}${text.slice(start, end).replace(/\s+/g, " ").trim()}${
    end < text.length ? "…" : ""
  }`;
}

/**
 * Inspects a finished answer. Never throws and never rewrites the text —
 * callers decide whether to retry, warn, or ignore.
 */
export function inspectAnswer(text: string): QualityReport {
  const issues: QualityIssue[] = [];
  if (!text.trim()) return { ok: true, issues };

  const syllable = SYLLABLE_RUN.exec(text);
  const token = TOKEN_RUN.exec(text);
  const loop = syllable ?? token;
  if (loop) {
    issues.push({
      kind: "repetition",
      label: "같은 글자가 반복되는 구간",
      evidence: evidenceAround(text, loop.index, loop[0].length),
    });
  }

  for (const { name, re } of FOREIGN_SCRIPTS) {
    re.lastIndex = 0;
    const m = re.exec(text);
    if (!m) continue;
    // Count them: one stray character and a page of them are different
    // problems, and the number tells the reader which they have.
    re.lastIndex = 0;
    const count = (text.match(re) ?? []).length;
    issues.push({
      kind: "foreign-script",
      label: `${name} ${count}자`,
      evidence: evidenceAround(text, m.index, 1),
    });
  }

  RATE_SUFFIX.lastIndex = 0;
  const misspelled = new Map<string, { correct: string; index: number }>();
  for (let m = RATE_SUFFIX.exec(text); m; m = RATE_SUFFIX.exec(text)) {
    const expected = expectedRateSuffix(m[1]);
    if (!expected || expected === m[2]) continue;
    // Report each distinct word once, however often it recurs.
    const word = /[가-힣]+$/.exec(text.slice(0, m.index + m[0].length))?.[0] ?? m[0];
    if (!misspelled.has(word)) {
      misspelled.set(word, { correct: word.slice(0, -1) + expected, index: m.index });
    }
  }
  for (const [wrong, { correct, index }] of misspelled) {
    issues.push({
      kind: "orthography",
      label: `${wrong} → ${correct}`,
      evidence: evidenceAround(text, index, wrong.length),
      correction: { wrong, right: correct },
    });
  }

  return { ok: issues.length === 0, issues };
}

/** One line for the UI: what is wrong, without the evidence. */
export function summariseIssues(issues: QualityIssue[]): string {
  return issues.map((i) => i.label).join(", ");
}
