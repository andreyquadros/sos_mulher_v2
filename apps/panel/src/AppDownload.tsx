import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";

const apkPath = "/downloads/lume-navegador.apk";
const apkType = "application/vnd.android.package-archive";

export default function AppDownload() {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [retry, setRetry] = useState(0);
  const url = new URL(apkPath, window.location.origin).href;

  useEffect(() => {
    setAvailable(null);
    const controller = new AbortController();
    void fetch(apkPath, {
      method: "HEAD",
      cache: "no-store",
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(6000)]),
    })
      .then((response) => {
        if (!controller.signal.aborted)
          setAvailable(
            response.ok &&
              response.headers.get("content-type")?.split(";")[0].trim() ===
                apkType,
          );
      })
      .catch(() => {
        if (!controller.signal.aborted) setAvailable(false);
      });
    return () => controller.abort();
  }, [retry]);

  return (
    <div className="apk-download">
      {available === null ? (
        <p role="status">Verificando se o APK está disponível…</p>
      ) : available ? (
        <>
          <p>
            Leia o QR Code com a câmera do celular Android para baixar o Lume
            Navegador.
          </p>
          <p className="muted">Distribuição por APK · Android 7 ou posterior</p>
          <QRCodeSVG
            value={url}
            size={200}
            marginSize={4}
            title="QR Code para baixar o Lume Navegador"
            role="img"
          />
          <a href={url} className="button secondary" download>
            <Download size={16} /> Baixar APK
          </a>
          <details className="apk-install-help">
            <summary>Como instalar no Android</summary>
            <ol>
              <li>
                Leia o QR com a câmera e abra o endereço da Central no navegador
                do celular.
              </li>
              <li>
                Aguarde o download e abra o arquivo{" "}
                <strong>lume-navegador.apk</strong>.
              </li>
              <li>
                Se o Android solicitar, permita a instalação por esse navegador
                em “Instalar apps desconhecidos”.
              </li>
              <li>
                Abra o Lume e use o código de vínculo individual na Área
                reservada, com acompanhamento da equipe.
              </li>
            </ol>
            <p>
              Se houver bloqueio, anote a mensagem exata e informe à equipe
              junto com o modelo e a versão do Android. O suporte verifica a
              origem do bloqueio antes de continuar.
            </p>
            <a
              href="https://support.google.com/android/answer/2812853?hl=pt-BR"
              target="_blank"
              rel="noopener noreferrer"
            >
              Ajuda de segurança do Android
            </a>
          </details>
        </>
      ) : (
        <div>
          <p role="status">O APK está indisponível no momento.</p>
          <button
            className="button secondary"
            onClick={() => setRetry((value) => value + 1)}
          >
            Verificar novamente
          </button>
        </div>
      )}
    </div>
  );
}
