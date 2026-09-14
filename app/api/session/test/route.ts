import { connection } from "next/server";
import { PAYMENTS_API_BASE } from "@/app/lib/paymentLink";

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
  });
}
