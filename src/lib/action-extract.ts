/**
 * Pulling action-item candidates out of an agent's answer.
 *
 * Every playbook ends its output with next steps — that is a rule they share
 * ("출력은 항상 다음 액션으로 끝난다"). Those lines are the follow-ups worth
 * tracking, and today they scroll away with the conversation.
 *
 * ## Candidates, never saves
 *
 * This module only *proposes*. Nothing reaches the store until a person clicks.
 * The reason is the same one that keeps the precedent corpus manual: if every
 * suggestion in every answer landed in the task list automatically, the list
 * would be noise within a week and people would stop opening it.
 *
 * ## Why regex and not another model call
 *
 * The text is already structured — the playbooks emit checkboxes, numbered next
 * steps, and `담당/기한` annotations. Asking a model to re-read its own output
 * costs a round trip and introduces a second chance to hallucinate an owner.
 * Reading what is literally there cannot invent anything.
 */

export interface ActionCandidate {
  title: string;
  owner: string | null;
  due: string | null;
  /** The line it came from, kept so the user can judge the proposal. */
  sourceText: string;
}

// `next actions` and `next steps` are here because an English contract review
// heads its follow-up list that way and the panel found nothing at all — the
// playbooks' 다음 액션 rule does not survive translation.
const CUE = "(다음\\s*액션|액션\\s*아이템|action\\s*items?|next\\s*actions?|next\\s*steps?|사내\\s*확인(?:\\s*사항)?|확인\\s*필요|조치\\s*필요|즉시\\s*확인|협상\\s*포인트|확정\\s*필요)";

/** A line that is only the heading — "다음 액션", "## Action Items". */
const SECTION_RE = new RegExp(`^#{0,4}\\s*\\**\\s*${CUE}\\s*\\**\\s*[:：]?\\s*$`, "i");

/**
 * A lead-in sentence that ends by announcing the list — "A사 무응답 건 — 다음
 * 액션 세 개:". Models write this instead of a bare heading often enough that
 * requiring the heading missed most real answers; the panel simply never
 * appeared. The trailing colon is what makes it an announcement rather than a
 * passing mention of the words.
 */
const SECTION_LEAD_RE = new RegExp(`${CUE}[^\\n]{0,20}[:：]\\s*$`, "i");

/**
 * A line whose *tail* announces the list — "지금 단계에서 실행 가능한 액션:",
 * "우선 처리할 액션 아이템".
 *
 * The two patterns above both require the cue to start the line, which assumes
 * the model names the section exactly the way the playbook does. It does not:
 * the same prompt produced "다음 액션" one run and "지금 단계에서 실행 가능한
 * 액션:" the next, and the panel silently vanished for the second. Anchoring on
 * the cue *ending* the line survives the rewording, because whatever the model
 * puts in front, the section is still named after the actions.
 */
const SECTION_TAIL_RE =
  /(?:액션(?:\s*아이템)?|action\s*items?|다음\s*단계|next\s*steps?)\s*[^\n]{0,8}?[:：]\s*$/i;

/** The same, without a colon — only for a line short enough to be a heading. */
const SECTION_TAIL_HEADING_RE =
  /(?:액션(?:\s*아이템)?|action\s*items?|다음\s*단계|next\s*steps?)\s*$/i;

function startsSection(line: string): boolean {
  if (SECTION_RE.test(line) || SECTION_LEAD_RE.test(line)) return true;
  const t = stripMarks(line).replace(/^#{1,6}\s*/, "");
  if (SECTION_TAIL_RE.test(t)) return true;
  // Without a colon there is nothing marking it as an announcement, so length
  // has to do that work — a heading is short, a sentence that happens to end on
  // the word is not.
  return t.length <= 30 && SECTION_TAIL_HEADING_RE.test(t);
}

/** A line that is itself an item: checkbox, bullet, or "1." */
const ITEM_RE = /^\s*(?:[-*]\s*\[[ xX]\]|[-*•]|\d+[.)])\s+(.*\S)/;

/**
 * A line that ends the follow-up list.
 *
 * Markdown headings are the obvious case, but playbooks also write plain-text
 * sub-headings — `확인 못한 것 (다음 미팅 필수 질문)` has no `#` and no bold, and
 * treating it as part of the list swept the questions underneath it into the
 * action items. A question to ask is not a task to do, and the playbook keeps
 * them in separate sections precisely because they are different things.
 *
 * So the rule is structural: inside the list, any non-indented line that is not
 * itself an item closes it. Wrapped continuations stay indented, so they don't.
 */
