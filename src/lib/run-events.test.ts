import { describe, expect, it, vi } from "vitest";
import { createSseParser, type RunEvent } from "./run-events";

function collect() {
  const seen: RunEvent[] = [];
  return { seen, push: createSseParser((e) => seen.push(e)) };
}

describe("createSseParser", () => {
  it("emits one event per complete frame", () => {
    const { seen, push } = collect();
    push('data: {"event":"message.delta","run_id":"r","timestamp":1,"delta":"안녕"}\n\n');
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ event: "message.delta", delta: "안녕" });
  });

  it("waits for the frame terminator before emitting", () => {
    const { seen, push } = collect();
    push('data: {"event":"message.delta","run_id":"r",');
    expect(seen).toHaveLength(0);
    push('"timestamp":1,"delta":"ok"}\n\n');
    expect(seen).toHaveLength(1);
  });

  it("handles several frames arriving in one chunk", () => {
    const { seen, push } = collect();
    push(
      'data: {"event":"tool.started","run_id":"r","timestamp":1,"tool":"web"}\n\n' +
        'data: {"event":"tool.completed","run_id":"r","timestamp":2,"tool":"web"}\n\n',
    );
    expect(seen.map((e) => e.event)).toEqual(["tool.started", "tool.completed"]);
  });

  it("ignores keepalive comment frames", () => {
    const { seen, push } = collect();
    push(": stream closed\n\n");
    expect(seen).toHaveLength(0);
  });

  it("survives a malformed frame and keeps parsing the next one", () => {
    const { seen, push } = collect();
    push("data: {not json}\n\n");
    push('data: {"event":"run.completed","run_id":"r","timestamp":3,"output":"done"}\n\n');
    expect(seen.map((e) => e.event)).toEqual(["run.completed"]);
  });

  it("accepts CRLF frame terminators", () => {
    const { seen, push } = collect();
    push('data: {"event":"run.cancelled","run_id":"r","timestamp":4}\r\n\r\n');
    expect(seen).toHaveLength(1);
  });
});
