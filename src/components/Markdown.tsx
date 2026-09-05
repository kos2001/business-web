/**
 * Rendering an agent answer.
 *
 * ## Why this is not just `<ReactMarkdown>`
 *
 * Two things were wrong with the plain call this replaces.
 *
 * The first was a bug: tables are a GitHub extension, not core Markdown, and
 * the plugin that parses them was never installed. The stylesheet had rules for
 * `th` and `td` that nothing had ever matched, and a customer profile came back
 * to the user as forty lines of pipe characters. `remarkGfm` fixes that.
 *
 * The second is that 미확인 is the most important word this app prints. The
 * playbooks forbid inventing a value, so an unknown stays unknown, and a filled
 * table is a report while a table full of 미확인 is a list of what to ask in the
 * next meeting. Those are different documents and they should not look alike.
 * CSS cannot select on text content, so the cell renderer does it here.
 *
 * The rule is the same one the rest of the app follows: mark, never alter. The
 * text rendered is exactly the text the agent wrote, and exactly the text the
 * verification panel below it was run against.
 */

import type { ComponentProps, ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const PLUGINS = [remarkGfm];

/** The placeholders the playbooks use for a value nobody has confirmed yet. */
const UNKNOWN = new Set(["미확인", "확인 필요", "미정", "해당 없음", "N/A", "-"]);

/** The visible text of a rendered node, for the cheap equality test below. */
function flatten(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(flatten).join("");
  if (typeof node === "object" && "props" in node) {
    return flatten((node as { props?: { children?: ReactNode } }).props?.children);
  }
  return "";
}

function Cell({ children, node, ...rest }: ComponentProps<"td"> & { node?: unknown }) {
  // `node` is react-markdown's own syntax-tree handle. It is not an attribute,
  // and spreading it reaches the browser as node="[object Object]" — caught by
  // reading the rendered output rather than by anything failing.
  void node;
  // Only a cell that is *entirely* the placeholder counts. A sentence that
  // happens to contain 미확인 is prose and should read as prose.
  const unknown = UNKNOWN.has(flatten(children).trim());
  return (
    <td {...rest} data-unknown={unknown || undefined}>
      {children}
    </td>
  );
}

export default function Markdown({ children }: { children: string }) {
  return (
    <ReactMarkdown remarkPlugins={PLUGINS} components={{ td: Cell }}>
      {children}
    </ReactMarkdown>
  );
}
