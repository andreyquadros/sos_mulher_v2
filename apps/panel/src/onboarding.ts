import { api, message } from "./api";

export interface OnboardingResult {
  completed: boolean;
  version: 1;
}
export interface GuideTransport {
  load: (signal: AbortSignal) => Promise<OnboardingResult>;
  complete: (signal: AbortSignal) => Promise<OnboardingResult>;
}
export type GuideStatus =
  "idle" | "loading" | "ready" | "saving" | "load-error" | "save-error";
export interface GuideState {
  operatorId: string | null;
  status: GuideStatus;
  completed: boolean;
  completionKnown: boolean;
  open: boolean;
  manual: boolean;
  deferred: boolean;
  step: number;
  error: string;
  saved: boolean;
}
const INITIAL: GuideState = {
  operatorId: null,
  status: "idle",
  completed: false,
  completionKnown: false,
  open: false,
  manual: false,
  deferred: false,
  step: 0,
  error: "",
  saved: false,
};
export const guideTransport: GuideTransport = {
  load: (signal) => api<OnboardingResult>("/me/onboarding", { signal }),
  complete: (signal) =>
    api<OnboardingResult>("/me/onboarding", {
      method: "POST",
      body: JSON.stringify({ version: 1 }),
      signal,
    }),
};
function validate(result: OnboardingResult) {
  if (result.version !== 1 || typeof result.completed !== "boolean")
    throw new Error(
      "A resposta do guia não pôde ser confirmada. Tente novamente.",
    );
  return result;
}

/** Own-account state only. A generation and abort signal isolate every login. */
export class OnboardingSession {
  private state: GuideState = { ...INITIAL };
  private listeners = new Set<() => void>();
  private generation = 0;
  private request = 0;
  private controller: AbortController | null = null;
  private automaticAllowed = false;
  private automaticAttempted = false;
  constructor(private transport: GuideTransport = guideTransport) {}
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  getSnapshot = () => this.state;
  private update(patch: Partial<GuideState>) {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }
  async setOperator(operatorId: string | null) {
    if (this.state.operatorId === operatorId) return;
    this.generation++;
    this.request++;
    this.controller?.abort();
    this.controller = null;
    this.automaticAllowed = false;
    this.automaticAttempted = false;
    this.state = { ...INITIAL, operatorId };
    for (const listener of this.listeners) listener();
    if (operatorId) await this.reload();
  }
  setAutomaticAllowed(allowed: boolean) {
    this.automaticAllowed = allowed;
    this.maybeOpen();
  }
  private maybeOpen() {
    if (
      this.state.operatorId &&
      this.state.completionKnown &&
      !this.state.completed &&
      this.automaticAllowed &&
      !this.automaticAttempted
    ) {
      this.automaticAttempted = true;
      this.update({ open: true, manual: false, step: 0, deferred: false });
    }
  }
  async reload() {
    if (!this.state.operatorId || this.state.status === "saving") return;
    const generation = this.generation;
    const request = ++this.request;
    this.controller?.abort();
    const controller = new AbortController();
    this.controller = controller;
    this.update({ status: "loading", error: "" });
    try {
      const result = validate(await this.transport.load(controller.signal));
      if (
        controller.signal.aborted ||
        generation !== this.generation ||
        request !== this.request
      )
        return;
      this.update({
        status: "ready",
        completed: result.completed,
        completionKnown: true,
        error: "",
        open: this.state.manual ? this.state.open : false,
      });
      this.maybeOpen();
    } catch (error) {
      if (
        controller.signal.aborted ||
        generation !== this.generation ||
        request !== this.request
      )
        return;
      this.update({ status: "load-error", error: message(error) });
    }
  }
  openManual() {
    if (!this.state.operatorId) return;
    this.automaticAttempted = true;
    this.update({ open: true, manual: true, step: 0, deferred: false });
  }
  setStep(step: number) {
    if (this.state.open) this.update({ step: Math.max(0, step) });
  }
  /** Emergency priority closes the guide without claiming it was completed. */
  deferForOperations() {
    if (!this.state.operatorId) return;
    this.automaticAttempted = true;
    this.update({
      open: false,
      deferred: !this.state.completed,
      manual: false,
    });
  }
  async complete() {
    if (!this.state.operatorId) return;
    if (this.state.status === "saving") {
      this.update({ open: false, manual: false });
      return;
    }
    this.automaticAttempted = true;
    const generation = this.generation;
    const request = ++this.request;
    this.controller?.abort();
    const controller = new AbortController();
    this.controller = controller;
    // Dismiss immediately: saving a preference must never hold up the operation.
    this.update({
      open: false,
      manual: false,
      status: "saving",
      error: "",
      saved: false,
    });
    try {
      const result = validate(await this.transport.complete(controller.signal));
      if (!result.completed)
        throw new Error(
          "A conclusão do guia ainda não foi registrada. Tente novamente.",
        );
      if (
        controller.signal.aborted ||
        generation !== this.generation ||
        request !== this.request
      )
        return;
      this.update({
        completed: true,
        completionKnown: true,
        status: "ready",
        error: "",
        deferred: false,
        saved: true,
      });
    } catch (error) {
      if (
        controller.signal.aborted ||
        generation !== this.generation ||
        request !== this.request
      )
        return;
      this.update({
        status: "save-error",
        error: message(error),
        saved: false,
      });
    }
  }
}
