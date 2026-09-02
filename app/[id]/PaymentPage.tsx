"use client";

import { useEffect, useRef, useState } from "react";
import "@adyen/adyen-web/styles/adyen.css";
import { formatAmount, type PaymentLink } from "@/app/lib/paymentLink";

// Juster til de faktiske Done-sidene når de er på plass.
const TERMS_URL = "https://done.no/vilkar";
const PRIVACY_URL = "https://done.no/personvern";

type Status =
  | { kind: "loading" }
  | { kind: "ready" }
  | { kind: "verifying" }
  | { kind: "success" }
  | { kind: "pending"; message: string }
  | { kind: "error"; message: string };

type SessionResponse = {
  sessionId: string;
  sessionData: string;
  clientKey: string;
  environment: "test" | "live";
};

type ConfigResponse = {
  clientKey: string;
  environment: "test" | "live";
};

function messageForResultCode(resultCode: string): Status {
  switch (resultCode) {
    case "Pending":
    case "Received":
      return {
        kind: "pending",
        message:
          "Betalingen er mottatt og under behandling. Du får beskjed så snart den er bekreftet.",
      };
    case "Refused":
      return {
        kind: "error",
        message: "Betalingen ble avvist. Prøv et annet kort eller kontakt banken din.",
      };
    case "Cancelled":
      return { kind: "error", message: "Betalingen ble avbrutt." };
    default:
      return {
        kind: "error",
        message: "Betalingen kunne ikke fullføres. Prøv igjen om litt.",
      };
  }
}

/** Adyen lagrer sesjonen i localStorage før redirect — fallback når URL-en mangler sessionId. */
function storedSessionId(): string | null {
  try {
    const raw = window.localStorage.getItem("adyen-checkout__session");
    const stored = raw ? (JSON.parse(raw) as { id?: string }) : null;
    return stored?.id ?? null;
  } catch {
    return null;
  }
}

/** Engangsparameterne skal ikke bli liggende — en refresh må ikke fullføre på nytt. */
function stripRedirectParams() {
  const url = new URL(window.location.href);
  url.searchParams.delete("redirectResult");
  url.searchParams.delete("sessionId");
  url.searchParams.delete("sessionResult");
  window.history.replaceState(null, "", url.toString());
}

