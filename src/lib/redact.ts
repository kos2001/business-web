/**
 * Outbound redaction for customer data.
 *
 * The sibling desktop app settled on `PROTECT_DEFAULT = true` after a security
 * review: a sales tool handles named customers, and the safe failure mode is a
 * redacted prompt, not a leaked one. The same default holds here, and it is
 * applied on the server so a compromised or modified browser cannot turn it off.
 *
 * This is deliberately conservative pattern matching, not classification. It
 * catches the identifiers that actually show up in Korean B2B sales material.
 * It is a reduction of exposure, not a guarantee — do not describe it as one.
 */

export interface RedactionRule {
  label: string;
  pattern: RegExp;
  placeholder: string;
}

export const RULES: RedactionRule[] = [
  {
    label: "email",
    pattern: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
    placeholder: "[EMAIL]",
  },
  {
    label: "rrn", // 주민등록번호
    pattern: /\b\d{6}[-\s]?[1-4]\d{6}\b/g,
    placeholder: "[RRN]",
  },
  {
    label: "bizno", // 사업자등록번호
    pattern: /\b\d{3}-\d{2}-\d{5}\b/g,
    placeholder: "[BIZNO]",
  },
  {
    label: "phone",
    pattern: /\b0\d{1,2}[-\s]?\d{3,4}[-\s]?\d{4}\b/g,
    placeholder: "[PHONE]",
  },
  {
    label: "card",
    pattern: /\b(?:\d{4}[-\s]?){3}\d{4}\b/g,
    placeholder: "[CARD]",
  },
];

export interface RedactionResult {
  text: string;
  /** Rule label → number of substitutions, for the UI's disclosure line. */
  hits: Record<string, number>;
}

export function redact(input: string): RedactionResult {
  const hits: Record<string, number> = {};
  let text = input;

  // Card before phone: a 16-digit card written with dashes would otherwise be
  // partially eaten by the phone rule. Order within RULES is not enough, so the
  // card rule is applied against the original text ordering below.
  for (const rule of [...RULES].sort((a, b) => order(a) - order(b))) {
    let count = 0;
    text = text.replace(rule.pattern, () => {
      count += 1;
      return rule.placeholder;
    });
    if (count > 0) hits[rule.label] = count;
  }

  return { text, hits };
}

/** Longest/most-specific patterns run first so they win overlapping matches. */
function order(rule: RedactionRule): number {
  const priority: Record<string, number> = {
    rrn: 0,
    card: 1,
    bizno: 2,
    email: 3,
    phone: 4,
  };
  return priority[rule.label] ?? 99;
}