function endsSection(line: string): boolean {
  if (!line.trim()) return false; // a blank line does not end a list
  if (/^\s/.test(line)) return false; // indented — a continuation
  if (ITEM_RE.test(line)) return false;
  if (/^#{1,6}\s+\S/.test(line)) return true;
  // Two different non-item lines can appear inside a section and they must be
  // treated differently:
  //
  //   확인 못한 것 (다음 미팅 필수 질문)   ← a sub-heading: the list is over
  //   이 건은 지금 판단하기 어려운 상황이다. ← an aside: the list continues
  //
  // Length plus sentence-ending punctuation separates them. A heading is short
  // and does not end a sentence; prose does. Closing on prose truncated the
  // list at the first descriptive line, and not closing on a heading swept the
  // questions beneath it into the actions.
  const t = stripMarks(line);
  const endsSentence = /[.。!?]$|(?:다|요)[.。]?$/.test(t);
  return t.length < 30 && !endsSentence;
}

/**
 * Whether a line reads as something to do.
 *
 * Korean marks this at the end: an instruction closes on a verb (…한다,
 * …보낸다) or an action noun (…확인, …요청). A sub-heading or a description
 * does not. Testing for the instruction rather than against the heading means
 * an unrecognised shape is dropped, not mis-captured — the safer error for a
 * list the user is asked to trust.
 */
const ACTION_END_RE =
  /(?:한다|된다|낸다|받는다|본다|둔다|잡는다|만든다|보낸다|올린다|내린다|정한다|묻는다|따진다|가른다|평가한다|확인|점검|요청|준비|작성|발송|정리|파악|설정|공유|보고|검토|협의|하기|받기|보기|묻기)[.。]?$/;

function looksLikeAction(title: string): boolean {
  if (isExplanation(title)) return false;
  // A trailing parenthetical is an aside, not the ending — "…명시한다
  // (예: 1주일 내 회신)." hides the verb behind it.
  const core = title.replace(/\s*[（(][^)）]*[)）]\s*[.。]?\s*$/, "").trim();
  const t = title.trim();
  return (
    ACTION_END_RE.test(core) ||
    ACTION_END_RE.test(t) ||
    ACTION_POLITE_RE.test(core) ||
    ACTION_POLITE_RE.test(t)
  );
}

const OWNER_RE = /(?:담당|owner)\s*[:：]?\s*([^\s·,—|]{1,20})/i;
const DUE_RE =
  /(?:기한|due|까지)\s*[:：]?\s*(\d{4}-\d{2}-\d{2})|(\d{4}-\d{2}-\d{2})\s*까지/i;

/**
 * A request or an obligation, written politely — "…확인이 필요합니다",
 * "…확정해야 합니다", "…검토 부탁드립니다", "…발송해 주세요".
 *
 * These have to be recognised *before* the 니다-ending test below, because they
 * end the same way a description does. The agents write in 존댓말, so without
 * this every politely-phrased task would read as the agent explaining itself and
 * be thrown away — the ending alone cannot tell the two apart.
 */
const ACTION_POLITE_RE =
  /(?:필요합니다|해야\s*합니다|하셔야\s*합니다|부탁드립니다|바랍니다|주세요|주십시오|하세요|하십시오|해\s*주시기\s*바랍니다)[.。]?$/;

/**
 * True when the line is the agent explaining rather than proposing.
 *
 * The playbooks refuse to invent follow-ups when the source named none, and
 * they say so *inside* the 다음 액션 section — "메모에 합의된 액션이 없어서
 * 지어내지 않았습니다." Capturing that as a task would turn the discipline into
 * a to-do, which is worse than capturing nothing.
 *
 * Korean gives a signal, but only once requests are set aside first: a
 * statement about the situation ends in 니다/습니다/입니다, and so does a polite
 * instruction. ACTION_POLITE_RE separates them.
 */
function isExplanation(title: string): boolean {
  const t = title.trim();
  if (ACTION_POLITE_RE.test(t)) return false;
  return /(습니다|입니다|합니다|됩니다|드립니다|같습니다)[.。]?$/.test(t);
}

function stripMarks(line: string): string {
  return line.replace(/\*\*/g, "").replace(/`/g, "").trim();
}

/** Strips list markers, bold, and trailing metadata from a line. */
function clean(line: string): string {
  return line
    .replace(/\*\*/g, "")
    .replace(/`/g, "")
    // The metadata is captured separately; leaving it in the title makes every
    // row read as "제안서 발송 — 담당 김대리 · 기한 2026-09-10".
    .replace(/\s*[—–-]\s*(담당|owner|기한|due)\s*[:：].*$/i, "")
    .replace(/\s*\((담당|기한)[^)]*\)\s*$/i, "")
    .trim();
}

/**
 * Reads follow-up sections and returns what they propose.
 *
 * Deliberately narrow: only lines inside a recognised section. Treating every
 * bullet in a long contract review as an action item would propose thirty
 * things, and a proposal list nobody can scan is the same as no list.
 */
export function extractCandidates(answer: string, limit = 12): ActionCandidate[] {
  const lines = answer.split("\n");
  const out: ActionCandidate[] = [];
  const seen = new Set<string>();
  let inSection = false;

  for (const raw of lines) {
    if (startsSection(raw)) {
      inSection = true;
      continue;
    }
    if (inSection && endsSection(raw)) {
      inSection = false;
      continue;
    }
    if (!inSection) continue;

    const m = ITEM_RE.exec(raw);
    const body = m ? m[1] : raw.trim();
    if (!body) continue;
    // A list marker is itself evidence of intent; a bare paragraph has to earn
    // it by reading like an instruction.
    if (!m && !looksLikeAction(stripMarks(body))) continue;

    const title = clean(body);
    // Sub-10-char fragments are usually a wrapped line, not an action.
    if (title.length < 8 || seen.has(title)) continue;
    if (isExplanation(title)) continue;
    seen.add(title);

    const dueMatch = DUE_RE.exec(raw);
    out.push({
      title: title.slice(0, 200),
      owner: OWNER_RE.exec(raw)?.[1] ?? null,
      due: dueMatch ? (dueMatch[1] ?? dueMatch[2] ?? null) : null,
      sourceText: raw.trim().slice(0, 400),
    });
    if (out.length >= limit) break;
  }

  return out;
}
