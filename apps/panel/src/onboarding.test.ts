import { describe, expect, it, vi } from "vitest";
import {
  OnboardingSession,
  guideTransport,
  type OnboardingResult,
  type GuideTransport,
} from "./onboarding";
import { guideSteps } from "./guideContent";
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const result = (completed = false): OnboardingResult => ({
  completed,
  version: 1,
});
const transport = (
  overrides: Partial<GuideTransport> = {},
): GuideTransport => ({
  load: vi.fn().mockResolvedValue(result()),
  complete: vi.fn().mockResolvedValue(result(true)),
  ...overrides,
});
describe("own-operator onboarding", () => {
  it("opens only after authenticated completion is known and operations allow it", async () => {
    const response = deferred<OnboardingResult>();
    const session = new OnboardingSession(
      transport({ load: () => response.promise }),
    );
    session.setAutomaticAllowed(true);
    expect(session.getSnapshot().open).toBe(false);
    const loading = session.setOperator("a");
    session.setAutomaticAllowed(true);
    expect(session.getSnapshot().open).toBe(false);
    response.resolve(result());
    await loading;
    expect(session.getSnapshot().open).toBe(true);
  });
  it("defers for existing incidents, and new alerts close without saving completion", async () => {
    const io = transport();
    const session = new OnboardingSession(io);
    await session.setOperator("a");
    expect(session.getSnapshot().open).toBe(false);
    session.setAutomaticAllowed(true);
    expect(session.getSnapshot().open).toBe(true);
    session.deferForOperations();
    expect(session.getSnapshot().open).toBe(false);
    expect(session.getSnapshot().completed).toBe(false);
    expect(io.complete).not.toHaveBeenCalled();
    session.setAutomaticAllowed(true);
    expect(session.getSnapshot().open).toBe(false);
    session.openManual();
    expect(session.getSnapshot().open).toBe(true);
  });
  it("does not show a completed guide on session restoration, but permits replay", async () => {
    const session = new OnboardingSession(
      transport({ load: async () => result(true) }),
    );
    await session.setOperator("a");
    session.setAutomaticAllowed(true);
    expect(session.getSnapshot().open).toBe(false);
    session.openManual();
    expect(session.getSnapshot().open).toBe(true);
  });
  it("ignores aborted reads from the previous operator and logout", async () => {
    const old = deferred<OnboardingResult>();
    let signal: AbortSignal | undefined;
    const io = transport({
      load: vi
        .fn()
        .mockImplementationOnce((s: AbortSignal) => {
          signal = s;
          return old.promise;
        })
        .mockResolvedValue(result(true)),
    });
    const session = new OnboardingSession(io);
    const first = session.setOperator("a");
    await session.setOperator("b");
    session.setAutomaticAllowed(true);
    old.resolve(result(false));
    await first;
    expect(signal?.aborted).toBe(true);
    expect(session.getSnapshot().operatorId).toBe("b");
    expect(session.getSnapshot().completed).toBe(true);
    expect(session.getSnapshot().open).toBe(false);
    await session.setOperator(null);
    session.openManual();
    expect(session.getSnapshot().open).toBe(false);
  });
  it("dismisses immediately for skip/finish and persists once with retry after failure", async () => {
    const pending = deferred<OnboardingResult>();
    const complete = vi
      .fn()
      .mockImplementationOnce(() => pending.promise)
      .mockResolvedValue(result(true));
    const session = new OnboardingSession(transport({ complete }));
    await session.setOperator("a");
    session.openManual();
    const saving = session.complete();
    expect(session.getSnapshot().open).toBe(false);
    expect(session.getSnapshot().status).toBe("saving");
    expect(session.getSnapshot().completed).toBe(false);
    pending.reject(new Error("Sem rede"));
    await saving;
    expect(session.getSnapshot().status).toBe("save-error");
    expect(session.getSnapshot().saved).toBe(false);
    await session.complete();
    expect(session.getSnapshot().completed).toBe(true);
    expect(session.getSnapshot().saved).toBe(true);
    expect(complete).toHaveBeenCalledTimes(2);
  });
  it("keeps replay dismissible while a completion write is pending without duplicating the write", async () => {
    const write = deferred<OnboardingResult>();
    const io = transport({ complete: vi.fn(() => write.promise) });
    const session = new OnboardingSession(io);
    await session.setOperator("a");
    const saving = session.complete();
    session.openManual();
    expect(session.getSnapshot().open).toBe(true);
    await session.complete();
    expect(session.getSnapshot().open).toBe(false);
    expect(io.complete).toHaveBeenCalledTimes(1);
    write.resolve(result(true));
    await saving;
    expect(session.getSnapshot().completed).toBe(true);
  });
  it("cannot apply a previous-account completion to a new account", async () => {
    const write = deferred<OnboardingResult>();
    const session = new OnboardingSession(
      transport({ complete: () => write.promise }),
    );
    await session.setOperator("a");
    const saving = session.complete();
    await session.setOperator("b");
    session.setAutomaticAllowed(true);
    write.resolve(result(true));
    await saving;
    expect(session.getSnapshot().operatorId).toBe("b");
    expect(session.getSnapshot().completed).toBe(false);
    expect(session.getSnapshot().open).toBe(true);
  });
  it("ignores a late GET that predates completion and preserves completion errors honestly", async () => {
    const read = deferred<OnboardingResult>();
    const session = new OnboardingSession(
      transport({
        load: () => read.promise,
        complete: async () => result(true),
      }),
    );
    const loading = session.setOperator("a");
    await session.complete();
    read.resolve(result(false));
    await loading;
    expect(session.getSnapshot().completed).toBe(true);
    expect(session.getSnapshot().open).toBe(false);
  });
  it("offers useful retry after read failure without falsely calling it completed", async () => {
    const io = transport({
      load: vi
        .fn()
        .mockRejectedValueOnce(new Error("Indisponível"))
        .mockResolvedValue(result()),
    });
    const session = new OnboardingSession(io);
    await session.setOperator("a");
    session.setAutomaticAllowed(true);
    expect(session.getSnapshot().status).toBe("load-error");
    expect(session.getSnapshot().completed).toBe(false);
    await session.reload();
    expect(session.getSnapshot().open).toBe(true);
  });
  it("uses only authenticated own-profile endpoints and the versioned completion body", async () => {
    const previous = globalThis.fetch;
    const fetch = vi
      .fn()
      .mockImplementation(
        async () => new Response(JSON.stringify(result(true))),
      );
    globalThis.fetch = fetch;
    try {
      await guideTransport.load(new AbortController().signal);
      await guideTransport.complete(new AbortController().signal);
      expect(fetch.mock.calls[0][0]).toBe("/api/me/onboarding");
      expect(fetch.mock.calls[1][0]).toBe("/api/me/onboarding");
      expect(fetch.mock.calls[1][1]).toMatchObject({
        method: "POST",
        credentials: "same-origin",
        body: '{"version":1}',
      });
      expect(fetch.mock.calls[1][1].body).not.toContain("operatorId");
    } finally {
      globalThis.fetch = previous;
    }
  });
});
describe("guide content respects permissions", () => {
  it("identifies consultation restrictions and never offers an operational action to observers", () => {
    const steps = guideSteps("observer");
    expect(steps.find((s) => s.id === "responsibility")?.description).toContain(
      "não altera ocorrências",
    );
    expect(steps.find((s) => s.id === "pairing")?.description).toContain(
      "perfis de operação e administração",
    );
    expect(
      guideSteps("dispatcher").find((s) => s.id === "responsibility")?.title,
    ).toBe("Assumir é tornar-se responsável.");
  });
  it("explains stale positions, delayed audio and the eight-digit consented pairing", () => {
    const text = JSON.stringify(guideSteps("admin"));
    for (const fragment of [
      "Posição antiga",
      "atraso ou lacunas",
      "oito dígitos",
      "dez minutos",
      "consentimentos",
      "não comprova",
    ])
      expect(text).toContain(fragment);
  });
});
