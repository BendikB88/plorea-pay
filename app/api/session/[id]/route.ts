import type { NextRequest } from "next/server";
import { PAYMENTS_API_BASE, fetchPaymentLink } from "@/app/lib/paymentLink";

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
  if (!result.ok) {
    return Response.json(
      { error: "Fant ikke betalingslenken" },
      { status: result.reason === "not-found" ? 404 : 502 }
    );
  }

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
  const setupResponse = await fetch(`${PAYMENTS_API_BASE}/payments/session`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      paymentLinkId: id,
      returnUrl: `${resolveOrigin(request)}/${id}`,
    }),
    cache: "no-store",
  });

  if (!setupResponse.ok) {
    console.error(
      `Sesjonsoppretting feilet (${setupResponse.status})`,
      await setupResponse.text()
    );
    return Response.json({ error: "Kunne ikke starte betalingen" }, { status: 502 });
  }

  const session = (await setupResponse.json()) as {
    sessionId?: string;
    sessionData?: string;
  };

  if (!session.sessionId || !session.sessionData) {
    console.error("Sesjonssvaret manglet sessionId/sessionData");
    return Response.json({ error: "Kunne ikke starte betalingen" }, { status: 502 });
  }

  return Response.json({
    sessionId: session.sessionId,
    sessionData: session.sessionData,
    clientKey,
    environment: link.environment,
  });
}
