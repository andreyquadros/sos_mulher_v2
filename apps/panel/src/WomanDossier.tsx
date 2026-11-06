import { useEffect, useState, type FormEvent } from "react";
import {
  ArrowRight,
  Download,
  FileText,
  MapPin,
  Paperclip,
  Pencil,
} from "lucide-react";
import { api, ApiError, dateTime, message } from "./api";
import type { DossierIncident, WomanAddress, WomanDossierData } from "./types";

const addressFields = [
  { key: "street", label: "Logradouro", maxLength: 160, required: true },
  { key: "number", label: "Número", maxLength: 24 },
  { key: "complement", label: "Complemento", maxLength: 120 },
  { key: "district", label: "Bairro", maxLength: 100 },
  { key: "city", label: "Município", maxLength: 100, required: true },
  { key: "state", label: "UF", maxLength: 2, required: true },
  { key: "postalCode", label: "CEP", maxLength: 9 },
  { key: "reference", label: "Ponto de referência", maxLength: 240 },
] as const;

const attachmentTypes = ["application/pdf", "image/jpeg", "image/png"];
const maxAttachmentSize = 5 * 1024 * 1024;
const statusLabels: Record<DossierIncident["status"], string> = {
  new: "Aberta",
  assigned: "Em atendimento",
  resolved: "Encerrada",
};
const triggerLabels: Record<string, string> = {
  hold: "Botão de proteção",
  volume: "Atalho de volume",
  notification: "Notificação",
  voice: "Palavra-chave",
};

