import { describe, expect, it } from "vitest";
import { EventParser } from "./events";
describe("SSE reception", () => {
  it("keeps partial records until their delimiter arrives", () => {
    const parser = new EventParser();
    expect(parser.push('event: change\ndata: {"seq":')).toEqual([]);
    expect(parser.push("7}\n")).toEqual([]);
    expect(parser.push("\n")).toEqual([{ event: "change", data: '{"seq":7}' }]);
  });
  it("accepts CRLF split across network chunks and ignores heartbeats", () => {
    const parser = new EventParser();
    expect(
      parser.push(': heartbeat\r\n\r\nevent: change\r\ndata: {"seq":8}\r'),
    ).toEqual([]);
    expect(parser.push("\n\r\n")).toEqual([
      { event: "change", data: '{"seq":8}' },
    ]);
  });
  it("processes multiple events, preserving multiline data", () => {
    const parser = new EventParser();
    expect(
      parser.push(
        "event: change\ndata: one\ndata: two\n\nevent: change\ndata: three\n\n",
      ),
    ).toEqual([
      { event: "change", data: "one\ntwo" },
      { event: "change", data: "three" },
    ]);
  });
});
