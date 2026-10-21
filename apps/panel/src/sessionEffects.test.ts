import { describe, expect, it, vi } from "vitest";
import { NavigationFocus, NotificationSession } from "./sessionEffects";
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const handlers = () => ({
  granted: vi.fn(),
  blocked: vi.fn(),
  failed: vi.fn(),
});
describe("notification permission belongs to its requesting session", () => {
  it("applies permission only after a grant from the current operator", async () => {
    const scope = new NotificationSession();
    const reply = deferred<NotificationPermission>();
    const result = handlers();
    scope.setOperator("a");
    const pending = scope.request("a", () => reply.promise, result);
    expect(result.granted).not.toHaveBeenCalled();
    reply.resolve("granted");
    await pending;
    expect(result.granted).toHaveBeenCalledTimes(1);
    expect(result.blocked).not.toHaveBeenCalled();
  });
  it("ignores a late grant after logout and another operator signs in", async () => {
    const scope = new NotificationSession();
    const reply = deferred<NotificationPermission>();
    const result = handlers();
    scope.setOperator("a");
    const pending = scope.request("a", () => reply.promise, result);
    scope.invalidate(); // logout starts before its HTTP response arrives
    scope.setOperator(null);
    scope.setOperator("b");
    reply.resolve("granted");
    await pending;
    expect(result.granted).not.toHaveBeenCalled();
    expect(result.blocked).not.toHaveBeenCalled();
    expect(result.failed).not.toHaveBeenCalled();
  });
  it("invalidates an expired prompt even if the same operator signs in again", async () => {
    const scope = new NotificationSession();
    const reply = deferred<NotificationPermission>();
    const result = handlers();
    scope.setOperator("a");
    const pending = scope.request("a", () => reply.promise, result);
    scope.invalidate();
    scope.setOperator(null);
    scope.setOperator("a");
    reply.resolve("granted");
    await pending;
    expect(result.granted).not.toHaveBeenCalled();
  });
  it("ignores stale denied/error callbacks and an old-account handler", async () => {
    for (const outcome of ["denied", "error"] as const) {
      const scope = new NotificationSession();
      const reply = deferred<NotificationPermission>();
      const result = handlers();
      scope.setOperator("a");
      const pending = scope.request("a", () => reply.promise, result);
      scope.invalidate();
      if (outcome === "error") reply.reject(new Error("Prompt closed"));
      else reply.resolve("denied");
      await pending;
      expect(result.blocked).not.toHaveBeenCalled();
      expect(result.failed).not.toHaveBeenCalled();
      scope.setOperator("b");
      const request = vi.fn().mockResolvedValue("granted");
      await scope.request("a", request, result);
      expect(request).not.toHaveBeenCalled();
    }
  });
});
describe("guide return focus follows committed navigation", () => {
  it("does not focus the old Assistidas heading, then focuses the committed Central heading once", () => {
    const navigation = new NavigationFocus();
    const oldHeading = { focus: vi.fn() };
    const centralHeading = { focus: vi.fn() };
    navigation.request("a", "central");
    navigation.commit("a", "women", oldHeading);
    expect(oldHeading.focus).not.toHaveBeenCalled();
    navigation.commit("a", "central", centralHeading);
    expect(centralHeading.focus).toHaveBeenCalledWith({ preventScroll: true });
    navigation.commit("a", "central", centralHeading);
    expect(centralHeading.focus).toHaveBeenCalledTimes(1);
  });
  it("supports an already-current destination and drops requests across operator changes", () => {
    const navigation = new NavigationFocus();
    const heading = { focus: vi.fn() };
    navigation.request("a", "central");
    navigation.commit("a", "central", heading);
    expect(heading.focus).toHaveBeenCalledTimes(1);
    navigation.request("a", "central");
    navigation.commit("b", "central", heading);
    navigation.commit("a", "central", heading);
    expect(heading.focus).toHaveBeenCalledTimes(1);
  });
});
