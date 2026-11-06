import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";

const apkPath = "/downloads/lume-navegador.apk";
const apkType = "application/vnd.android.package-archive";

export default function AppDownload() {
  const [available, setAvailable] = useState<boolean | null>(null);
  const url = new URL(apkPath, window.location.origin).href;

  useEffect(() => {
    const controller = new AbortController();
    void fetch(apkPath, {
      method: "HEAD",
      cache: "no-store",
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(6000)]),
    })
      .then((response) => {
        if (!controller.signal.aborted)
          setAvailable(
            response.ok && response.headers.get("content-type") === apkType,
          );
      })
      .catch(() => {
        if (!controller.signal.aborted) setAvailable(false);
      });
    return () => controller.abort();
  }, []);

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
        </>
      ) : (
        <p role="status">
          O APK está indisponível no momento. Tente novamente mais tarde.
        </p>
      )}
    </div>
  );
}
