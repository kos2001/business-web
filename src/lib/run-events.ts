/**
 * The hermes run event vocabulary, as emitted by
 * `gateway/platforms/api_server.py`. Confirmed against a live gateway rather
 * than inferred — `/v1/responses` uses a different, OpenAI-shaped set
 * (`response.output_text.delta` and friends), so do not mix the two.
 */
export type RunEvent =
  | { event: "message.delta"; run_id: string; timestamp: number; delta: string }
  | { event: "reasoning.available"; run_id: string; timestamp: number; text: string }
  | {
      event: "tool.started";
      run_id: string;
      timestamp: number;
      tool: string;
      preview?: string;
    }
  | {
      event: "tool.completed";
      run_id: string;
      timestamp: number;
      tool: string;
      duration?: number;
    }
  | {
      event: "approval.request";
      run_id: string;
      timestamp: number;
      choices: string[];
      [extra: string]: unknown;
    }
  | { event: "approval.responded"; run_id: string; timestamp: number }
  | {
      event: "run.completed";
      run_id: string;
      timestamp: number;
      output?: string;
      usage?: { input_tokens: number; output_tokens: number; total_tokens: number };
    }
  | { event: "run.failed"; run_id: string; timestamp: number; error?: string }
  | { event: "run.cancelled"; run_id: string; timestamp: number };

export type RunEventName = RunEvent["event"];

/**
 * Incremental SSE parser.
 *
 * Written by hand rather than using EventSource because EventSource cannot set
 * headers and gives no way to abort cleanly mid-run, both of which this app
 * needs. Frames are separated by a blank line; a frame may carry several
 * `data:` lines, and the gateway also sends `:` comment lines as keepalives.
 */
export function createSseParser(onEvent: (e: RunEvent) => void) {
  let buffer = "";

  return function push(chunk: string): void {
    buffer += chunk;

    let sep: number;
    while ((sep = indexOfFrameEnd(buffer)) !== -1) {
      const frame = buffer.slice(0, sep);
      buffer = buffer.slice(sep).replace(/^(\r?\n){2}/, "");

      const data = frame
        .split(/\r?\n/)
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trim())
        .join("\n");

      if (!data) continue; // keepalive comment or a frame with no payload
      try {
        onEvent(JSON.parse(data) as RunEvent);
      } catch {
        // A truncated or non-JSON frame is not worth tearing the stream down.
      }
    }
  };
}

function indexOfFrameEnd(s: string): number {
  const lf = s.indexOf("\n\n");
  const crlf = s.indexOf("\r\n\r\n");
  if (lf === -1) return crlf;
  if (crlf === -1) return lf;
  return Math.min(lf, crlf);
}
