export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}
export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...options,
    signal: options.signal
      ? AbortSignal.any([options.signal, AbortSignal.timeout(15000)])
      : AbortSignal.timeout(15000),
    credentials: "same-origin",
    cache: "no-store",
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new ApiError(
      response.status,
      data.error ||
        `Não foi possível concluir a solicitação (${response.status}).`,
    );
  }
  if (response.status === 204) return undefined as T;
  return response.json();
}
export function post<T>(path: string, body: unknown = {}) {
  return api<T>(path, { method: "POST", body: JSON.stringify(body) });
}
export function message(error: unknown) {
  if (error instanceof Error && error.name === "TimeoutError")
    return "O servidor demorou a responder. Confira a conexão e tente novamente.";
  return error instanceof Error
    ? error.message
    : "Ocorreu um erro. Tente novamente.";
}
export function age(timestamp: string | null | undefined, now = Date.now()) {
  return timestamp
    ? Math.max(0, Math.floor((now - Date.parse(timestamp)) / 1000))
    : null;
}
export function duration(seconds: number | null) {
  if (seconds === null) return "Sem sinal";
  if (seconds < 60) return `${seconds} s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min`;
  return `${Math.floor(seconds / 3600)} h ${Math.floor((seconds % 3600) / 60)} min`;
}
export function clock(timestamp: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Porto_Velho",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(timestamp));
}
export function dateTime(timestamp: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Porto_Velho",
    dateStyle: "short",
    timeStyle: "medium",
  }).format(new Date(timestamp));
}
export function privateAudioUrl(url: string) {
  const parsed = new URL(url, window.location.origin);
  if (
    parsed.origin !== window.location.origin ||
    !/^\/api\/audio\/[^/]+\/content$/.test(parsed.pathname) ||
    parsed.search ||
    parsed.hash
  )
    throw new Error("O servidor retornou um endereço de áudio inválido.");
  return parsed.pathname;
}
