import type { Incident, Snapshot } from "./types";
export function oldestUnassigned(incidents: Incident[]) {
  return incidents
    .filter((i) => i.status !== "resolved" && !i.assignedTo)
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))[0];
}
/** A delayed snapshot cannot roll back a mutation already confirmed by the API. */
export function mergeSnapshot(current: Snapshot, incoming: Snapshot): Snapshot {
  const revisions = new Map(current.incidents.map((i) => [i.id, i]));
  return {
    ...incoming,
    incidents: incoming.incidents.map((i) => {
      const previous = revisions.get(i.id);
      return previous && previous.revision > i.revision ? previous : i;
    }),
  };
}

/** A real emergency must alert again even when it reuses a simulated incident ID. */
export function notifiableAlerts(
  previous: Map<string, boolean>,
  incidents: Incident[],
): Incident[] {
  return incidents.filter(
    (i) =>
      i.status !== "resolved" &&
      !i.acknowledgedAt &&
      (!previous.has(i.id) || (previous.get(i.id) === true && !i.simulated)),
  );
}
