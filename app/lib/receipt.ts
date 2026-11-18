/**
 * En kvittering slik pay.plorea.no leser den.
 *
 * Kvitteringen er **betalingsdokumentasjon og ikke et salgsdokument** — Dones
 * beslutning 18. november 2026, og `disclaimer` under er setningen som sier det
 * på siden. Vi finner ikke opp den teksten her: API-et sender den, slik at den
 * står ett sted og ikke to.
 *
 * Endepunktet krever ingen autentisering. **Tokenet** i URL-en er hele
 * beskyttelsen, akkurat som på /krav/{token} og lenke-id-en på /{id}. Derfor
 * svarer API-et med nøyaktig det PDF-en viser og ikke ett felt mer.
 *
 * Det var referansen `sub_...-chg_...` fram til 18. november 2026, og det var
 * feil: referansen sendes til tenanten i `subscription.charge_succeeded` og
 * ligger i databasen og loggene deres, så alle som hadde sett en webhook kunne
 * åpne en navngitt kundes adresse, org.nr. og fire siste kortsiffer. Nå er det
 * et tilfeldig 128-bits token, og referansen gir 404.
 *
 * `status` er «pending» til PDF-en finnes. Det er hele grunnen til at
 * `receiptUrl` i `subscription.charge_succeeded` peker hit og ikke rett på
 * fila: hendelsen går ut i det pengene flyttes, og dokumentet rendres noen
 * sekunder senere av en annen funksjon. En side kan si «lages nå»; en 404 kan
 * bare se ødelagt ut.
 */
import { PAYMENTS_API_BASE, PLOREA_TIMEOUT_MS, isTimeoutError } from "./paymentLink";

export type ReceiptLine = {
  description: string;
  quantity: number;
  unitAmount: number;
  lineAmount: number;
  vatRate?: number;
};

export type ReceiptVatGroup = {
  vatRate: number | null;
  vat: number;
  gross: number;
};

export type ReceiptParty = {
  name: string;
  orgNr?: string;
  orgNrFormatted?: string;
  email?: string;
  phone?: string;
  address?: {
    line1?: string;
    line2?: string;
    postalCode?: string;
    city?: string;
    country?: string;
  };
};

export type Receipt = {
  status: "ready" | "pending";
  receiptNumber: string | null;
  // Ingen `reference`: den som holder tokenet har ingen bruk for
  // `sub_...-chg_...`, og et felt siden ikke viser er et felt som ikke skal
  // sendes. Tenanten får den på sitt eget autentiserte endepunkt.
  paidAt: string | null;
  currency: string;
  seller: ReceiptParty | null;
  customer: ReceiptParty | null;
  lines: ReceiptLine[];
  total: number;
  vatAmount: number;
  vatByRate: ReceiptVatGroup[];
  paid: number;
  refunded: number;
  card: { brand: string | null; last4: string | null } | null;
  // Selgerens egen setning, når de har skrevet en. Null ellers: siden viser
  // ingenting i stedet for en høflighetsfrase vi fant på for dem.
  note: string | null;
  fileUrl: string | null;
  disclaimer: string;
};

export type ReceiptResult =
  | { ok: true; receipt: Receipt }
  | { ok: false; reason: "not-found" | "timeout" | "error" };

export async function fetchReceipt(token: string): Promise<ReceiptResult> {
  let response: Response;

  try {
    response = await fetch(
      `${PAYMENTS_API_BASE}/receipts/public/${encodeURIComponent(token)}`,
      {
        // Aldri cache: en ventende kvittering blir ferdig om et par sekunder,
        // og en side som husker «pending» ville stått fast på det.
        cache: "no-store",
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(PLOREA_TIMEOUT_MS),
      }
    );
  } catch (err) {
    console.error("Henting av kvittering feilet", err);
    return { ok: false, reason: isTimeoutError(err) ? "timeout" : "error" };
  }

  // API-et svarer samme 404 for et token som ikke finnes, en referanse brukt
  // der tokenet skal stå, en tenant som ikke har kvitteringer på, og et trekk
  // som ikke gikk gjennom. Siden skal ikke prøve å skille dem — det er nettopp
  // poenget med at de er like.
  if (response.status === 404 || response.status === 410) {
    return { ok: false, reason: "not-found" };
  }

  if (!response.ok) {
    console.error(`Henting av kvittering feilet (${response.status})`);
    return { ok: false, reason: "error" };
  }

  try {
    return { ok: true, receipt: (await response.json()) as Receipt };
  } catch (err) {
    console.error("Kvitteringen kunne ikke leses", err);
    return { ok: false, reason: "error" };
  }
}

/**
 * `Visa •••• 1111`, med stor forbokstav.
 *
 * Leverandøren sender en kodet merkelapp og ikke et navn — `visa`, `mc` — og
 * den rå verdien gir «MC •••• 1111», som ikke er det som står på kortet
 * leseren holder i hånden. Samme tabell som i dokumentgeneratoren, fordi
 * siden og PDF-en skal si det samme ordet om det samme kortet.
 */
const CARD_BRANDS: Record<string, string> = {
  visa: "Visa",
  mc: "Mastercard",
  mastercard: "Mastercard",
  amex: "American Express",
  maestro: "Maestro",
  diners: "Diners Club",
  discover: "Discover",
  jcb: "JCB",
  unionpay: "UnionPay",
  bcmc: "Bancontact",
};

export function cardLabel(card: Receipt["card"]): string {
  if (!card || (!card.brand && !card.last4)) return "Kort";
  const raw = (card.brand ?? "").trim();
  const brand = raw
    ? CARD_BRANDS[raw.toLowerCase()] ??
      raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase()
    : "Kort";
  return card.last4 ? `${brand} •••• ${card.last4}` : brand;
}

/** 25 % i stedet for 0.25, og 12,5 % i stedet for 12.5 %. */
export function formatVatRate(rate: number | null): string {
  if (rate === null || rate === undefined) return "uten MVA";
  const pct = rate * 100;
  const text = Number.isInteger(pct) ? String(pct) : pct.toFixed(1).replace(".", ",");
  return `${text} %`;
}

export function formatReceiptDate(iso: string | null): string {
  if (!iso) return "–";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "–";
  return date.toLocaleDateString("nb-NO", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

/**
 * `915006620` -> `915 006 620`.
 *
 * Selgeren kommer ferdig formatert fra API-et; kunden gjør ikke det, fordi
 * kundeblokken er fryst nøyaktig slik den ble sendt inn. Et niende siffer
 * grupperes i tre og tre som nordmenn leser det, og alt annet vises som det er
 * heller enn å bli stokket om til noe som ser riktig ut og ikke er det.
 */
export function formatOrgNr(value: string | undefined | null): string | null {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length !== 9) return digits;
  return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
}

/** Adressen som de to eller tre linjene en leser forventer. */
export function addressLines(address: ReceiptParty["address"]): string[] {
  if (!address) return [];
  const out: string[] = [];
  if (address.line1) out.push(address.line1);
  if (address.line2) out.push(address.line2);
  const town = [address.postalCode, address.city].filter(Boolean).join(" ");
  if (town) out.push(town);
  if (address.country && address.country !== "NO") out.push(address.country);
  return out;
}
