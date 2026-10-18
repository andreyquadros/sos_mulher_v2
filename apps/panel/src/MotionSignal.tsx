export type MotionKind = "alert" | "reconnecting" | "confirmed";
/** Decorative state art. Its adjacent text is the authoritative status. */
export default function MotionSignal({
  kind,
  active = false,
  size = "small",
}: {
  kind: MotionKind;
  active?: boolean;
  size?: "small" | "medium";
}) {
  return (
    <svg
      viewBox="0 0 64 64"
      className={`motion-signal motion-signal--${kind} motion-signal--${size} ${active ? "is-active" : ""}`}
      aria-hidden="true"
      focusable="false"
      fill="none"
    >
      {kind === "alert" && (
        <>
          <circle className="motion-halo" cx="32" cy="32" r="26" />
          <path
            className="motion-alert-core"
            d="M32 12 49 28 45 40 32 51 19 40 15 28Z"
          />
          <path className="motion-alert-mark" d="M32 24v12m0 6h.01" />
        </>
      )}
      {kind === "reconnecting" && (
        <>
          <circle className="motion-track" cx="32" cy="32" r="26" />
          <circle className="motion-orbit" cx="32" cy="32" r="26" />
          <path
            className="motion-wifi"
            d="m22 22 20 20M19 29a21 21 0 0 1 8-4m8 0a21 21 0 0 1 10 4M24 35a14 14 0 0 1 8-3m5 1 3 2m-11 6a5 5 0 0 1 6 0m-3 6h.01"
          />
        </>
      )}
      {kind === "confirmed" && (
        <>
          <circle className="motion-confirm-disc" cx="32" cy="32" r="25" />
          <path
            className="motion-confirm-check"
            d="m20 32 8 8 17-18"
            pathLength="1"
          />
        </>
      )}
    </svg>
  );
}
