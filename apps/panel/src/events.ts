export interface StreamEvent {
  event: string;
  data: string;
}
/** Incremental SSE parser: records may span network chunks and use CRLF. */
export class EventParser {
  private buffer = "";
  push(chunk: string): StreamEvent[] {
    this.buffer += chunk;
    const events: StreamEvent[] = [];
    let match: RegExpExecArray | null;
    while ((match = /\r?\n\r?\n/.exec(this.buffer))) {
      const record = this.buffer.slice(0, match.index);
      this.buffer = this.buffer.slice(match.index + match[0].length);
      let event = "message";
      const data: string[] = [];
      for (const line of record.split(/\r?\n/)) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        if (line.startsWith("data:"))
          data.push(line.slice(5).replace(/^ /, ""));
      }
      if (data.length) events.push({ event, data: data.join("\n") });
    }
    return events;
  }
}
export async function streamEvents(
  signal: AbortSignal,
  onChange: () => void,
  onOpen: () => Promise<void>,
  onActivity: () => void,
) {
  const response = await fetch("/api/events", {
    credentials: "same-origin",
    cache: "no-store",
    headers: { Accept: "text/event-stream" },
    signal,
  });
  if (!response.ok)
    throw Object.assign(new Error("Conexão de eventos indisponível."), {
      status: response.status,
    });
  if (!response.body)
    throw new Error("Seu navegador não suporta atualização contínua.");
  await onOpen();
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const parser = new EventParser();
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) throw new Error("A conexão foi interrompida.");
      onActivity();
      for (const event of parser.push(decoder.decode(value, { stream: true })))
        if (event.event === "change") onChange();
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
