"use client";

import { useEffect, useRef, useState } from "react";
import "@adyen/adyen-web/styles/adyen.css";

type Props = {
  sessionId: string | null;
  sessionData: string | null;
  clientKey: string | null;
  environment: "test" | "live";
};

type Status =
  | { kind: "loading" }
  | { kind: "ready" }
  | { kind: "done"; resultCode: string; raw: unknown }
  | { kind: "error"; message: string; raw?: unknown };

/**
 * Leser en parameter rett fra den rå query-strengen. URLSearchParams (og dermed
 * Next sine searchParams) gjør «+» om til mellomrom, noe som ødelegger base64 i
 * sessionData når den er limt inn uten URL-koding. decodeURIComponent lar «+» stå.
 */
function rawSearchParam(name: string): string | null {
  for (const part of window.location.search.slice(1).split("&")) {
    const eq = part.indexOf("=");
    const key = eq === -1 ? part : part.slice(0, eq);
    if (key !== name) continue;
    const value = eq === -1 ? "" : part.slice(eq + 1);
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }
  return null;
}

export default function SetupTest({ sessionId, sessionData, clientKey, environment }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const missing = [
    !sessionId && "sessionId",
    !sessionData && "sessionData",
    !clientKey && "clientKey",
  ].filter(Boolean) as string[];
  const [status, setStatus] = useState<Status>(
    missing.length
      ? { kind: "error", message: `Mangler URL-parametere: ${missing.join(", ")}` }
      : { kind: "loading" }
  );

  useEffect(() => {
    if (!sessionId || !sessionData || !clientKey) return;

    let cancelled = false;
    let dropin: { unmount: () => void } | null = null;

    async function setup() {
      try {
        const { AdyenCheckout, Dropin, Card } = await import("@adyen/adyen-web/auto");
        if (cancelled || !containerRef.current) return;

        const checkout = await AdyenCheckout({
          environment,
          clientKey: clientKey!,
          session: {
            id: sessionId!,
            sessionData: rawSearchParam("sessionData") ?? sessionData!,
          },
          locale: "nb-NO",
          countryCode: "NO",
          onPaymentCompleted: (data) =>
            setStatus({ kind: "done", resultCode: data.resultCode, raw: data }),
          onPaymentFailed: (data) =>
            setStatus({ kind: "done", resultCode: data?.resultCode ?? "Ukjent", raw: data }),
          onError: (error) => {
            console.error("Adyen-feil", error);
            setStatus({ kind: "error", message: String(error?.message ?? error), raw: error });
          },
        });

        if (cancelled || !containerRef.current) return;

        dropin = new Dropin(checkout, {
          paymentMethodComponents: [Card],
        }).mount(containerRef.current);
        setStatus({ kind: "ready" });
      } catch (error) {
        if (cancelled) return;
        console.error("Kunne ikke starte Drop-in", error);
        setStatus({
          kind: "error",
          message: error instanceof Error ? error.message : String(error),
          raw: error,
        });
      }
    }

    setup();

    return () => {
      cancelled = true;
      try {
        dropin?.unmount();
      } catch {
        // Drop-in var allerede fjernet.
      }
    };
  }, [sessionId, sessionData, clientKey, environment]);

  const showDropin = status.kind === "loading" || status.kind === "ready";

  return (
    <main style={{ maxWidth: 560, margin: "0 auto", padding: 16, fontFamily: "system-ui, sans-serif" }}>
      <div
        role="alert"
        style={{
          background: "#fff4e5",
          border: "1px solid #f0a020",
          color: "#6b3d00",
          borderRadius: 8,
          padding: "12px 16px",
          marginBottom: 24,
        }}
      >
        <strong>⚠️ Testside — ikke del denne URL-en.</strong> Miljø: <code>{environment}</code>
      </div>

      <h1 style={{ fontSize: 20, marginBottom: 16 }}>Test: kortregistrering</h1>

      {status.kind === "loading" ? <p>Laster Drop-in …</p> : null}

      {status.kind === "done" ? (
        <section>
          <p>
            Resultat:{" "}
            <strong style={{ color: status.resultCode === "Authorised" ? "green" : "crimson" }}>
              {status.resultCode}
            </strong>
          </p>
          <pre style={{ background: "#f4f4f4", padding: 12, overflowX: "auto", fontSize: 12 }}>
            {JSON.stringify(status.raw, null, 2)}
          </pre>
        </section>
      ) : null}

      {status.kind === "error" ? (
        <section>
          <p style={{ color: "crimson" }}>Feil: {status.message}</p>
          {status.raw ? (
            <pre style={{ background: "#f4f4f4", padding: 12, overflowX: "auto", fontSize: 12 }}>
              {JSON.stringify(status.raw, Object.getOwnPropertyNames(status.raw), 2)}
            </pre>
          ) : null}
        </section>
      ) : null}

      <div ref={containerRef} style={showDropin ? undefined : { display: "none" }} />
    </main>
  );
}
