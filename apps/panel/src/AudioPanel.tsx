import { useEffect, useRef, useState } from "react";
import { Headphones, Pause, Play, RefreshCw, Volume2 } from "lucide-react";
import type { AudioChunk } from "./types";
import { clock, message, privateAudioUrl } from "./api";
export default function AudioPanel({
  incidentId,
  chunks,
  error,
}: {
  incidentId: string;
  chunks: AudioChunk[];
  error: string;
}) {
  const [enabled, setEnabled] = useState(false);
  const [played, setPlayed] = useState<number | null>(null);
  const [current, setCurrent] = useState<number | null>(null);
  const [failure, setFailure] = useState("");
  const [retry, setRetry] = useState(0);
  const [loading, setLoading] = useState(false);
  const [skipped, setSkipped] = useState<string[]>([]);
  const player = useRef<HTMLAudioElement | null>(null);
  const sorted = [...chunks].sort((a, b) => a.sequence - b.sequence);
  const next = sorted.find((c) => played === null || c.sequence > played);
  const expected = played === null ? 1 : played + 1;
  const gap = !!next && next.sequence > expected;
  useEffect(() => {
    setEnabled(false);
    setPlayed(null);
    setCurrent(null);
    setFailure("");
    setSkipped([]);
  }, [incidentId]);
  useEffect(() => {
    if (!enabled || !next || gap || failure) return;
    const controller = new AbortController();
    let cancelled = false;
    let objectUrl = "";
    let audio: HTMLAudioElement | null = null;
    setLoading(true);
    setCurrent(next.sequence);
    (async () => {
      try {
        const response = await fetch(privateAudioUrl(next.url), {
          credentials: "same-origin",
          cache: "no-store",
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(15000),
          ]),
        });
        if (!response.ok)
          throw new Error(
            `Falha ao carregar bloco ${next.sequence} (${response.status}).`,
          );
        objectUrl = URL.createObjectURL(await response.blob());
        if (cancelled) return;
        audio = new Audio(objectUrl);
        player.current = audio;
        audio.onended = () => {
          if (!cancelled) {
            setPlayed(next.sequence);
            setCurrent(null);
          }
        };
        audio.onerror = () => {
          if (!cancelled) {
            setFailure("Este bloco não pôde ser reproduzido. Tente novamente.");
            setEnabled(false);
          }
        };
        await audio.play();
        if (!cancelled) setLoading(false);
      } catch (e) {
        if (!cancelled) {
          setFailure(message(e));
          setEnabled(false);
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
      if (audio) {
        audio.pause();
        audio.src = "";
        audio.onended = null;
        audio.onerror = null;
      }
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      player.current = null;
    };
  }, [incidentId, enabled, next?.id, retry, !!gap]);
  const status = failure
    ? "Reprodução interrompida"
    : gap
      ? `Lacuna a partir do bloco ${expected}`
      : current !== null && enabled
        ? loading
          ? "Carregando bloco"
          : "Reproduzindo bloco"
        : enabled
          ? "Aguardando próximo bloco"
          : "Escuta desativada";
  return (
    <section className="audio-section">
      <div className="section-label">
        <span>
          <Headphones size={15} /> ÁUDIO DA OCORRÊNCIA
        </span>
        <span className="tiny-count">
          {chunks.length} {chunks.length === 1 ? "bloco" : "blocos"}
        </span>
      </div>
      <div className={`audio-status ${enabled ? "enabled" : ""}`}>
        <div className="wave-bars" aria-hidden="true">
          {[9, 16, 25, 12, 31, 20, 36, 17, 27, 13, 22, 9].map((h, i) => (
            <i key={i} style={{ height: h }} />
          ))}
        </div>
        <div>
          <strong>{chunks.length ? status : "Nenhum áudio recebido"}</strong>
          <small>
            {current !== null && enabled
              ? `Sequência ${current} · blocos de até 4 segundos`
              : "Reprodução privada · acesso auditado"}
          </small>
        </div>
      </div>
      {(failure || error) && <p className="inline-error">{failure || error}</p>}
      {gap && enabled && (
        <div className="audio-gap" role="status">
          <p className="warning-text">
            O bloco {expected} ainda não foi recebido. Aguarde ou prossiga com
            uma lacuna identificada.
          </p>
          <button
            className="text-button"
            onClick={() => {
              if (next) {
                setSkipped((previous) => [
                  ...previous,
                  expected === next.sequence - 1
                    ? String(expected)
                    : `${expected}–${next.sequence - 1}`,
                ]);
                setPlayed(next.sequence - 1);
              }
            }}
          >
            Continuar do bloco {next?.sequence}
          </button>
        </div>
      )}
      {skipped.length > 0 && (
        <p className="warning-text audio-gap">
          Blocos não ouvidos: {skipped.join(", ")}. A sequência contém lacunas.
        </p>
      )}
      {chunks.length > 0 && (
        <button
          className="button secondary full"
          onClick={() => {
            if (enabled) {
              setEnabled(false);
            } else {
              setFailure("");
              setRetry((x) => x + 1);
              setEnabled(true);
            }
          }}
        >
          {enabled ? (
            <Pause size={16} />
          ) : failure ? (
            <RefreshCw size={16} />
          ) : (
            <Play size={16} />
          )}{" "}
          {enabled
            ? "Pausar escuta"
            : failure
              ? "Tentar ouvir novamente"
              : "Ouvir blocos recebidos"}
        </button>
      )}
      {played !== null && !enabled && (
        <button
          className="text-button"
          onClick={() => {
            setPlayed(null);
            setSkipped([]);
            setFailure("");
            setRetry((x) => x + 1);
            setEnabled(true);
          }}
        >
          <Volume2 size={13} /> Ouvir desde o início
        </button>
      )}
      <p className="microcopy">
        {chunks.length
          ? `Último bloco recebido às ${clock(sorted.at(-1)!.receivedAt)}. O áudio pode apresentar atraso.`
          : "O áudio depende da autorização da assistida, da conexão e do envio pelo dispositivo."}
      </p>
    </section>
  );
}
