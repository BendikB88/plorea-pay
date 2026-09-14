import { connection } from "next/server";
import { PAYMENTS_API_BASE, PLOREA_TIMEOUT_MS } from "@/app/lib/paymentLink";

const TEST_LINK_URL = "https://payments.plorea.no/pay/pl_a50abf0d947143bbb6c78532";

/** Kaller en kjent betalingslenke direkte og rapporterer hva Plorea svarer. */
async function probeTestLink() {
  const started = Date.now();

  try {
    const response = await fetch(TEST_LINK_URL, {
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(PLOREA_TIMEOUT_MS),
    });

    const text = await response.text();
    const base = {
      url: TEST_LINK_URL,
      status: response.status,
      ms: Date.now() - started,
      contentType: response.headers.get("content-type"),
    };

    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      return { ...base, error: "Svaret var ikke JSON", bodySnippet: text.slice(0, 500) };
    }

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return { ...base, body };
    }

    // sessionData er en hemmelighet for Adyen-sesjonen — skal aldri ut herfra.
    const { sessionData: _omitted, ...fields } = body as Record<string, unknown>;
    return { ...base, keys: Object.keys(body), fields };
  } catch (err) {
    const error = err as Error & { cause?: { code?: string } };
    return {
      url: TEST_LINK_URL,
      ms: Date.now() - started,
      error: error.name,
      cause: error.cause?.code,
      message: error.message,
    };
  }
}

/**
 * Debug: viser om API-nøklene er satt i kjøremiljøet — aldri verdiene.
 * Statisk segment, så det vinner over /api/session/[id].
 */
export async function GET() {
  // Les env ved forespørsel, ikke ved bygging.
  await connection();

  return Response.json({
    ploreaApiKeyTestSet: Boolean(process.env.PLOREA_API_KEY_TEST),
    ploreaApiKeyLiveSet: Boolean(process.env.PLOREA_API_KEY_LIVE),
    paymentsApiBase: PAYMENTS_API_BASE,
    testLink: await probeTestLink(),
  });
}
