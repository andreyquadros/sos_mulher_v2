import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  Activity,
  ArrowRight,
  Bell,
  BellOff,
  Check,
  CheckCheck,
  ChevronRight,
  Clock3,
  Copy,
  FileCheck2,
  History,
  Info,
  LayoutGrid,
  Link2,
  LoaderCircle,
  LogOut,
  MapPin,
  Plus,
  Radio,
  RefreshCw,
  Search,
  Shield,
  ShieldCheck,
  TriangleAlert,
  UserCheck,
  Users,
  Volume2,
  VolumeX,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import {
  age,
  api,
  ApiError,
  clock,
  dateTime,
  duration,
  message,
  post,
} from "./api";
import { streamEvents } from "./events";
import { mergeSnapshot, oldestUnassigned, notifiableAlerts } from "./selectors";
import type {
  AudioChunk,
  Connection,
  Incident,
  LocationPoint,
  Operator,
  Snapshot,
  Woman,
} from "./types";
import MapView from "./MapView";
import AudioPanel from "./AudioPanel";
import MotionSignal from "./MotionSignal";

type Page = "central" | "incidents" | "women" | "audit";
const EMPTY: Snapshot = {
  incidents: [],
  women: [],
  audit: [],
  serverTime: new Date().toISOString(),
};
const roleLabel: Record<string, string> = {
  admin: "Administração",
  dispatcher: "Operação",
  viewer: "Consulta",
  operator: "Operação",
};
const actionLabel: Record<string, string> = {
  "incident.created": "Alerta recebido",
  "incident.escalated": "Simulado promovido a alerta real",
  "incident.acknowledged": "Alerta reconhecido",
  "incident.claimed": "Ocorrência assumida",
  "incident.resolved": "Ocorrência encerrada",
  "woman.created": "Assistida cadastrada",
  "pairing.created": "Vínculo gerado",
  "device.paired": "Dispositivo vinculado",
  "audio.accessed": "Áudio acessado",
  "auth.login": "Sessão iniciada",
  "auth.logout": "Sessão encerrada",
  "location.received": "Localização recebida",
  "audio.received": "Áudio recebido",
};
const titles: Record<Page, [string, string]> = {
  central: ["VISÃO OPERACIONAL", "Central de operações"],
  incidents: ["GESTÃO DO ATENDIMENTO", "Ocorrências"],
  women: ["REDE DE PROTEÇÃO", "Assistidas"],
  audit: ["RASTREABILIDADE", "Auditoria"],
};
function initial(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .map((x) => x[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}
function statusLabel(i: Incident) {
  return i.status === "resolved"
    ? "Encerrada"
    : i.status === "assigned"
      ? "Em atendimento"
      : i.acknowledgedAt
        ? "Reconhecida"
        : "Novo alerta";
}
function Badge({ incident }: { incident: Incident }) {
  return (
    <span
      className={`badge ${incident.status === "resolved" ? "neutral" : incident.status === "assigned" ? "blue" : incident.acknowledgedAt ? "gold" : "pink"}`}
    >
      <span />
      {statusLabel(incident)}
    </span>
  );
}
function Modal({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
    return () => dialog.current?.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === dialog.current) onClose();
      }}
      className="modal"
    >
      <div className="modal-head">
        <div>
          <span className="eyebrow">SOS MULHER</span>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        <button
          className="icon-button"
          onClick={onClose}
          aria-label="Fechar janela"
        >
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
function Login({
  onLogin,
  initialError,
}: {
  onLogin: (operator: Operator) => void;
  initialError: string;
}) {
  const [error, setError] = useState(initialError);
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { operator } = await post<{ operator: Operator }>("/auth/login", {
        email,
        password,
      });
      onLogin(operator);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="login-screen">
      <div className="login-story">
        <div className="brand">
          <img src="/brand/symbol-v2.png" alt="" />
          <span>
            SOS <b>Mulher</b>
          </span>
        </div>
        <div className="login-statement">
          <span className="eyebrow">
            <span className="status-dot" /> REDE INTEGRADA DE PROTEÇÃO
          </span>
          <h1>
            Presença que
            <br />
            acolhe.
            <br />
            <em>
              Resposta que
              <br />
              protege.
            </em>
          </h1>
          <p>
            Tecnologia a serviço do cuidado.
            <br />
            Uma rede conectada por cada mulher.
          </p>
        </div>
        <div className="login-location">
          <MapPin size={16} /> Ariquemes, Rondônia <span>BRASIL</span>
        </div>
      </div>
      <main className="login-form-area">
        <div className="login-form">
          <div className="secure-symbol">
            <ShieldCheck size={28} />
          </div>
          <span className="eyebrow">ACESSO INSTITUCIONAL</span>
          <h2>Central de operações</h2>
          <p className="login-description">
            Entre com sua conta para acompanhar alertas e coordenar o
            atendimento.
          </p>
          <form onSubmit={submit}>
            <label>
              E-mail institucional
              <input
                autoComplete="username"
                type="email"
                name="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu.nome@instituicao.gov.br"
                required
              />
            </label>
            <label>
              Senha
              <input
                type="password"
                autoComplete="current-password"
                name="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Informe sua senha"
                required
              />
            </label>
            {error && (
              <div className="form-error" role="alert">
                <TriangleAlert size={16} />
                {error}
              </div>
            )}
            <button className="button primary full" disabled={busy}>
              {busy ? (
                <LoaderCircle className="spin" size={18} />
              ) : (
                <>
                  Acessar central <ArrowRight size={18} />
                </>
              )}
            </button>
          </form>
          {import.meta.env.VITE_DEMO_MODE === "true" && (
            <div className="demo-login">
              <span className="badge gold">AMBIENTE DE DEMONSTRAÇÃO</span>
              <p>Dados fictícios · sem despacho de equipes.</p>
              <p>
                <strong>demo@mulher.ro.gov.br</strong>
                <br />
                Senha: <strong>Lume-Demo-2026!</strong>
              </p>
            </div>
          )}
          <div className="login-security">
            <Shield size={15} />
            <span>
              Acesso restrito e auditado.
              <br />
              As informações são protegidas por agência.
            </span>
          </div>
        </div>
        <footer>PROTEÇÃO · ACOLHIMENTO · RESPOSTA</footer>
      </main>
    </div>
  );
}

