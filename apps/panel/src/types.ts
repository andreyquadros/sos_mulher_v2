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
export interface WomanAddress {
  street: string;
  number: string;
  complement: string;
  district: string;
  city: string;
  state: string;
  postalCode: string;
  reference: string;
}
export interface WomanAttachment {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  createdAt: string;
  uploadedBy: string;
}
export type DossierIncident = Pick<
  Incident,
  | "id"
  | "code"
  | "status"
  | "simulated"
  | "trigger"
  | "createdAt"
  | "receivedAt"
  | "acknowledgedAt"
  | "assignedName"
  | "resolvedAt"
> & { resolution: string | null };
export interface WomanDossierData {
  woman: Woman;
  address: WomanAddress | null;
  incidents: DossierIncident[];
  nextCursor: string | null;
  attachments: WomanAttachment[];
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
