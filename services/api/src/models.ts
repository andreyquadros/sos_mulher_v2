export type Role = 'admin' | 'dispatcher' | 'observer';
export interface Operator {
  id: string;
  name: string;
  email: string;
  agencyId: string;
  role: Role;
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
  status: 'new' | 'assigned' | 'resolved';
  simulated: boolean;
  trigger: 'hold' | 'volume' | 'notification';
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
export interface AuditEvent {
  id: string;
  action: string;
  actorName: string;
  incidentId: string | null;
  createdAt: string;
  detail: string;
}
export interface AudioChunk {
  id: string;
  sequence: number;
  capturedAt: string;
  receivedAt: string;
  mimeType: string;
  url: string;
}
export interface Device {
  id: string;
  womanId: string;
  womanName: string;
  agencyId: string;
  consentAudio: boolean;
}
export interface ChangeEvent {
  seq: number;
  kind: string;
  incidentId?: string;
}