export default function App() {
  const [operator, setOperator] = useState<Operator | null>(null);
  const [boot, setBoot] = useState(true);
  const [sessionMessage, setSessionMessage] = useState("");
  const [page, setPage] = useState<Page>("central");
  const [snapshot, setSnapshot] = useState<Snapshot>(EMPTY);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [connection, setConnection] = useState<Connection>("connecting");
  const [snapshotError, setSnapshotError] = useState("");
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const serverOffset = useRef(0);
  const [resourceOwner, setResourceOwner] = useState<string | null>(null);
  const [trail, setTrail] = useState<LocationPoint[]>([]);
  const [chunks, setChunks] = useState<AudioChunk[]>([]);
  const [resourceError, setResourceError] = useState("");
  const [resourceLoading, setResourceLoading] = useState(false);
  const [toast, setToast] = useState<{ text: string; error?: boolean } | null>(
    null,
  );
  const [actionBusy, setActionBusy] = useState(false);
  const [resolveOpen, setResolveOpen] = useState(false);
  const [resolution, setResolution] = useState("");
  const [resolveError, setResolveError] = useState("");
  const [womanOpen, setWomanOpen] = useState(false);
  const [pairing, setPairing] = useState<{
    woman: Woman;
    code: string;
    expiresAt: string;
  } | null>(null);
  const [sound, setSound] = useState(false);
  const [notifications, setNotifications] = useState(false);
  const [search, setSearch] = useState("");
  const [incidentFilter, setIncidentFilter] = useState("open");
  const [resourceRetry, setResourceRetry] = useState(0);
  const [receiptMotions, setReceiptMotions] = useState<Record<string, number>>(
    {},
  );
  const soundContext = useRef<AudioContext | null>(null);
  const knownIncidents = useRef<Map<string, boolean> | null>(null);
  const showToast = useCallback(
    (text: string, error = false) => setToast({ text, error }),
    [],
  );
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 6500);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    const timer = setInterval(
      () => setNow(Date.now() + serverOffset.current),
      1000,
    );
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    api<{ operator: Operator }>("/auth/me", { signal: controller.signal })
      .then((x) => setOperator(x.operator))
      .catch((e) => {
        if (
          e.name !== "AbortError" &&
          !(e instanceof ApiError && e.status === 401)
        )
          setSessionMessage(
            "Não foi possível conectar à central. Confira a disponibilidade do servidor.",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setBoot(false);
      });
    return () => controller.abort();
  }, []);
  const expire = useCallback(() => {
    setOperator(null);
    setSnapshot(EMPTY);
    setSelectedId(null);
    setSessionMessage("Sua sessão expirou. Entre novamente para continuar.");
    setSound(false);
    setNotifications(false);
    knownIncidents.current = null;
  }, []);
  const refreshRef = useRef<() => Promise<void>>(async () => {});
  useEffect(() => {
    if (!operator) return;
    let alive = true;
    let loading = false;
    let pending = false;
    let currentController: AbortController | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let activity = Date.now();
    let streamController: AbortController | null = null;
    let attempts = 0;
    const lifetime = new AbortController();
    async function refresh() {
      if (loading) {
        pending = true;
        return;
      }
      loading = true;
      try {
        const data = await api<Snapshot>("/snapshot", {
          signal: lifetime.signal,
        });
        if (!alive) return;
        serverOffset.current = Date.parse(data.serverTime) - Date.now();
        setSnapshot((current) => mergeSnapshot(current, data));
        setSnapshotError("");
        setLastSync(data.serverTime);
        setSelectedId((id) =>
          id && data.incidents.some((x) => x.id === id)
            ? id
            : (data.incidents.find((x) => x.status !== "resolved")?.id ??
              data.incidents[0]?.id ??
              null),
        );
      } catch (e) {
        if (!alive) return;
        if (e instanceof ApiError && e.status === 401) expire();
        else setSnapshotError(message(e));
      } finally {
        loading = false;
        if (pending && alive) {
          pending = false;
          void refresh();
        }
      }
    }
    refreshRef.current = refresh;
    async function connect() {
      if (!alive) return;
      streamController = new AbortController();
      currentController = streamController;
      activity = Date.now();
      setConnection(attempts ? "reconnecting" : "connecting");
      try {
        await streamEvents(
          streamController.signal,
          () => void refresh(),
          async () => {
            await refresh();
            if (alive) {
              setConnection("connected");
              attempts = 0;
            }
          },
          () => {
            activity = Date.now();
          },
        );
      } catch (e) {
        if (!alive) return;
        if ((e as { status?: number }).status === 401) {
          expire();
          return;
        }
        setConnection("reconnecting");
        attempts++;
        retryTimer = setTimeout(
          () => void connect(),
          Math.min(1000 * 2 ** Math.min(attempts, 4), 15000),
        );
      }
    }
    void refresh();
    void connect();
    const watchdog = setInterval(() => {
      if (Date.now() - activity > 40000) {
        setConnection("reconnecting");
        currentController?.abort();
      }
    }, 10000);
    const poll = setInterval(() => void refresh(), 30000);
    const wake = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", wake);
    return () => {
      alive = false;
      lifetime.abort();
      streamController?.abort();
      clearTimeout(retryTimer);
      clearInterval(watchdog);
      clearInterval(poll);
      document.removeEventListener("visibilitychange", wake);
    };
  }, [operator?.id, expire]);
  const openIncidents = useMemo(
    () =>
      snapshot.incidents
        .filter((x) => x.status !== "resolved")
        .sort(
          (a, b) =>
            Number(!!a.acknowledgedAt) - Number(!!b.acknowledgedAt) ||
            Date.parse(a.createdAt) - Date.parse(b.createdAt),
        ),
    [snapshot.incidents],
  );
  const selected = snapshot.incidents.find((i) => i.id === selectedId) ?? null;
  useEffect(() => {
    if (!selected || !operator) {
      setTrail([]);
      setChunks([]);
      setResourceError("");
      return;
    }
    const controller = new AbortController();
    setResourceLoading(true);
    let cancelled = false;
    Promise.all([
      api<{ locations: LocationPoint[] }>(
        `/incidents/${selected.id}/locations`,
        { signal: controller.signal },
      ),
      api<{ chunks: AudioChunk[] }>(`/incidents/${selected.id}/audio`, {
        signal: controller.signal,
      }),
    ])
      .then(([locations, audio]) => {
        if (!cancelled) {
          setTrail(locations.locations);
          setChunks(audio.chunks);
          setResourceOwner(selected!.id);
          setResourceError("");
        }
      })
      .catch((e) => {
        if (!cancelled) {
          if (e instanceof ApiError && e.status === 401) expire();
          else setResourceError(message(e));
        }
      })
      .finally(() => {
        if (!cancelled) setResourceLoading(false);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [
    selected?.id,
    selected?.lastLocation?.sequence,
    selected?.audioCount,
    operator?.id,
    resourceRetry,
    expire,
  ]);
  // Selection changes must never expose the previous woman's trail or recording.
  useEffect(() => {
    setTrail([]);
    setChunks([]);
    setResourceError("");
  }, [selected?.id]);
  const beep = useCallback(
    async (simulated = false) => {
      try {
        const context = soundContext.current ?? new AudioContext();
        soundContext.current = context;
        await context.resume();
        for (let i = 0; i < 2; i++) {
          const oscillator = context.createOscillator();
          const gain = context.createGain();
          oscillator.type = "sine";
          oscillator.frequency.value = simulated ? 440 : 740;
          gain.gain.setValueAtTime(0, context.currentTime + i * 0.4);
          gain.gain.linearRampToValueAtTime(
            0.12,
            context.currentTime + i * 0.4 + 0.02,
          );
          gain.gain.exponentialRampToValueAtTime(
            0.001,
            context.currentTime + i * 0.4 + 0.25,
          );
          oscillator.connect(gain);
          gain.connect(context.destination);
          oscillator.start(context.currentTime + i * 0.4);
          oscillator.stop(context.currentTime + i * 0.4 + 0.3);
        }
      } catch {
        setSound(false);
        showToast("O navegador bloqueou o som. Ative e teste novamente.", true);
      }
    },
    [showToast],
  );
  const pendingAlerts = openIncidents.filter((i) => !i.acknowledgedAt);
  useEffect(() => {
    if (!sound || !pendingAlerts.length) return;
    void beep(pendingAlerts.every((x) => x.simulated));
    const timer = setInterval(
      () => void beep(pendingAlerts.every((x) => x.simulated)),
      12000,
    );
    return () => clearInterval(timer);
  }, [
    sound,
    pendingAlerts.map((x) => `${x.id}:${x.simulated}`).join(","),
    beep,
  ]);
  useEffect(() => {
    if (!operator) return;
    const ids = new Map(snapshot.incidents.map((i) => [i.id, i.simulated]));
    const arrivals = knownIncidents.current
      ? notifiableAlerts(knownIncidents.current, snapshot.incidents)
      : [];
    if (arrivals.length) {
      const receivedNow = Date.now() + serverOffset.current;
      setReceiptMotions((previous) => ({
        ...Object.fromEntries(
          Object.entries(previous).filter(([, until]) => until > receivedNow),
        ),
        ...Object.fromEntries(arrivals.map((i) => [i.id, receivedNow + 6000])),
      }));
    }
    if (
      notifications &&
      "Notification" in window &&
      Notification.permission === "granted"
    )
      for (const incident of arrivals)
        new Notification(
          incident.simulated
            ? "SOS Mulher · alerta simulado"
            : "SOS Mulher · ALERTA REAL",
          {
            body: `Ocorrência ${incident.code}. Abra a central para reconhecer.`,
            icon: "/brand/favicon-v2.png",
            tag: incident.id,
          },
        );
    if (lastSync) knownIncidents.current = ids;
  }, [snapshot.incidents, notifications, operator?.id, lastSync]);
  useEffect(
    () => () => {
      void soundContext.current?.close();
    },
    [],
  );
  async function enableNotifications() {
    if (!("Notification" in window)) {
      showToast("Este navegador não oferece notificações de sistema.", true);
      return;
    }
    if (notifications) {
      setNotifications(false);
      return;
    }
    try {
      const permission = await Notification.requestPermission();
      if (permission === "granted") {
        new Notification("SOS Mulher · teste de notificação", {
          body: "As notificações da central estão habilitadas.",
          icon: "/brand/favicon-v2.png",
        });
        setNotifications(true);
      } else
        showToast(
          "Notificações bloqueadas. Habilite-as nas permissões do navegador.",
          true,
        );
    } catch {
      setNotifications(false);
      showToast(
        "Não foi possível ativar as notificações neste navegador.",
        true,
      );
    }
  }

  async function incidentAction(action: "ack" | "claim" | "resolve") {
    if (!selected) return;
    setActionBusy(true);
    setResolveError("");
    try {
      const body =
        action === "ack"
          ? {}
          : action === "claim"
            ? { expectedRevision: selected.revision }
            : {
                expectedRevision: selected.revision,
                resolution: resolution.trim(),
              };
      const result = await post<{ incident: Incident }>(
        `/incidents/${selected.id}/${action}`,
        body,
      );
      setSnapshot((data) => ({
        ...data,
        incidents: data.incidents.map((i) =>
          i.id === result.incident.id ? result.incident : i,
        ),
      }));
      if (action === "resolve") {
        setResolveOpen(false);
        setResolution("");
      }
      showToast(
        action === "ack"
          ? "Alerta reconhecido. A ocorrência continua aguardando responsável."
          : action === "claim"
            ? "Ocorrência atribuída a você."
            : "Ocorrência encerrada e registrada na auditoria.",
      );
      await refreshRef.current();
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) expire();
      else if (e instanceof ApiError && e.status === 409) {
        await refreshRef.current();
        const text =
          "A ocorrência foi atualizada por outro operador. Confira o responsável e tente novamente.";
        showToast(text, true);
        setResolveError(text);
      } else {
        showToast(message(e), true);
        setResolveError(message(e));
      }
    } finally {
      setActionBusy(false);
    }
  }
  async function generatePairing(woman: Woman) {
    setActionBusy(true);
    try {
      const result = await post<{ code: string; expiresAt: string }>(
        `/women/${woman.id}/pairing`,
      );
      setPairing({ woman, ...result });
      await refreshRef.current();
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) expire();
      else showToast(message(e), true);
    } finally {
      setActionBusy(false);
    }
  }
  async function logout() {
    setActionBusy(true);
    try {
      await post("/auth/logout");
      setOperator(null);
      setSnapshot(EMPTY);
      setSessionMessage("");
      setSelectedId(null);
      setSound(false);
      setNotifications(false);
      knownIncidents.current = null;
    } catch (e) {
      showToast("Não foi possível encerrar a sessão. Tente novamente.", true);
    } finally {
      setActionBusy(false);
    }
  }
  function navigate(next: Page) {
    setPage(next);
    setSearch("");
  }
  function selectIncident(id: string) {
    setSelectedId(id);
    setPage("central");
  }
  const canManage = operator && ["admin", "dispatcher"].includes(operator.role);
  const oldest = oldestUnassigned(openIncidents);
  const newCount = openIncidents.filter((i) => !i.assignedTo).length;
  const currentTime = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Porto_Velho",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(now);
  if (boot)
    return (
      <div className="boot">
        <img src="/brand/symbol-v2.png" alt="SOS Mulher" />
        <LoaderCircle className="spin" />
        <p>Conectando à rede de proteção…</p>
      </div>
    );
  if (!operator)
    return (
      <Login
        onLogin={(value) => {
          setOperator(value);
          setSessionMessage("");
          setPage("central");
        }}
        initialError={sessionMessage}
      />
    );
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button
          className="brand"
          onClick={() => navigate("central")}
          aria-label="SOS Mulher, central"
        >
          <img src="/brand/symbol-v2.png" alt="" />
          <span>
            SOS <b>Mulher</b>
            <small>REDE DE PROTEÇÃO</small>
          </span>
        </button>
        <div className="nav-label">OPERAÇÃO INTEGRADA</div>
        <nav aria-label="Navegação principal">
          {(
            [
              { id: "central", label: "Central", icon: LayoutGrid },
              { id: "incidents", label: "Ocorrências", icon: TriangleAlert },
              { id: "women", label: "Assistidas", icon: Users },
              { id: "audit", label: "Auditoria", icon: History },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              className={`nav-item ${page === item.id ? "active" : ""}`}
              onClick={() => navigate(item.id)}
              aria-current={page === item.id ? "page" : undefined}
            >
              <item.icon size={19} />
              <span>{item.label}</span>
              {item.id === "incidents" && pendingAlerts.length > 0 && (
                <b>{pendingAlerts.length}</b>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-agency">
          <div className="agency-icon">
            <ShieldCheck size={19} />
          </div>
          <span>
            Rede institucional
            <strong>Agência {operator.agencyId.slice(0, 8)}</strong>
            <small>Ambiente de acesso restrito</small>
          </span>
        </div>
        <div className="sidebar-bottom">
          <div className="sound-card">
            <div>
              <span className={`sound-indicator ${sound ? "on" : ""}`}>
                {sound ? <Volume2 size={16} /> : <VolumeX size={16} />}
              </span>
              <strong>Som da central</strong>
              <span className="setting-state">
                {sound ? "ATIVO" : "INATIVO"}
              </span>
            </div>
            <p>
              {sound
                ? "Novos alertas repetem até o reconhecimento."
                : "Ative o som para perceber novos alertas."}
            </p>
            <button
              className="button secondary full"
              onClick={() => {
                if (sound) setSound(false);
                else {
                  setSound(true);
                  void beep(true);
                }
              }}
            >
              {sound ? "Desativar som" : "Ativar e testar som"}
            </button>
            {sound && (
              <button className="text-button" onClick={() => void beep(true)}>
                Testar novamente
              </button>
            )}
          </div>
          <button
            className={`notification-control ${notifications ? "on" : ""}`}
            onClick={() => void enableNotifications()}
          >
            {notifications ? <Bell size={16} /> : <BellOff size={16} />}
            <span>
              {notifications ? "Notificações ativas" : "Ativar notificações"}
            </span>
          </button>
          <div className="operator">
            <span className="avatar">{initial(operator.name)}</span>
            <span>
              <strong>{operator.name}</strong>
              <small>{roleLabel[operator.role] ?? operator.role}</small>
            </span>
            <button
              className="icon-button"
              onClick={() => void logout()}
              disabled={actionBusy}
              aria-label="Sair da central"
              title="Encerrar sessão"
            >
              <LogOut size={17} />
            </button>
          </div>
          <div className="restricted-label">
            <Shield size={12} /> SESSÃO SEGURA E AUDITADA
          </div>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="breadcrumb">
            SOS Mulher <ChevronRight size={13} /> <span>{titles[page][1]}</span>
          </div>
          <div className="topbar-right">
            <span className="location-small">
              <MapPin size={13} /> Ariquemes · RO
            </span>
            <span className="time-display">{currentTime}</span>
            <span className="topbar-avatar">{initial(operator.name)}</span>
          </div>
        </header>
        <main className="main-content">
          <div className="page-title">
            <div>
              <span className="eyebrow">{titles[page][0]}</span>
              <h1>
                {titles[page][1]}
                <span className="title-period">.</span>
              </h1>
              <p>
                {page === "central"
                  ? "Cada sinal importa. Cada resposta faz a diferença."
                  : page === "incidents"
                    ? "Acompanhe cada alerta, do recebimento ao encerramento."
                    : page === "women"
                      ? "Cadastro e vínculo seguro com a rede de proteção."
                      : "Histórico de ações e acessos desta agência."}
              </p>
            </div>
            <div className="page-title-actions">
              <span
                className={`connection-pill ${connection === "connected" && !snapshotError ? "connected" : "warning"}`}
              >
                {connection === "connected" && !snapshotError ? (
                  <Wifi size={14} />
                ) : (
                  <MotionSignal
                    kind="reconnecting"
                    active={connection !== "connected"}
                  />
                )}
                <span>
                  {snapshotError
                    ? "Sincronização pendente"
                    : connection === "connected"
                      ? "Central conectada"
                      : connection === "connecting"
                        ? "Conectando…"
                        : "Reconectando…"}
                </span>
                <span className="status-dot" />
              </span>
              <small>
                {lastSync
                  ? `Atualizada às ${clock(lastSync)}`
                  : "Aguardando sincronização"}
              </small>
            </div>
          </div>
          {import.meta.env.VITE_DEMO_MODE === "true" && (
            <div className="demo-banner">
              <Info size={14} />
              <strong>DEMONSTRAÇÃO</strong>
              <span>
                Dados fictícios · nenhuma equipe é despachada neste ambiente.
              </span>
            </div>
          )}
          {(snapshotError || connection === "reconnecting") && (
            <div className="connection-banner" role="status">
              {connection === "reconnecting" ? (
                <MotionSignal kind="reconnecting" active />
              ) : (
                <WifiOff size={17} />
              )}
              <span>
                <strong>
                  {snapshotError
                    ? "Não foi possível atualizar os dados."
                    : "Reconectando ao servidor."}
                </strong>{" "}
                As informações exibidas podem estar desatualizadas. A reconexão
                é automática.
              </span>
              <button onClick={() => void refreshRef.current()}>
                <RefreshCw size={15} /> Tentar agora
              </button>
            </div>
          )}
          {page === "central" && (
            <>
              <div className="stats-grid">
                <Stat
                  icon={<Radio />}
                  value={String(openIncidents.length).padStart(2, "0")}
                  label="Ocorrências abertas"
                  detail="Na fila de atendimento"
                />
                <Stat
                  icon={<TriangleAlert />}
                  value={String(newCount).padStart(2, "0")}
                  label="Aguardando responsável"
                  detail={
                    pendingAlerts.length
                      ? `${pendingAlerts.length} sem reconhecimento humano`
                      : "Todos os alertas reconhecidos"
                  }
                  color="pink"
                />
                <Stat
                  icon={<Clock3 />}
                  value={oldest ? duration(age(oldest.createdAt, now)) : "—"}
                  label="Mais antiga sem assumir"
                  detail={
                    oldest
                      ? `Ocorrência ${oldest.code}`
                      : "Nenhuma ocorrência aguardando"
                  }
                  color="gold"
                />
                <Stat
                  icon={<ShieldCheck />}
                  value={String(
                    openIncidents.filter((i) => i.assignedTo).length,
                  ).padStart(2, "0")}
                  label="Em atendimento"
                  detail="Com operador responsável"
                  color="blue"
                />
              </div>
              <div className="operation-heading">
                <h2>
                  <span className="status-dot" /> Visão compartilhada da
                  operação
                </h2>
                <span>
                  <ShieldCheck size={14} /> Acesso por agência
                </span>
              </div>
              <div className="operations-grid">
                <section className="queue card">
                  <div className="card-heading">
                    <h2>
                      Fila de ocorrências <span>{openIncidents.length}</span>
                    </h2>
                    <span className="eyebrow">ALERTAS PENDENTES PRIMEIRO</span>
                  </div>
                  <div className="queue-list">
                    {openIncidents.length === 0 ? (
                      <div className="empty-state compact">
                        <ShieldCheck size={30} />
                        <h3>
                          {lastSync
                            ? "A rede está em prontidão"
                            : "Carregando ocorrências"}
                        </h3>
                        <p>
                          {lastSync
                            ? "Nenhuma ocorrência aberta no momento."
                            : "Aguardando a resposta do servidor."}
                        </p>
                      </div>
                    ) : (
                      openIncidents.map((i) => (
                        <button
                          key={i.id}
                          className={`queue-item ${i.id === selectedId ? "selected" : ""}`}
                          onClick={() => setSelectedId(i.id)}
                          aria-pressed={i.id === selectedId}
                        >
                          <div className="queue-item-top">
                            <strong>
                              {!i.acknowledgedAt && (
                                <MotionSignal
                                  key={receiptMotions[i.id] ?? i.id}
                                  kind="alert"
                                  active={(receiptMotions[i.id] ?? 0) > now}
                                />
                              )}{" "}
                              {i.code}
                            </strong>
                            <span className={!i.assignedTo ? "gold-text" : ""}>
                              {duration(age(i.createdAt, now))}
                            </span>
                          </div>
                          <Badge incident={i} />
                          <span className="queue-woman">{i.womanName}</span>
                          <div className="queue-location">
                            <MapPin size={12} />
                            {i.lastLocation
                              ? `Sinal há ${duration(age(i.lastLocation.capturedAt, now))}`
                              : "Aguardando localização"}
                          </div>
                          <span
                            className={`simulation-label ${i.simulated ? "" : "real-label"}`}
                          >
                            {i.simulated ? "SIMULADO" : "ALERTA REAL"}
                          </span>
                          <ChevronRight className="queue-chevron" size={17} />
                        </button>
                      ))
                    )}
                  </div>
                  <div className="queue-note">
                    <Info size={16} />
                    <p>
                      Reconhecer um alerta
                      <br />
                      <strong>não atribui um responsável.</strong>
                    </p>
                  </div>
                  <div className="queue-footer">
                    <Activity size={13} />
                    {lastSync
                      ? "Fila sincronizada com o servidor"
                      : "Sincronizando fila"}
                  </div>
                </section>
                <MapView
                  incidents={
                    openIncidents.length
                      ? openIncidents
                      : selected
                        ? [selected]
                        : []
                  }
                  selected={selected}
                  trail={resourceOwner === selected?.id ? trail : []}
                  now={now}
                  onSelect={setSelectedId}
                />
                <section
                  className="incident-detail card"
                  aria-label="Detalhes da ocorrência"
                >
                  {selected ? (
                    <>
                      <div className="detail-top">
                        <span className="eyebrow">OCORRÊNCIA SELECIONADA</span>
                        <div className="detail-code">
                          <h2>{selected.code}</h2>
                          <span className={`detail-symbol ${selected.status}`}>
                            {!selected.acknowledgedAt &&
                            selected.status !== "resolved" ? (
                              <MotionSignal
                                key={receiptMotions[selected.id] ?? selected.id}
                                kind="alert"
                                size="medium"
                                active={
                                  (receiptMotions[selected.id] ?? 0) > now
                                }
                              />
                            ) : (
                              <Shield size={23} />
                            )}
                          </span>
                        </div>
                        <div className="detail-badges">
                          <Badge incident={selected} />
                          {selected.simulated ? (
                            <span className="badge gold">SIMULADO</span>
                          ) : (
                            <span className="badge pink">ALERTA REAL</span>
                          )}
                        </div>
                        <p className="detail-woman">{selected.womanName}</p>
                        <span className="detail-received">
                          Recebida às {clock(selected.receivedAt)}
                        </span>
                      </div>
                      <div className="detail-location">
                        <div className="section-label">
                          <span>
                            <MapPin size={14} /> ÚLTIMA LOCALIZAÇÃO
                          </span>
                          {selected.lastLocation && (
                            <span
                              className={`signal-indicator ${(age(selected.lastLocation.capturedAt, now) ?? 0) > 60 ? "old" : ""}`}
                            >
                              {(age(selected.lastLocation.capturedAt, now) ??
                                0) > 60
                                ? "ANTIGA"
                                : "RECENTE"}
                            </span>
                          )}
                        </div>
                        <strong className="location-age">
                          {selected.lastLocation
                            ? `há ${duration(age(selected.lastLocation.capturedAt, now))}`
                            : "Aguardando sinal"}
                        </strong>
                        {selected.lastLocation ? (
                          <>
                            <p>
                              Precisão ±
                              {Math.round(selected.lastLocation.accuracy)} m{" "}
                              {selected.lastLocation.battery !== undefined &&
                                `· Bateria ${Math.round(selected.lastLocation.battery)}%`}
                            </p>
                            <code>
                              {selected.lastLocation.latitude.toFixed(5)},{" "}
                              {selected.lastLocation.longitude.toFixed(5)}
                            </code>
                            {(age(selected.lastLocation.capturedAt, now) ?? 0) >
                              60 && (
                              <p className="warning-text">
                                Última posição conhecida. Não representa
                                necessariamente a posição atual.
                              </p>
                            )}
                          </>
                        ) : (
                          <p>O dispositivo ainda não enviou coordenadas.</p>
                        )}
                      </div>
                      <div className="assignment">
                        <ShieldCheck size={18} />
                        <div>
                          <strong>
                            {selected.assignedName ??
                              "Sem operador responsável"}
                          </strong>
                          <small>
                            {selected.assignedTo
                              ? "Responsabilidade confirmada pelo servidor"
                              : "A ocorrência aguarda atribuição"}
                          </small>
                        </div>
                      </div>
                      <div className="receipt-timeline">
                        <span className="section-label">
                          CONFIRMAÇÕES DE RECEBIMENTO
                        </span>
                        <div className="receipt-step complete">
                          <CheckCheck size={16} />
                          <span>
                            Recebido pelo servidor
                            <small>{clock(selected.receivedAt)}</small>
                          </span>
                        </div>
                        <div
                          className={`receipt-step ${selected.acknowledgedAt ? "complete" : "pending"}`}
                        >
                          {selected.acknowledgedAt ? (
                            <CheckCheck size={16} />
                          ) : (
                            <Clock3 size={16} />
                          )}
                          <span>
                            {selected.acknowledgedAt
                              ? "Reconhecimento humano confirmado"
                              : "Reconhecimento humano pendente"}
                            {selected.acknowledgedAt && (
                              <small>{clock(selected.acknowledgedAt)}</small>
                            )}
                          </span>
                        </div>
                      </div>
                      <div className="incident-actions">
                        {selected.status !== "resolved" && canManage && (
                          <>
                            {!selected.assignedTo && (
                              <button
                                className="button primary full"
                                disabled={
                                  actionBusy || connection !== "connected"
                                }
                                onClick={() => void incidentAction("claim")}
                              >
                                <UserCheck size={17} /> Assumir ocorrência{" "}
                                <ArrowRight size={16} />
                              </button>
                            )}
                            {!selected.acknowledgedAt && (
                              <button
                                className="button secondary full"
                                disabled={
                                  actionBusy || connection !== "connected"
                                }
                                onClick={() => void incidentAction("ack")}
                              >
                                <Check size={17} /> Reconhecer alerta
                              </button>
                            )}
                            {(selected.assignedTo === operator.id ||
                              operator.role === "admin") && (
                              <button
                                className="button secondary full"
                                disabled={
                                  actionBusy || connection !== "connected"
                                }
                                onClick={() => {
                                  setResolution("");
                                  setResolveError("");
                                  setResolveOpen(true);
                                }}
                              >
                                <FileCheck2 size={17} /> Encerrar ocorrência
                              </button>
                            )}
                          </>
                        )}
                        {selected.status === "resolved" && (
                          <p className="resolved-note">
                            <ShieldCheck size={17} /> Encerrada às{" "}
                            {selected.resolvedAt
                              ? clock(selected.resolvedAt)
                              : "—"}
                          </p>
                        )}
                      </div>
                      {resourceLoading && (
                        <p className="resource-loading">
                          <LoaderCircle size={13} className="spin" />{" "}
                          Atualizando trilha e blocos…
                        </p>
                      )}
                      {resourceError && (
                        <p className="inline-error">
                          {resourceError}{" "}
                          <button
                            className="text-button"
                            onClick={() => setResourceRetry((x) => x + 1)}
                          >
                            Tentar novamente
                          </button>
                        </p>
                      )}
                      <AudioPanel
                        key={selected.id}
                        incidentId={selected.id}
                        chunks={resourceOwner === selected.id ? chunks : []}
                        error={resourceError}
                      />
                    </>
                  ) : (
                    <div className="empty-state">
                      <ShieldCheck size={40} />
                      <h3>Prontos para acolher</h3>
                      <p>
                        Selecione uma ocorrência para acompanhar a localização e
                        coordenar o atendimento.
                      </p>
                    </div>
                  )}
                </section>
              </div>
              <div className="operation-bottom">
                <span>
                  <span className="legend-dot" /> Novo alerta
                </span>
                <span>
                  <span className="legend-dot blue" /> Em atendimento
                </span>
                <span>
                  <span className="legend-dot gold" /> Posição antiga
                </span>
                <p>
                  Os tempos indicam o registro recebido; conexão não confirma
                  atendimento humano.
                </p>
              </div>
            </>
          )}
          {page === "incidents" && (
            <section className="data-section card">
              <div className="data-toolbar">
                <div className="segment-control">
                  {[
                    ["open", "Abertas"],
                    ["resolved", "Encerradas"],
                    ["all", "Todas"],
                  ].map(([value, label]) => (
                    <button
                      key={value}
                      className={incidentFilter === value ? "active" : ""}
                      onClick={() => setIncidentFilter(value)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <SearchBox
                  value={search}
                  onChange={setSearch}
                  placeholder="Buscar por código ou assistida"
                />
              </div>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Ocorrência</th>
                      <th>Assistida</th>
                      <th>Situação</th>
                      <th>Responsável</th>
                      <th>Recebimento</th>
                      <th>
                        <span className="sr-only">Abrir</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {snapshot.incidents
                      .filter(
                        (i) =>
                          (incidentFilter === "all" ||
                            (incidentFilter === "open"
                              ? i.status !== "resolved"
                              : i.status === "resolved")) &&
                          `${i.code} ${i.womanName}`
                            .toLocaleLowerCase("pt-BR")
                            .includes(search.toLocaleLowerCase("pt-BR")),
                      )
                      .map((i) => (
                        <tr key={i.id}>
                          <td>
                            <strong>{i.code}</strong>
                            {i.simulated && (
                              <small className="simulation-label">
                                SIMULADO
                              </small>
                            )}
                          </td>
                          <td>{i.womanName}</td>
                          <td>
                            <Badge incident={i} />
                          </td>
                          <td>
                            {i.assignedName ?? (
                              <span className="muted">Aguardando</span>
                            )}
                          </td>
                          <td className="tabular">{dateTime(i.receivedAt)}</td>
                          <td>
                            <button
                              className="table-action"
                              onClick={() => selectIncident(i.id)}
                              aria-label={`Abrir ocorrência ${i.code}`}
                            >
                              <ArrowRight size={17} />
                            </button>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
              {snapshot.incidents.filter(
                (i) =>
                  (incidentFilter === "all" ||
                    (incidentFilter === "open"
                      ? i.status !== "resolved"
                      : i.status === "resolved")) &&
                  `${i.code} ${i.womanName}`
                    .toLocaleLowerCase("pt-BR")
                    .includes(search.toLocaleLowerCase("pt-BR")),
              ).length === 0 && (
                <div className="empty-state">
                  <TriangleAlert size={30} />
                  <h3>Nenhuma ocorrência encontrada</h3>
                  <p>Altere os filtros ou aguarde um novo alerta.</p>
                </div>
              )}
              <div className="data-footer">
                <Shield size={14} /> Registros disponíveis apenas para sua
                agência.
              </div>
            </section>
          )}
          {page === "women" && (
            <section className="data-section card">
              <div className="data-toolbar">
                <div>
                  <h2>
                    Mulheres na rede{" "}
                    <span className="count-label">{snapshot.women.length}</span>
                  </h2>
                  <p>Vínculo individual, consentido e protegido.</p>
                </div>
                <div className="toolbar-actions">
                  <SearchBox
                    value={search}
                    onChange={setSearch}
                    placeholder="Nome ou referência"
                  />
                  {canManage && (
                    <button
                      className="button primary"
                      onClick={() => setWomanOpen(true)}
                    >
                      <Plus size={17} /> Cadastrar assistida
                    </button>
                  )}
                </div>
              </div>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Assistida</th>
                      <th>Referência interna</th>
                      <th>Contato</th>
                      <th>Cadastro</th>
                      <th>Dispositivo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {snapshot.women
                      .filter((w) =>
                        `${w.name} ${w.reference}`
                          .toLocaleLowerCase("pt-BR")
                          .includes(search.toLocaleLowerCase("pt-BR")),
                      )
                      .map((w) => (
                        <tr key={w.id}>
                          <td>
                            <div className="woman-cell">
                              <span className="avatar">{initial(w.name)}</span>
                              <div>
                                <strong>{w.name}</strong>
                                {w.notes && <small>{w.notes}</small>}
                              </div>
                            </div>
                          </td>
                          <td>
                            <code>{w.reference}</code>
                          </td>
                          <td>{w.phone}</td>
                          <td>{dateTime(w.createdAt)}</td>
                          <td>
                            {canManage ? (
                              <button
                                className="button secondary small"
                                disabled={actionBusy}
                                onClick={() => void generatePairing(w)}
                              >
                                <Link2 size={14} /> Gerar vínculo
                              </button>
                            ) : (
                              <span className="muted">Acesso de consulta</span>
                            )}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
              {snapshot.women.filter((w) =>
                `${w.name} ${w.reference}`
                  .toLocaleLowerCase("pt-BR")
                  .includes(search.toLocaleLowerCase("pt-BR")),
              ).length === 0 && (
                <div className="empty-state">
                  <Users size={32} />
                  <h3>Nenhuma assistida encontrada</h3>
                  <p>Cadastre uma assistida ou ajuste sua busca.</p>
                </div>
              )}
              <div className="data-footer">
                <ShieldCheck size={15} /> O código de vínculo expira em 10
                minutos e só pode ser utilizado uma vez.
              </div>
            </section>
          )}
          {page === "audit" && (
            <section className="data-section card">
              <div className="data-toolbar">
                <div>
                  <h2>Registro de atividades</h2>
                  <p>Ações humanas e eventos técnicos identificados.</p>
                </div>
                <SearchBox
                  value={search}
                  onChange={setSearch}
                  placeholder="Buscar ação ou operador"
                />
              </div>
              <div className="audit-list">
                {snapshot.audit
                  .filter((a) =>
                    `${a.action} ${actionLabel[a.action] ?? ""} ${a.actorName} ${a.detail}`
                      .toLocaleLowerCase("pt-BR")
                      .includes(search.toLocaleLowerCase("pt-BR")),
                  )
                  .map((event) => (
                    <article className="audit-row" key={event.id}>
                      <span className="audit-icon">
                        <History size={16} />
                      </span>
                      <div>
                        <strong>
                          {actionLabel[event.action] ?? event.action}
                        </strong>
                        <p>{event.detail}</p>
                        <small>
                          {event.actorName}
                          {event.incidentId &&
                            ` · ${snapshot.incidents.find((i) => i.id === event.incidentId)?.code ?? event.incidentId.slice(0, 8)}`}
                        </small>
                      </div>
                      <time dateTime={event.createdAt}>
                        {dateTime(event.createdAt)}
                      </time>
                      {event.incidentId &&
                        snapshot.incidents.some(
                          (i) => i.id === event.incidentId,
                        ) && (
                          <button
                            className="table-action"
                            aria-label="Abrir ocorrência relacionada"
                            onClick={() => selectIncident(event.incidentId!)}
                          >
                            <ArrowRight size={16} />
                          </button>
                        )}
                    </article>
                  ))}
              </div>
              {snapshot.audit.filter((a) =>
                `${a.action} ${actionLabel[a.action] ?? ""} ${a.actorName} ${a.detail}`
                  .toLocaleLowerCase("pt-BR")
                  .includes(search.toLocaleLowerCase("pt-BR")),
              ).length === 0 && (
                <div className="empty-state">
                  <History size={32} />
                  <h3>Nenhuma atividade encontrada</h3>
                  <p>
                    As próximas atividades aparecerão aqui após a sincronização.
                  </p>
                </div>
              )}
            </section>
          )}
          <footer className="workspace-footer">
            <span>
              <img src="/brand/symbol-v2.png" alt="" /> SOS Mulher <i>/</i> Rede
              integrada de proteção
            </span>
            <span>
              Ariquemes · Rondônia <i>•</i> Acesso institucional
            </span>
          </footer>
        </main>
      </div>
      {toast && (
        <div
          className={`toast ${toast.error ? "error" : ""}`}
          role={toast.error ? "alert" : "status"}
        >
          {toast.error ? (
            <TriangleAlert size={18} />
          ) : (
            <MotionSignal key={toast.text} kind="confirmed" active />
          )}
          <span>{toast.text}</span>
          <button
            className="icon-button"
            onClick={() => setToast(null)}
            aria-label="Fechar aviso"
          >
            <X size={16} />
          </button>
        </div>
      )}
      {resolveOpen && selected && (
        <Modal
          title={`Encerrar ${selected.code}`}
          subtitle="Registre o desfecho do atendimento."
          onClose={() => {
            if (!actionBusy) setResolveOpen(false);
          }}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void incidentAction("resolve");
            }}
          >
            <div className="modal-notice">
              <FileCheck2 size={20} />
              <p>
                O encerramento interrompe o envio desta ocorrência. A
                justificativa ficará na auditoria da agência.
              </p>
            </div>
            <label>
              Motivo e encaminhamento
              <textarea
                autoFocus
                required
                minLength={10}
                maxLength={2000}
                value={resolution}
                onChange={(e) => setResolution(e.target.value)}
                placeholder="Descreva o atendimento realizado e o encaminhamento…"
                rows={4}
              />
              <small>
                Mínimo de 10 caracteres. Não inclua dados desnecessários.
              </small>
            </label>
            {resolveError && (
              <p className="inline-error" role="alert">
                {resolveError}
              </p>
            )}
            <div className="modal-actions">
              <button
                type="button"
                className="button secondary"
                disabled={actionBusy}
                onClick={() => setResolveOpen(false)}
              >
                Continuar atendimento
              </button>
              <button
                className="button primary"
                disabled={actionBusy || resolution.trim().length < 10}
              >
                {actionBusy ? (
                  <LoaderCircle className="spin" size={16} />
                ) : (
                  <FileCheck2 size={16} />
                )}{" "}
                Confirmar encerramento
              </button>
            </div>
          </form>
        </Modal>
      )}
      {womanOpen && (
        <WomanForm
          onClose={() => setWomanOpen(false)}
          onCreated={async (woman) => {
            setWomanOpen(false);
            await refreshRef.current();
            showToast(`${woman.name} foi cadastrada na rede de proteção.`);
          }}
        />
      )}
      {pairing && (
        <Modal
          title="Vincular dispositivo"
          subtitle={pairing.woman.name}
          onClose={() => setPairing(null)}
        >
          <div className="pairing-info">
            <span className="secure-symbol">
              <Link2 size={24} />
            </span>
            <p>
              Informe o código à assistida para vinculá-lo no aplicativo Lume. O
              uso é individual e exige consentimento no dispositivo.
            </p>
            <span className="eyebrow">CÓDIGO DE USO ÚNICO</span>
            <div
              className={`pairing-code ${(age(pairing.expiresAt, now) ?? 0) > 0 ? "expired" : ""}`}
            >
              {now >= Date.parse(pairing.expiresAt) ? "EXPIRADO" : pairing.code}
            </div>
            <p className="pairing-expiry">
              <Clock3 size={15} />
              {now >= Date.parse(pairing.expiresAt)
                ? "Gere um novo código para continuar."
                : `Válido por ${duration(Math.ceil((Date.parse(pairing.expiresAt) - now) / 1000))} · até ${clock(pairing.expiresAt)}`}
            </p>
          </div>
          <div className="modal-notice">
            <ShieldCheck size={18} />
            <p>
              O código não confirma que o dispositivo já foi vinculado. A
              confirmação aparece na auditoria após o consentimento.
            </p>
          </div>
          <div className="modal-actions">
            <button
              className="button secondary"
              onClick={() => setPairing(null)}
            >
              Fechar
            </button>
            <button
              className="button primary"
              disabled={now >= Date.parse(pairing.expiresAt)}
              onClick={() => {
                void navigator.clipboard
                  .writeText(pairing.code)
                  .then(() =>
                    showToast(
                      "Código copiado. Compartilhe somente com a assistida.",
                    ),
                  )
                  .catch(() =>
                    showToast(
                      "Não foi possível copiar. Selecione o código manualmente.",
                      true,
                    ),
                  );
              }}
            >
              <Copy size={16} /> Copiar código
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
function Stat({
  icon,
  value,
  label,
  detail,
  color = "",
}: {
  icon: ReactNode;
  value: string;
  label: string;
  detail: string;
  color?: string;
}) {
  return (
    <article className={`stat-card ${color}`}>
      <div>
        <span className="stat-icon">{icon}</span>
        <span className="stat-label">{label}</span>
      </div>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}
function SearchBox({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <label className="search-box">
      <Search size={16} />
      <input
        aria-label={placeholder}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {value && (
        <button
          type="button"
          aria-label="Limpar busca"
          onClick={() => onChange("")}
        >
          <X size={14} />
        </button>
      )}
    </label>
  );
}
function WomanForm({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (woman: Woman) => void;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      const result = await post<{ woman: Woman }>("/women", {
        name: String(form.get("name")).trim(),
        phone: String(form.get("phone")).trim(),
        reference: String(form.get("reference")).trim(),
        notes: String(form.get("notes")).trim(),
      });
      onCreated(result.woman);
    } catch (e) {
      setError(message(e));
      setBusy(false);
    }
  }
  return (
    <Modal
      title="Cadastrar assistida"
      subtitle="Um novo vínculo com a rede de proteção."
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form onSubmit={submit}>
        <label>
          Nome completo
          <input
            autoFocus
            name="name"
            required
            minLength={3}
            maxLength={150}
            autoComplete="off"
            placeholder="Nome da assistida"
          />
        </label>
        <div className="form-columns">
          <label>
            Telefone
            <input
              name="phone"
              type="tel"
              required
              minLength={8}
              maxLength={30}
              placeholder="(69) 99999-9999"
            />
          </label>
          <label>
            Referência interna
            <input
              name="reference"
              required
              minLength={2}
              maxLength={80}
              placeholder="Ex.: ARQ-2026-001"
            />
          </label>
        </div>
        <label>
          Observações de atendimento <span className="muted">(opcional)</span>
          <textarea
            name="notes"
            maxLength={2000}
            rows={3}
            placeholder="Informações necessárias ao acolhimento…"
          />
        </label>
        <div className="modal-notice">
          <ShieldCheck size={18} />
          <p>
            O cadastro é restrito à sua agência. O vínculo do celular será feito
            com um código individual, mediante consentimento.
          </p>
        </div>
        {error && (
          <p className="inline-error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={onClose}
          >
            Cancelar
          </button>
          <button className="button primary" disabled={busy}>
            {busy ? (
              <LoaderCircle size={16} className="spin" />
            ) : (
              <Plus size={16} />
            )}{" "}
            Cadastrar assistida
          </button>
        </div>
      </form>
    </Modal>
  );
}
