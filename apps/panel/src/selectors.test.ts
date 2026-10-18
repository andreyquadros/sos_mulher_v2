import { describe, expect, it } from "vitest";
import { mergeSnapshot, oldestUnassigned, notifiableAlerts } from "./selectors";
import type { Incident, Snapshot } from "./types";
const incident = (id: string, overrides: Partial<Incident> = {}): Incident => ({
  id,
  code: id,
  womanId: id,
  womanName: "Pessoa fictícia",
  status: "new",
  simulated: true,
  trigger: "hold",
  createdAt: "2026-10-18T10:00:00Z",
  receivedAt: "2026-10-18T10:00:01Z",
  acknowledgedAt: null,
  assignedTo: null,
  assignedName: null,
  resolvedAt: null,
  revision: 1,
  lastLocation: null,
  audioCount: 0,
  ...overrides,
});
const snapshot = (incidents: Incident[]): Snapshot => ({
  incidents,
  women: [],
  audit: [],
  serverTime: "2026-10-18T11:00:00Z",
});
describe("operational queue consistency", () => {
  it("keeps the oldest unassigned case even after human acknowledgement changes queue priority", () => {
    const recent = incident("recent", { createdAt: "2026-10-18T10:10:00Z" });
    const oldest = incident("oldest", {
      acknowledgedAt: "2026-10-18T10:09:00Z",
    });
    expect(oldestUnassigned([recent, oldest])?.id).toBe("oldest");
    expect(
      oldestUnassigned([
        recent,
        { ...oldest, assignedTo: "operator", status: "assigned" },
      ])?.id,
    ).toBe("recent");
  });
  it("re-alerts when an existing simulation becomes a real emergency", () => {
    const previous = new Map([
      ["simulation", true],
      ["real", false],
    ]);
    const promoted = incident("simulation", {
      simulated: false,
      acknowledgedAt: null,
      status: "assigned",
      assignedTo: "operator",
      revision: 5,
    });
    expect(
      notifiableAlerts(previous, [
        promoted,
        incident("real", { simulated: false }),
      ]).map((i) => i.id),
    ).toEqual(["simulation"]);
    expect(
      notifiableAlerts(new Map([["simulation", false]]), [promoted]),
    ).toEqual([]);
    expect(
      notifiableAlerts(previous, [
        { ...promoted, acknowledgedAt: "2026-10-18T11:00:00Z" },
      ]),
    ).toEqual([]);
  });
  it("never rolls an accepted claim back when an older snapshot arrives", () => {
    const confirmed = incident("one", {
      status: "assigned",
      assignedTo: "operator",
      revision: 3,
    });
    const merged = mergeSnapshot(
      snapshot([confirmed]),
      snapshot([incident("one", { revision: 2 })]),
    );
    expect(merged.incidents[0].assignedTo).toBe("operator");
    expect(merged.incidents[0].revision).toBe(3);
    expect(
      mergeSnapshot(
        merged,
        snapshot([incident("one", { revision: 4, status: "resolved" })]),
      ).incidents[0].status,
    ).toBe("resolved");
  });
});
