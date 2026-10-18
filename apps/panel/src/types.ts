export interface Operator {
  id: string;
  name: string;
  email: string;
  agencyId: string;
  role: string;
}
export interface Woman {
  id: string;
  name: string;
  phone: string;
  reference: string;
  notes: string;
  agencyId: string;
  createdAt: string;
}
export interface LocationPoint {
  sequence: number;
  latitude: number;
  longitude: number;
  accuracy: number;
  capturedAt: string;
  receivedAt: string;
  battery?: number;
}
export interface Incident {
  id: string;
  code: string;
  womanId: string;
  womanName: string;
  status: "new" | "assigned" | "resolved";
  simulated: boolean;
  trigger: string;
  createdAt: string;
  receivedAt: string;
  acknowledgedAt: string | null;
  assignedTo: string | null;
  assignedName: string | null;
  resolvedAt: string | null;
  revision: number;
  lastLocation: LocationPoint | null;
  audioCount: number;
}
export interface AudioChunk {
  id: string;
  sequence: number;
  capturedAt: string;
  receivedAt: string;
  mimeType: string;
  url: string;
}
export interface AuditEvent {
  id: string;
  action: string;
  actorName: string;
  incidentId: string | null;
  createdAt: string;
  detail: string;
}
export interface Snapshot {
  incidents: Incident[];
  women: Woman[];
  audit: AuditEvent[];
  serverTime: string;
}
export type Connection = "connecting" | "connected" | "reconnecting";
