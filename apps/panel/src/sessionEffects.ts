/** Browser permission prompts cannot be cancelled. Their results belong only to
 * the authenticated session that requested them, even across a same-user login.
 */
export class NotificationSession {
  private operatorId: string | null = null;
  private generation = 0;
  setOperator(operatorId: string | null) {
    if (this.operatorId === operatorId) return;
    this.operatorId = operatorId;
    this.invalidate();
  }
  invalidate() {
    this.generation++;
  }
  async request(
    operatorId: string,
    requestPermission: () => Promise<NotificationPermission>,
    handlers: { granted: () => void; blocked: () => void; failed: () => void },
  ) {
    if (this.operatorId !== operatorId) return;
    const generation = this.generation;
    const current = () =>
      this.operatorId === operatorId && this.generation === generation;
    try {
      const permission = await requestPermission();
      if (!current()) return;
      if (permission === "granted") handlers.granted();
      else handlers.blocked();
    } catch {
      if (current()) handlers.failed();
    }
  }
}

/** Consume navigation focus only after React has committed the destination. */
export class NavigationFocus {
  private pending: { operatorId: string; page: string } | null = null;
  request(operatorId: string, page: string) {
    this.pending = { operatorId, page };
  }
  commit(
    operatorId: string | null,
    page: string,
    target: { focus: (options?: FocusOptions) => void } | null,
  ) {
    if (!this.pending) return;
    if (this.pending.operatorId !== operatorId) {
      this.pending = null;
      return;
    }
    if (this.pending.page !== page || !target) return;
    this.pending = null;
    target.focus({ preventScroll: true });
  }
}