export default function PaymentPage({ link }: { link: PaymentLink }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const redirectHandledRef = useRef(false);
  const [status, setStatus] = useState<Status>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    let dropin: { unmount: () => void } | null = null;

    const applyResultCode = (resultCode: string) =>
      setStatus(
        resultCode === "Authorised"
          ? { kind: "success" }
          : messageForResultCode(resultCode)
      );

    const reportAdyenError = (error: unknown) => {
      console.error("Adyen-feil", error);
      setStatus({
        kind: "error",
        message: "Noe gikk galt med betalingen. Last siden på nytt og prøv igjen.",
      });
    };

    // Kunden kommer tilbake fra Vipps/3DS med ?redirectResult=… — da skal betalingen
    // fullføres, ikke startes på nytt. Statusoppdateringene her sjekker ikke `cancelled`:
    // React kjører effekten to ganger i dev, og runde to hopper over jobben (se ref-en).
    async function completeRedirect(redirectResult: string) {
      try {
        // GET oppretter ingen ny sesjon — den gir bare client key og miljø.
        const response = await fetch(`/api/session/${link.id}`);
        if (!response.ok) {
          throw new Error(`Konfigurasjon feilet: ${response.status}`);
        }

        const config = (await response.json()) as ConfigResponse;

        // Adyen sender sessionId tilbake i URL-en; sessionData ligger igjen i
        // localStorage og hentes av SDK-en når vi kun oppgir id-en.
        const sessionId =
          new URLSearchParams(window.location.search).get("sessionId") ??
          storedSessionId();

        if (!sessionId) {
          throw new Error("Fant ingen sessionId å fullføre betalingen mot");
        }

        const { AdyenCheckout } = await import("@adyen/adyen-web/auto");

        const checkout = await AdyenCheckout({
          environment: config.environment,
          clientKey: config.clientKey,
          session: { id: sessionId } as { id: string; sessionData: string },
          locale: "nb-NO",
          countryCode: "NO",
          amount: { value: link.amount, currency: link.currency },
          onPaymentCompleted: (data) => applyResultCode(data.resultCode),
          onPaymentFailed: (data) =>
            setStatus(messageForResultCode(data?.resultCode ?? "")),
          onError: reportAdyenError,
        });

        checkout.submitDetails({ details: { redirectResult } });
      } catch (error) {
        console.error("Kunne ikke fullføre betalingen etter redirect", error);
        setStatus({
          kind: "error",
          message:
            "Vi fikk ikke bekreftet betalingen. Ta kontakt hvis beløpet er trukket fra kontoen din.",
        });
      } finally {
        stripRedirectParams();
      }
    }

    async function setup() {
      try {
        const response = await fetch(`/api/session/${link.id}`, { method: "POST" });
        if (!response.ok) {
          throw new Error(`Sesjon feilet: ${response.status}`);
        }

        const session = (await response.json()) as SessionResponse;
        const { AdyenCheckout, Dropin, Card } = await import("@adyen/adyen-web/auto");

        if (cancelled || !containerRef.current) return;

        const checkout = await AdyenCheckout({
          environment: session.environment,
          clientKey: session.clientKey,
          session: { id: session.sessionId, sessionData: session.sessionData },
          locale: "nb-NO",
          countryCode: "NO",
          amount: { value: link.amount, currency: link.currency },
          onPaymentCompleted: (data) => applyResultCode(data.resultCode),
          onPaymentFailed: (data) =>
            setStatus(messageForResultCode(data?.resultCode ?? "")),
          onError: reportAdyenError,
        });

        if (cancelled || !containerRef.current) return;

        // Card må registreres eksplisitt, ellers feiler Drop-in med «'scheme' component not configured».
        // Utover det er ingen metoder hardkodet — Drop-in viser kun det som er aktivert på kontoen.
        dropin = new Dropin(checkout, {
          paymentMethodComponents: [Card],
        }).mount(containerRef.current);
        setStatus({ kind: "ready" });
      } catch (error) {
        if (cancelled) return;
        console.error("Kunne ikke starte betalingen", error);
        setStatus({
          kind: "error",
          message: "Vi fikk ikke startet betalingen. Prøv igjen om litt.",
        });
      }
    }

    const redirectResult = new URLSearchParams(window.location.search).get(
      "redirectResult"
    );

    if (redirectResult) {
      if (!redirectHandledRef.current) {
        redirectHandledRef.current = true;
        setStatus({ kind: "verifying" });
        completeRedirect(redirectResult);
      }
      return;
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
  }, [link.id, link.amount, link.currency]);

  // La success-meldingen stå litt før vi sender kunden tilbake til avsender.
  useEffect(() => {
    const returnUrl = link.returnUrl;
    if (status.kind !== "success" || !returnUrl) return;

    const timer = setTimeout(() => {
      window.location.href = returnUrl;
    }, 2000);

    return () => clearTimeout(timer);
  }, [status.kind, link.returnUrl]);

  const merchantName = link.merchantName ?? "Betaling";
  const initial = merchantName.trim().charAt(0).toUpperCase() || "•";
  const showDropin = status.kind === "loading" || status.kind === "ready";

  return (
    <main className="pay-shell">
      <div className="pay-card">
        <section className="pay-summary">
          <div className="pay-merchant">
            <span className="pay-avatar" aria-hidden="true">
              {initial}
            </span>
            <span className="pay-merchant-name">{merchantName}</span>
          </div>

          <dl className="pay-details">
            {link.reference ? (
              <div className="pay-detail">
                <dt>Referanse</dt>
                <dd>{link.reference}</dd>
              </div>
            ) : null}
            {link.product ? (
              <div className="pay-detail">
                <dt>Gjelder</dt>
                <dd>{link.product}</dd>
              </div>
            ) : null}
            {link.orgNr ? (
              <div className="pay-detail">
                <dt>Org.nr</dt>
                <dd>{link.orgNr}</dd>
              </div>
            ) : null}
          </dl>

          <div className="pay-total">
            <span className="pay-total-label">Å betale</span>
            <span className="pay-total-value">
              {formatAmount(link.amount, link.currency)}
            </span>
          </div>

          {link.invoice_url ? (
            <a
              href={link.invoice_url}
              target="_blank"
              rel="noopener noreferrer"
              className="pay-button-secondary"
            >
              Last ned faktura
            </a>
          ) : null}
        </section>

        <section className="pay-checkout">
          {status.kind === "loading" ? (
            <p className="pay-status pay-status-muted">Laster betalingsmåter …</p>
          ) : null}

          {status.kind === "verifying" ? (
            <p className="pay-status pay-status-muted">Bekrefter betalingen …</p>
          ) : null}

          {status.kind === "success" ? (
            <div className="pay-result">
              <span className="pay-result-icon pay-result-icon-success" aria-hidden="true">
                ✓
              </span>
              <h2 className="pay-result-title">Betalingen er gjennomført</h2>
              <p className="pay-result-body">
                Takk! Kvittering sendes til deg{link.email ? ` på ${link.email}` : ""}.
                {link.returnUrl ? " Du sendes tilbake om et øyeblikk …" : ""}
              </p>
            </div>
          ) : null}

          {status.kind === "pending" ? (
            <div className="pay-result">
              <span className="pay-result-icon" aria-hidden="true">
                ⏳
              </span>
              <h2 className="pay-result-title">Betalingen behandles</h2>
              <p className="pay-result-body">{status.message}</p>
            </div>
          ) : null}

          {status.kind === "error" ? (
            <div className="pay-result">
              <span className="pay-result-icon pay-result-icon-error" aria-hidden="true">
                !
              </span>
              <h2 className="pay-result-title">Betalingen ble ikke fullført</h2>
              <p className="pay-result-body">{status.message}</p>
            </div>
          ) : null}

          <div
            ref={containerRef}
            id="dropin-container"
            style={showDropin ? undefined : { display: "none" }}
          />

          <p className="pay-footer">
            Ingen gebyr · Drevet av{" "}
            <span className="wordmark">
              done<span className="wordmark-degree">°</span>
            </span>{" "}
            <span className="pay-footer-sep">|</span>{" "}
            <a href={TERMS_URL} target="_blank" rel="noreferrer">
              Vilkår
            </a>{" "}
            <span className="pay-footer-sep">|</span>{" "}
            <a href={PRIVACY_URL} target="_blank" rel="noreferrer">
              Personvern
            </a>
          </p>
        </section>
      </div>
    </main>
  );
}
