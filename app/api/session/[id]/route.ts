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

  const apiKey = isLive
    ? process.env.PLOREA_API_KEY_LIVE
    : process.env.PLOREA_API_KEY_TEST;

  if (!apiKey) {
    console.error(`Plorea API-nøkkel mangler for miljø ${link.environment}`);
    return Response.json({ error: "Betaling er ikke konfigurert" }, { status: 500 });
  }

  const clientKey = isLive
    ? process.env.ADYEN_CLIENT_KEY_LIVE
    : process.env.ADYEN_CLIENT_KEY_TEST;

  if (!clientKey) {
    console.error(`Adyen client key mangler for miljø ${link.environment}`);
    return Response.json({ error: "Betaling er ikke konfigurert" }, { status: 500 });
  }

  const setupResponse = await fetch(`${PAYMENTS_API_BASE}/payment-methods/setup/session`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      tenantId: link.tenantId,
      shopperReference: `pay-${id}-${Date.now()}`,
      recurringType: "UnscheduledCardOnFile",
      returnUrl: `${resolveOrigin(request)}/${id}`,
      amount: link.amount,
      currency: link.currency,
      reference: link.reference,
      product: link.product,
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
