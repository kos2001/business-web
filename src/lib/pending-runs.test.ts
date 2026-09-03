import { beforeEach, describe, expect, it } from "vitest";
import {
  _reset,
  claimForStart,
  isKnown,
  replay,
  reserve,
  startRecording,
} from "./pending-runs";

const enc = new TextEncoder();

/** A backend stream that emits the given chunks and then ends. */
function sourceOf(...chunks: string[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(c) {
      for (const chunk of chunks) c.enqueue(enc.encode(chunk));
      c.close();
    },
  });
}

/** A backend stream the test closes by hand, to model a run still going. */
function openSource() {
  let ctrl!: ReadableStreamDefaultController<Uint8Array>;
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      ctrl = c;
    },
  });
  return {
    stream,
    emit: (s: string) => ctrl.enqueue(enc.encode(s)),
    end: () => ctrl.close(),
  };
}

async function readAll(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const dec = new TextDecoder();
  let out = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    out += dec.decode(value, { stream: true });
  }
  return out;
}

/** Lets the detached recording pump make progress. */
const settle = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => _reset());

describe("claimForStart", () => {
  it("hands the reserved prompt to the first caller", () => {
    reserve("r1", { prompt: "질문", sessionId: "s1", kind: "chat" });
    expect(claimForStart("r1")).toMatchObject({
      prompt: "질문",
      sessionId: "s1",
    });
  });

  it("starts a run only once, so a second attach cannot re-run the pipeline", () => {
    // The reason this is single-use: marketing-agent's diagnosis takes minutes
    // and costs real money per run. A refresh must not buy another one.
    reserve("r2", { prompt: "질문", kind: "chat" });
    expect(claimForStart("r2")).toBeDefined();
    expect(claimForStart("r2")).toBeUndefined();
  });

  it("returns undefined for a run it never saw", () => {
    expect(claimForStart("never-reserved")).toBeUndefined();
  });

  it("carries the job kind so the events route knows which pipeline to run", () => {
    reserve("r3", { prompt: "2026-09 1주차", kind: "report" });
    expect(claimForStart("r3")?.kind).toBe("report");
  });
});

describe("isKnown", () => {
  it("separates a started run from one that never existed", () => {
    // This is what the route uses to tell a replay from a real 404.
    reserve("r4", { prompt: "질문", kind: "chat" });
    claimForStart("r4");
    expect(isKnown("r4")).toBe(true);
    expect(isKnown("nope")).toBe(false);
  });
});

describe("replay", () => {
  it("gives the first reader the whole stream", async () => {
    reserve("r5", { prompt: "질문", kind: "chat" });
    claimForStart("r5");
    startRecording("r5", sourceOf("a", "b", "c"));
    expect(await readAll(replay("r5")!)).toBe("abc");
  });

  it("replays a finished run to a reader that arrives late", async () => {
    // The refresh case: the tab reloads after the answer already streamed.
    reserve("r6", { prompt: "질문", kind: "chat" });
    claimForStart("r6");
    startRecording("r6", sourceOf("hello ", "world"));
    await readAll(replay("r6")!);

    expect(await readAll(replay("r6")!)).toBe("hello world");
  });

  it("gives a mid-run reader the frames so far and then the live tail", async () => {
    // The StrictMode case, and a refresh while the pipeline is still going.
    reserve("r7", { prompt: "질문", kind: "diagnose" });
    claimForStart("r7");
    const src = openSource();
    startRecording("r7", src.stream);

    src.emit("part1 ");
    await settle();

    const second = readAll(replay("r7")!);
    src.emit("part2");
    await settle();
    src.end();

    expect(await second).toBe("part1 part2");
  });

  it("keeps recording after a reader detaches", async () => {
    // A closed tab must not kill the run — the recorder is not tied to the
    // client's request signal.
    reserve("r8", { prompt: "질문", kind: "report" });
    claimForStart("r8");
    const src = openSource();
    startRecording("r8", src.stream);

    const ac = new AbortController();
    const abandoned = replay("r8", ac.signal)!;
    void readAll(abandoned);
    src.emit("early ");
    await settle();
    ac.abort();

    src.emit("late");
    await settle();
    src.end();
    await settle();

    expect(await readAll(replay("r8")!)).toBe("early late");
  });

  it("returns undefined for an unknown run", () => {
    expect(replay("nope")).toBeUndefined();
  });
});
