/**
 * Outbound redaction for customer data.
 *
 * The sibling desktop app settled on `PROTECT_DEFAULT = true` after a security
 * review: a sales tool handles named customers, and the safe failure mode is a
 * redacted prompt, not a leaked one. The same default holds here, and it is
 * applied on the server so a compromised or modified browser cannot turn it off.
 *
 * The detector set is adapted from `sales-agent-desktop`'s `pii-redaction.ts`,
 * which had already been through a security review, plus two additions this
 * app needs: 사업자등록번호 and landline numbers, both of which show up
 * constantly in Korean B2B sales material and neither of which the desktop
 * catches.
 *
 * Detectors are deliberately HIGH-PRECISION — specific shapes, Luhn-checked
 * cards, valid IPv4 octets — because masking ordinary prose would make the tool
 * annoying enough that people turn protection off, which is the worst outcome.
 * The trade-off is recall: this catches well-formed identifiers, not free-form
 * sensitive prose. It is a transport guard, not a classifier.
 *
 * Irreversible by design: matches become a typed placeholder, and the model
 * reasons about structure without seeing the value. A reversible token→restore
 * variant (the "PII gateway" pattern, already implemented in the desktop app's
 * `pii-gateway.ts`) is the natural next step and would let the agent draft mail
 * to a real address; it is not here yet.
 */

/** Luhn checksum — confirms a digit run is a plausible card number.
 *  Without it, any 16-digit run (order ids, timestamps, serial numbers) gets
 *  masked, which is a steady stream of false positives in sales documents. */
function passesLuhn(digits: string): boolean {
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let d = digits.charCodeAt(i) - 48;
    if (d < 0 || d > 9) return false;
    if (alt) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    alt = !alt;
  }
  return sum % 10 === 0;
}

export interface Detector {
  /** Rule key, also the placeholder text. */
  label: string;
  pattern: RegExp;
  /** Extra guard — return false to leave a candidate match alone. */
  accept?: (match: string) => boolean;
}

/**
 * Order matters. More specific detectors run first, and every placeholder is
 * free of digits and `@` so a later detector cannot re-match one.
 *
 * RRN before CARD: a 13-digit 주민등록번호 would otherwise be a candidate for
 * the card rule. CARD before PHONE for the same reason in the other direction.
 */
export const DETECTORS: Detector[] = [
  {
    // Provider/API secrets. A rep pasting a config snippet or an error log is
    // the realistic path by which a live credential reaches a cloud model.
    label: "secret",
    pattern:
      /\b(?:sk-[A-Za-z0-9_-]{16,}|AKIA[0-9A-Z]{16}|gh[posu]_[A-Za-z0-9]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|AIza[0-9A-Za-z_-]{20,}|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,})\b/g,
  },
  {
    label: "email",
    pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
  },
  {
    // 주민등록번호
    label: "rrn",
    pattern: /\b\d{6}[-\s]?[1-4]\d{6}\b/g,
  },
  {
    label: "card",
    pattern: /\b(?:\d[ -]?){13,19}\b/g,
    accept: (m) => {
      const digits = m.replace(/\D/g, "");
      return digits.length >= 13 && digits.length <= 19 && passesLuhn(digits);
    },
  },
  {
    // 사업자등록번호 — not in the desktop's set, but it is on every Korean B2B
    // quote, contract and tax invoice this tool will ever see.
    label: "bizno",
    pattern: /\b\d{3}-\d{2}-\d{5}\b/g,
  },
  {
    // Korean mobile.
    label: "phone",
    pattern: /\b01[016789][-\s]?\d{3,4}[-\s]?\d{4}\b/g,
  },
  {
    // Landline, including the Seoul 02 area code. B2B contacts are more often
    // an office number than a mobile, so leaving these out would miss the
    // common case.
    label: "phone",
    pattern: /\b0(?:2|[3-6][1-5]|70|80)[-\s]?\d{3,4}[-\s]?\d{4}\b/g,
  },
  {
    label: "ip",
    pattern:
      /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/g,
  },
];

export interface RedactionResult {
  text: string;
  /** Rule label → number of substitutions, for the UI's disclosure line. */
  hits: Record<string, number>;
}

export function redact(input: string): RedactionResult {
  const hits: Record<string, number> = {};
  let text = String(input ?? "");

  for (const detector of DETECTORS) {
    text = text.replace(detector.pattern, (match) => {
      if (detector.accept && !detector.accept(match)) return match;
      hits[detector.label] = (hits[detector.label] ?? 0) + 1;
      return `[${detector.label.toUpperCase()}]`;
    });
  }

  return { text, hits };
}
