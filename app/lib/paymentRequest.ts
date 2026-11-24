/**
 * Et betalingskrav slik pay.plorea.no leser det.
 *
 * Kravet peker på et salgsdokument noen andre har utstedt: CRM-et eier
 * fakturaen og nummeret, vi gjør den betalbar. Derfor har denne siden ingen
 * MVA-oppstilling og ingen PDF av vår egen — `externalDocumentUrl` peker på
 * CRM-ets dokument hvis det finnes.
 *
 * Endepunktet krever ingen autentisering: tokenet i URL-en er hele
 * beskyttelsen, akkurat som lenke-id-en er på /{id}.
 */
import { PAYMENTS_API_BASE, PLOREA_TIMEOUT_MS, isTimeoutError } from "./paymentLink";

export type PaymentRequestLine = {
  description: string;
  quantity?: number;
  unit?: string;
  amount?: number;
};

export type PaymentRequest = {
  /**
   * Selgerens aksentfarge, HANDOFF §42.1.
   *
   * Fraværende når tenanten ikke har satt en — ikke null, ikke en
   * standardfarge. BrandAccent tegner ingenting da, og siden står i Done
   * Pay-fiolett som før. Om fargen kan leses avgjøres her og ikke av
   * API-et: usableBrandColor krever 4,5:1 mot hvitt, fordi fargen bærer
   * beløpet og betal-knappen.
   */
  brandColor?: string;
  externalNumber: string;
  externalDocumentUrl?: string;
  description?: string;
  lines?: PaymentRequestLine[];
  amount: number;
  currency: string;
  dueDate: string;
  status: "open" | "paid" | "overdue" | "cancelled";
  sellerName?: string;
  buyerName?: string;
  paymentLinkId?: string;
  paidAt?: string;
};

export type PaymentRequestResult =
  | { ok: true; request: PaymentRequest }
  | { ok: false; reason: "not-found" | "timeout" | "error" };

/** Kun http(s), som i paymentLink: verdien havner i en href. */
function safeUrl(value: unknown): string | undefined {
  if (typeof value !== "string" || !value) return undefined;
  try {
    const { protocol } = new URL(value);
    return protocol === "https:" || protocol === "http:" ? value : undefined;
  } catch {
    return undefined;
  }
}

function normalize(raw: Record<string, unknown>): PaymentRequest {
  const str = (v: unknown) => (typeof v === "string" && v ? v : undefined);
  const seller = raw.seller as Record<string, unknown> | undefined;
  const buyer = raw.buyer as Record<string, unknown> | undefined;
  const status = str(raw.status);

  return {
    /**
     * Selgerens farge, HANDOFF §42.1.
     *
     * Den måtte legges inn **her** og ikke bare i typen. Denne funksjonen
     * bygger svaret fra en navngitt liste, så et felt som ikke står i lista
     * blir borte uten at noe sier det — og det er samme felle
     * `buildPublicReceiptView` i API-et gikk i samme dag. Siden rendret,
     * svarte 200, og hadde ingen farge.
     *
     * `str` krever en ikke-tom streng; formen sjekkes der fargen brukes.
     */
    brandColor: str(raw.brandColor),
    externalNumber: str(raw.externalNumber) ?? "",
    externalDocumentUrl: safeUrl(raw.externalDocumentUrl),
    description: str(raw.description),
    lines: Array.isArray(raw.lines)
      ? (raw.lines as Record<string, unknown>[]).map((line) => ({
          description: str(line.description) ?? "",
          quantity: typeof line.quantity === "number" ? line.quantity : undefined,
          unit: str(line.unit),
          amount: typeof line.amount === "number" ? line.amount : undefined,
        }))
      : undefined,
    amount: typeof raw.amount === "number" ? raw.amount : 0,
    currency: str(raw.currency) ?? "NOK",
    dueDate: str(raw.dueDate) ?? "",
    status:
      status === "paid" || status === "overdue" || status === "cancelled"
        ? status
        : "open",
    sellerName: str(seller?.name),
    buyerName: str(buyer?.name),
    paymentLinkId: str(raw.paymentLinkId),
    paidAt: str(raw.paidAt),
  };
}

export async function fetchPaymentRequest(
  token: string
): Promise<PaymentRequestResult> {
  let response: Response;

  try {
    response = await fetch(
      `${PAYMENTS_API_BASE}/payment-requests/public/${encodeURIComponent(token)}`,
      {
        cache: "no-store",
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(PLOREA_TIMEOUT_MS),
      }
    );
  } catch (err) {
    console.error("Henting av betalingskrav feilet", err);
    return { ok: false, reason: isTimeoutError(err) ? "timeout" : "error" };
  }

  if (response.status === 404 || response.status === 410) {
    return { ok: false, reason: "not-found" };
  }

  if (!response.ok) {
    console.error(`Henting av betalingskrav feilet (${response.status})`);
    return { ok: false, reason: "error" };
  }

  try {
    const raw = (await response.json()) as Record<string, unknown>;
    return { ok: true, request: normalize(raw) };
  } catch (err) {
    console.error("Betalingskravet kunne ikke leses", err);
    return { ok: false, reason: isTimeoutError(err) ? "timeout" : "error" };
  }
}

/** «01.12.2026» fra «2026-12-01». */
export function formatDueDate(isoDate: string): string {
  const [y, m, d] = isoDate.split("-");
  return y && m && d ? `${d}.${m}.${y}` : isoDate;
}
