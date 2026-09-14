import type { NextRequest } from "next/server";
import {
  PAYMENTS_API_BASE,
  PLOREA_TIMEOUT_MS,
  fetchPaymentLink,
  isTimeoutError,
  type PaymentLinkResult,
} from "@/app/lib/paymentLink";

/** 404 når lenken ikke finnes, 504 ved timeout mot Plorea, ellers 502. */
function linkErrorResponse(reason: Extract<PaymentLinkResult, { ok: false }>["reason"]) {
  if (reason === "not-found") {
    return Response.json({ error: "Fant ikke betalingslenken" }, { status: 404 });
  }

  return Response.json(
    { error: "Kunne ikke hente betalingslenken" },
    { status: reason === "timeout" ? 504 : 502 }
  );
}

/** Origin slik nettleseren ser den — Adyen krever at returnUrl matcher client key sine origins. */
function resolveOrigin(request: NextRequest): string {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");

  if (host) {
    const proto = request.headers.get("x-forwarded-proto") ?? "https";
    return `${proto}://${host}`;
  }

  return new URL(request.url).origin;
}

export async function POST(
  request: NextRequest,
  ctx: RouteContext<"/api/session/[id]">
) {
  const { id } = await ctx.params;

  const result = await fetchPaymentLink(id);
  if (!result.ok) return linkErrorResponse(result.reason);

  const { link } = result;
  if (link.expired) {
    return Response.json({ error: "Betalingslenken er utløpt" }, { status: 410 });
  }

  // Miljøet på lenken avgjør hvilket nøkkelpar vi bruker — både mot Plorea og Adyen.
  const isLive = link.environment === "live";

  // /payments/session er uautentisert — paymentLinkId er hemmeligheten. Nøkkelen
  // sendes likevel når den finnes, men mangler den er det ikke lenger blokkerende.
  const apiKey = isLive
    ? process.env.PLOREA_API_KEY_LIVE
    : process.env.PLOREA_API_KEY_TEST;

  const clientKey = isLive
    ? process.env.ADYEN_CLIENT_KEY_LIVE
    : process.env.ADYEN_CLIENT_KEY_TEST;

  if (!clientKey) {
    console.error(`Adyen client key mangler for miljø ${link.environment}`);
    return Response.json({ error: "Betaling er ikke konfigurert" }, { status: 500 });
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
    "X-Environment": isLive ? "live" : "test",
  };

  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  // Engangsbetaling: beløp, referanse, splits og merchant hentes fra link-recorden
  // på serversiden, så vi sender kun lenke-id og hvor kunden skal tilbake.
  let setupResponse: Response;
  try {
    setupResponse = await fetch(`${PAYMENTS_API_BASE}/payments/session`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        paymentLinkId: id,
        returnUrl: `${resolveOrigin(request)}/${id}`,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(PLOREA_TIMEOUT_MS),
    });
  } catch (err) {
    console.error(`Sesjonsoppretting for lenke ${id} feilet`, err);
    return Response.json(
      { error: "Kunne ikke starte betalingen" },
      { status: isTimeoutError(err) ? 504 : 502 }
    );
  }

  if (!setupResponse.ok) {
    const { status } = setupResponse;
    const body = await setupResponse.text().catch(() => "");
    console.error(`Sesjonsoppretting for lenke ${id} feilet (${status})`, body.slice(0, 500));

    // 404/409 sendes videre så klienten ser hva som skjedde; alt annet er en feil hos Plorea.
    return Response.json(
      { error: "Kunne ikke starte betalingen" },
      { status: status === 404 || status === 409 ? status : 502 }
    );
  }

  // Plorea kan sende videre Adyen sitt sesjonssvar (id/data) i stedet for sessionId/sessionData.
  let session: { sessionId?: string; id?: string; sessionData?: string; data?: string };
  try {
    session = ((await setupResponse.json()) ?? {}) as typeof session;
  } catch (err) {
    console.error(`Sesjonssvaret for lenke ${id} kunne ikke leses`, err);
    return Response.json(
      { error: "Kunne ikke starte betalingen" },
      { status: isTimeoutError(err) ? 504 : 502 }
    );
  }

  const sessionId = session.sessionId ?? session.id;
  const sessionData = session.sessionData ?? session.data;

  if (!sessionId || !sessionData) {
    console.error(
      `Sesjonssvaret for lenke ${id} manglet sessionId/sessionData`,
      Object.keys(session)
    );
    return Response.json({ error: "Kunne ikke starte betalingen" }, { status: 502 });
  }

  return Response.json({
    sessionId,
    sessionData,
    clientKey,
    environment: link.environment,
  });
}

/**
 * Konfigurasjon uten å opprette sesjon. Brukes når kunden kommer tilbake fra en
 * redirect (Vipps, 3DS) og betalingen bare skal fullføres — da finnes sesjonen
 * allerede, og lenken kan ha blitt markert som betalt/utløpt i mellomtiden.
 */
export async function GET(
  _request: NextRequest,
  ctx: RouteContext<"/api/session/[id]">
) {
  const { id } = await ctx.params;

  const result = await fetchPaymentLink(id);
  if (!result.ok) return linkErrorResponse(result.reason);

  const { link } = result;
  const clientKey =
    link.environment === "live"
      ? process.env.ADYEN_CLIENT_KEY_LIVE
      : process.env.ADYEN_CLIENT_KEY_TEST;

  if (!clientKey) {
    console.error(`Adyen client key mangler for miljø ${link.environment}`);
    return Response.json({ error: "Betaling er ikke konfigurert" }, { status: 500 });
  }

  return Response.json({ clientKey, environment: link.environment });
}