export default function WomanDossier({
  womanId,
  canOpenIncident,
  onOpenIncident,
  onSessionExpired,
}: {
  womanId: string;
  canOpenIncident: (id: string) => boolean;
  onOpenIncident: (id: string) => void;
  onSessionExpired: () => void;
}) {
  const base = `/women/${encodeURIComponent(womanId)}`;
  const [data, setData] = useState<WomanDossierData | null>(null);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [historyBusy, setHistoryBusy] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [editing, setEditing] = useState(false);
  const [addressBusy, setAddressBusy] = useState(false);
  const [addressError, setAddressError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [attachmentError, setAttachmentError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setData(null);
    setError("");
    void api<WomanDossierData>(`${base}/dossier`, { signal: controller.signal })
      .then((result) => {
        if (!controller.signal.aborted) setData(result);
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        if (cause instanceof ApiError && cause.status === 401)
          onSessionExpired();
        else setError(message(cause));
      });
    return () => controller.abort();
  }, [base, reload, onSessionExpired]);

  function showError(cause: unknown, report: (text: string) => void) {
    if (cause instanceof ApiError && cause.status === 401) onSessionExpired();
    else report(message(cause));
  }

  async function loadOlder() {
    if (!data?.nextCursor || historyBusy) return;
    setHistoryBusy(true);
    setHistoryError("");
    try {
      const page = await api<WomanDossierData>(
        `${base}/dossier?cursor=${encodeURIComponent(data.nextCursor)}`,
      );
      setData((previous) => {
        if (!previous) return previous;
        const loaded = new Set(previous.incidents.map(({ id }) => id));
        return {
          ...previous,
          incidents: [
            ...previous.incidents,
            ...page.incidents.filter(({ id }) => !loaded.has(id)),
          ],
          nextCursor: page.nextCursor,
        };
      });
    } catch (cause) {
      showError(cause, setHistoryError);
    } finally {
      setHistoryBusy(false);
    }
  }

  async function saveAddress(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const field = (key: keyof WomanAddress) =>
      String(form.get(key) ?? "").trim();
    const address: WomanAddress = {
      street: field("street"),
      number: field("number"),
      complement: field("complement"),
      district: field("district"),
      city: field("city"),
      state: field("state").toUpperCase(),
      postalCode: field("postalCode"),
      reference: field("reference"),
    };
    setAddressBusy(true);
    setAddressError("");
    try {
      const saved = await api<{ address: WomanAddress | null }>(
        `${base}/address`,
        {
          method: "PUT",
          body: JSON.stringify({ address }),
        },
      );
      setData(
        (previous) => previous && { ...previous, address: saved.address },
      );
      setEditing(false);
    } catch (cause) {
      showError(cause, setAddressError);
    } finally {
      setAddressBusy(false);
    }
  }

  async function uploadAttachment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const file = new FormData(form).get("attachment");
    if (!(file instanceof File) || !file.size) {
      setAttachmentError("Selecione um arquivo para anexar.");
      return;
    }
    if (!attachmentTypes.includes(file.type) || file.size > maxAttachmentSize) {
      setAttachmentError("Selecione um PDF, JPG ou PNG de até 5 MB.");
      return;
    }
    setUploading(true);
    setAttachmentError("");
    try {
      const { attachment } = await api<{
        attachment: WomanDossierData["attachments"][number];
      }>(`${base}/attachments`, {
        method: "POST",
        headers: {
          "Content-Type": file.type,
          "X-File-Name": encodeURIComponent(file.name),
        },
        body: file,
      });
      setData(
        (previous) =>
          previous && {
            ...previous,
            attachments: [
              attachment,
              ...previous.attachments.filter(({ id }) => id !== attachment.id),
            ],
          },
      );
      form.reset();
    } catch (cause) {
      showError(cause, setAttachmentError);
    } finally {
      setUploading(false);
    }
  }

  if (!data) {
    return error ? (
      <div>
        <p className="inline-error" role="alert">
          {error}
        </p>
        <button
          className="button secondary"
          onClick={() => setReload((value) => value + 1)}
        >
          Tentar novamente
        </button>
      </div>
    ) : (
      <p className="muted" role="status">
        Carregando a ficha…
      </p>
    );
  }

  return (
    <div className="dossier-content">
      <section className="dossier-section" aria-label="Dados da assistida">
        <dl className="dossier-fields">
          <div>
            <dt>Nome completo</dt>
            <dd>{data.woman.name}</dd>
          </div>
          <div>
            <dt>Telefone</dt>
            <dd>{data.woman.phone}</dd>
          </div>
          <div>
            <dt>Referência interna</dt>
            <dd>{data.woman.reference}</dd>
          </div>
          <div>
            <dt>Cadastrada em</dt>
            <dd>{dateTime(data.woman.createdAt)}</dd>
          </div>
        </dl>
        {data.woman.notes && (
          <p className="dossier-notes">{data.woman.notes}</p>
        )}
      </section>
      <section className="dossier-section" aria-labelledby="dossier-address">
        <div className="dossier-heading">
          <h3 id="dossier-address">
            <MapPin size={17} /> Endereço
          </h3>
          {!editing && (
            <button
              className="button secondary small"
              onClick={() => setEditing(true)}
            >
              <Pencil size={14} />{" "}
              {data.address ? "Editar endereço" : "Adicionar endereço"}
            </button>
          )}
        </div>
        {editing ? (
          <form className="dossier-address-form" onSubmit={saveAddress}>
            <div className="form-columns">
              {addressFields.map((field) => (
                <label key={field.key}>
                  {field.label}
                  <input
                    name={field.key}
                    defaultValue={data.address?.[field.key]}
                    maxLength={field.maxLength}
                    required={"required" in field && field.required}
                    disabled={addressBusy}
                    autoComplete="off"
                  />
                </label>
              ))}
            </div>
            <div className="dossier-actions">
              <button
                type="button"
                className="button secondary small"
                disabled={addressBusy}
                onClick={() => {
                  setEditing(false);
                  setAddressError("");
                }}
              >
                Cancelar edição
              </button>
              <button className="button primary small" disabled={addressBusy}>
                {addressBusy ? "Salvando…" : "Salvar endereço"}
              </button>
            </div>
          </form>
        ) : data.address ? (
          <dl className="dossier-fields">
            {addressFields
              .filter(({ key }) => data.address?.[key])
              .map(({ key, label }) => (
                <div key={key}>
                  <dt>{label}</dt>
                  <dd>{data.address?.[key]}</dd>
                </div>
              ))}
          </dl>
        ) : (
          <p className="muted">Endereço ainda não informado.</p>
        )}
        {addressError && (
          <p className="inline-error" role="alert">
            {addressError}
          </p>
        )}
      </section>
      <section className="dossier-section" aria-labelledby="dossier-history">
        <div className="dossier-heading">
          <h3 id="dossier-history">
            <FileText size={17} /> Histórico de ocorrências
          </h3>
        </div>
        {data.incidents.length ? (
          <ul className="dossier-list">
            {data.incidents.map((incident) => (
              <li key={incident.id}>
                <div className="dossier-heading">
                  <div>
                    <strong>{incident.code}</strong>
                    {incident.simulated && (
                      <small className="simulation-label">SIMULADO</small>
                    )}
                  </div>
                  <span className="muted">
                    {incident.status === "new" && incident.acknowledgedAt
                      ? "Reconhecida"
                      : statusLabels[incident.status]}
                  </span>
                </div>
                <dl className="dossier-fields">
                  <div>
                    <dt>Recebida em</dt>
                    <dd>{dateTime(incident.receivedAt)}</dd>
                  </div>
                  <div>
                    <dt>Acionamento</dt>
                    <dd>
                      {triggerLabels[incident.trigger] ?? incident.trigger}
                    </dd>
                  </div>
                  {incident.acknowledgedAt && (
                    <div>
                      <dt>Reconhecida em</dt>
                      <dd>{dateTime(incident.acknowledgedAt)}</dd>
                    </div>
                  )}
                  {incident.assignedName && (
                    <div>
                      <dt>Responsável</dt>
                      <dd>{incident.assignedName}</dd>
                    </div>
                  )}
                  {incident.resolvedAt && (
                    <div>
                      <dt>Encerrada em</dt>
                      <dd>{dateTime(incident.resolvedAt)}</dd>
                    </div>
                  )}
                </dl>
                {incident.resolution && (
                  <p className="dossier-notes">{incident.resolution}</p>
                )}
                {canOpenIncident(incident.id) && (
                  <button
                    className="button secondary small"
                    onClick={() => onOpenIncident(incident.id)}
                  >
                    Abrir ocorrência <ArrowRight size={14} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">
            Nenhuma ocorrência registrada para esta assistida.
          </p>
        )}
        {data.nextCursor && (
          <button
            className="button secondary small"
            disabled={historyBusy}
            onClick={() => void loadOlder()}
          >
            {historyBusy ? "Carregando…" : "Carregar ocorrências anteriores"}
          </button>
        )}
        {historyError && (
          <p className="inline-error" role="alert">
            {historyError}
          </p>
        )}
      </section>
      <section
        className="dossier-section"
        aria-labelledby="dossier-attachments"
      >
        <div className="dossier-heading">
          <h3 id="dossier-attachments">
            <Paperclip size={17} /> Anexos
          </h3>
        </div>
        {data.attachments.length ? (
          <ul className="dossier-list">
            {data.attachments.map((attachment) => (
              <li className="dossier-attachment" key={attachment.id}>
                <div>
                  <strong>{attachment.name}</strong>
                  <small className="muted">
                    {dateTime(attachment.createdAt)} · {attachment.uploadedBy}
                  </small>
                </div>
                <a
                  className="button secondary small"
                  href={`/api${base}/attachments/${encodeURIComponent(attachment.id)}`}
                  download
                >
                  <Download size={14} /> Baixar
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">Nenhum anexo na ficha.</p>
        )}
        <form className="dossier-upload" onSubmit={uploadAttachment}>
          <label>
            Adicionar anexo
            <input
              type="file"
              name="attachment"
              accept={attachmentTypes.join(",")}
              required
              disabled={uploading}
            />
            <small className="muted">PDF, JPG ou PNG de até 5 MB.</small>
          </label>
          <button className="button primary small" disabled={uploading}>
            {uploading ? "Enviando…" : "Anexar arquivo"}
          </button>
        </form>
        {attachmentError && (
          <p className="inline-error" role="alert">
            {attachmentError}
          </p>
        )}
      </section>
    </div>
  );
}
