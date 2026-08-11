export const PAYMENTS_API_BASE =
  process.env.PLOREA_API_BASE ?? "https://payments.plorea.no";

/** Betalingslenke slik pay.plorea.no bruker den. Beløp er i minste enhet (øre). */
export type PaymentLink = {
  id: string;
  tenantId?: string;
  reference?: string;
  product?: string;
  amount: number;
  currency: string;
  merchantName?: string;
  orgNr?: string;
  email?: string;
  expired: boolean;
};

export type PaymentLinkResult =
  | { ok: true; link: PaymentLink }
  | { ok: false; reason: "not-found" | "error" };

function normalize(id: string, raw: Record<string, unknown>): PaymentLink {
  const str = (v: unknown) => (typeof v === "string" && v ? v : undefined);

  return {
    id,
    tenantId: str(raw.tenantId),
    reference: str(raw.reference),
    product: str(raw.product),
    amount: typeof raw.amount === "number" ? raw.amount : 0,
    currency: str(raw.currency) ?? "NOK",
    merchantName: str(raw.merchantName),
    orgNr: str(raw.merchantOrgNr) ?? str(raw.orgNr),
    email: str(raw.email) ?? str(raw.shopperEmail),
    expired: raw.expired === true || str(raw.status) === "expired",
  };
}

/** Henter betalingslenken fra Plorea. Endepunktet krever ingen autentisering. */
export async function fetchPaymentLink(id: string): Promise<PaymentLinkResult> {
  let response: Response;

  try {
    response = await fetch(`${PAYMENTS_API_BASE}/pay/${encodeURIComponent(id)}`, {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
  } catch {
    return { ok: false, reason: "error" };
  }

  if (response.status === 404 || response.status === 410) {
    return { ok: false, reason: "not-found" };
  }

  if (!response.ok) {
    return { ok: false, reason: "error" };
  }

  try {
    const raw = (await response.json()) as Record<string, unknown>;
    return { ok: true, link: normalize(id, raw) };
  } catch {
    return { ok: false, reason: "error" };
  }
}

/** Formaterer minste enhet (øre) til «1 234,00 kr». */
export function formatAmount(minorUnits: number, currency: string): string {
  return new Intl.NumberFormat("nb-NO", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(minorUnits / 100);
}
