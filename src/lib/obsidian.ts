/**
 * Saving an answer into an Obsidian vault.
 *
 * ## Why only this one direction
 *
 * A contract review lives in browser scrollback and dies on refresh. That is
 * the same problem the action-item store was built for, and the same answer:
 * the thing worth keeping has to land somewhere that outlives the run.
 *
 * Reading *from* the vault was considered and left out. Contracts arrive as
 * .docx and the precedent corpus already holds them; pointing a second reader
 * at a second copy is how two stores drift apart. The vault is a destination
 * here, not a source.
 *
 * ## The fence
 *
 * The note name comes from an agent's answer, so it is untrusted. Every path is
 * built from the configured vault root plus a sanitised single segment, and the
 * result is checked to be inside the root before anything is written — the same
 * rule the upload staging follows, for the same reason: without it this is a
 * write-anywhere primitive wearing a note's clothes.
 */

import { existsSync, statSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const VAULT = process.env.OBSIDIAN_VAULT_PATH ?? "";
/** Notes land here rather than at the vault root, which is someone's own space. */
const FOLDER = process.env.OBSIDIAN_NOTE_FOLDER ?? "영업 에이전트";

export class ObsidianError extends Error {}

export function vaultPath(): string {
  return VAULT;
}

/** Configured and actually present — a path in the env that is not there is not configured. */
export function isConfigured(): boolean {
  if (!VAULT) return false;
  try {
    return statSync(VAULT).isDirectory();
  } catch {
    return false;
  }
}

export function describeConfig(): {
  configured: boolean;
  vault: string | null;
  folder: string;
  /** Set but missing or not a directory — worth saying, since it looks configured. */
  vaultMissing: boolean;
} {
  return {
    configured: isConfigured(),
    vault: VAULT || null,
    folder: FOLDER,
    vaultMissing: Boolean(VAULT) && !isConfigured(),
  };
}

/**
 * A filename that cannot escape its folder.
 *
 * Obsidian additionally chokes on `#`, `^`, `[`, `]` and `|` in note names —
 * they are its own link syntax — so those go too, even though they are
 * harmless to the filesystem.
 */
export function noteFileName(title: string): string {
  const cleaned = title
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x1f<>:"/\\|?*#^[\]]/g, " ")
    .replace(/\.{2,}/g, ".")
    .replace(/\s+/g, " ")
    .trim()
    // Leading dots and spaces come off together and repeatedly: "../../x"
    // collapses to ". . x", and stripping only the first dot left ". x" —
    // still a name starting with a dot, which is a hidden file.
    .replace(/^[.\s]+/, "")
    .slice(0, 80)
    .trim();
  return `${cleaned || "무제"}.md`;
}

export interface NoteInput {
  title: string;
  workspace: string;
  /** The answer, verbatim. */
  body: string;
  /** Documents the answer was about, linked so the note is traceable. */
  sources?: string[];
}

/**
 * Writes the note and returns its path.
 *
 * Never overwrites: a second review of the same contract is a second note, not
 * a silent replacement of the first. The suffix is the minute, which is enough
 * to separate two runs and short enough to read.
 */
export async function saveNote(input: NoteInput): Promise<{ path: string; name: string }> {
  if (!isConfigured()) {
    throw new ObsidianError(
      VAULT
        ? `보관함을 찾을 수 없습니다: ${VAULT}`
        : "Obsidian 보관함이 설정되지 않았습니다. 설정 > Obsidian 노트 에서 경로를 넣어 주세요.",
    );
  }

  const root = resolve(VAULT);
  const dir = resolve(join(root, FOLDER));
  if (dir !== root && !dir.startsWith(root + "/")) {
    throw new ObsidianError("노트 폴더가 보관함 밖을 가리킵니다.");
  }

  let name = noteFileName(input.title);
  let target = resolve(join(dir, name));
  if (!target.startsWith(dir + "/")) {
    throw new ObsidianError("노트 이름이 폴더 밖을 가리킵니다.");
  }
  if (existsSync(target)) {
    const stamp = new Date().toISOString().slice(11, 16).replace(":", "");
    name = noteFileName(`${input.title} ${stamp}`);
    target = resolve(join(dir, name));
    if (!target.startsWith(dir + "/")) {
      throw new ObsidianError("노트 이름이 폴더 밖을 가리킵니다.");
    }
  }

  await mkdir(dir, { recursive: true });
  await writeFile(target, renderNote(input), { encoding: "utf8", mode: 0o600 });
  return { path: target, name };
}

/**
 * Obsidian-flavoured Markdown: YAML frontmatter it can index, and wikilinks for
 * the source documents so the note joins the graph rather than sitting alone.
 */
export function renderNote(input: NoteInput): string {
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const sources = (input.sources ?? [])
    .map((p) => p.split("/").pop() ?? p)
    // The staging uuid prefix is noise in a note title.
    .map((n) => n.replace(/^[0-9a-f]{8}-/, "").replace(/\.md$/, ""))
    .filter((n, i, all) => n && all.indexOf(n) === i);

  const front = [
    "---",
    `title: ${JSON.stringify(input.title)}`,
    `date: ${date}`,
    `workspace: ${input.workspace}`,
    "tags: [영업에이전트]",
    ...(sources.length ? [`sources: [${sources.map((s) => JSON.stringify(s)).join(", ")}]`] : []),
    "---",
    "",
  ];

  const links = sources.length
    ? ["", "## 근거 문서", ...sources.map((s) => `- [[${s}]]`), ""]
    : [];

  return [...front, `# ${input.title}`, "", input.body.trim(), ...links, ""].join("\n");
}
