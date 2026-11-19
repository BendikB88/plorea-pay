/**
 * En faktura eller kreditnota slik pay.plorea.no leser den.
 *
 * Fakturaen er **regnskapsbilaget** — til forskjell fra kvitteringen, som er
 * betalingsdokumentasjon. Det er ikke en nyanse: en faktura må oppfylle
 * bokføringsforskriften kapittel 5, og derfor har denne siden felt
 * kvitteringen ikke har — selgerens registerstatus, leveringstidspunkt,
 * kjøperens adresse og MVA spesifisert per sats.
 *
 * Endepunktet krever ingen autentisering. **Tokenet** i URL-en er hele
 * beskyttelsen, akkurat som på /kvittering/{token} og /krav/{token}. Det er 32
 * tilfeldige byte og står bare i e-posten og i denne adressen — en lekket
 * `invoiceId` skal ikke være et lesbart dokument.
 *
 * Et **utkast** svarer 404 her, også for den som holder tokenet. Et utkast har
 * ingen nummer og er ikke et dokument.
 */
import { PAYMENTS_API_BASE, PLOREA_TIMEOUT_MS, isTimeoutError } from "./paymentLink";

export type InvoiceAddress = {
  line1?: string;
  line2?: string;
  postalCode?: string;
  city?: string;
  country?: string;
};

export type InvoiceLine = {
  lineId?: string;
  description: string;
  quantity: number;
  unit?: string;
  unitAmount: number;
  vatRate?: number;
  /** `inclusive` eller `exclusive`. Avgjør hva prisoverskriften sier. */
  taxBehavior?: "inclusive" | "exclusive";
  discountAmount?: number;
  /**
   * Perioden linjen dekker, når den dekker tid.
   *
   * «Medlemskap» sier ikke hvilken måned. Den står på linjen og ikke på
   * dokumentet, fordi en faktura kan ha flere linjer for flere perioder.
   */
  periodStart?: string | null;
  periodEnd?: string | null;
  net?: number;
  vat?: number;
  gross?: number;
};

export type InvoiceTotals = {
  net: number;
  vat: number;
  gross: number;
  /** MVA per sats, som kapittel 5 krever. Nøkkelen er satsen som brøk: «0.25». */
  vatByRate?: Record<string, number>;
  currency: string;
};

export type InvoiceSeller = {
  name: string;
  /**
   * Ferdig formatert av API-et: `NO 979 684 002 MVA`, uten suffikset for et
   * selskap som ikke er MVA-registrert. Vi setter den ikke sammen her — det
   * suffikset er en påstand om selskapet, og den skal stå ett sted.
   */
  orgNrLine?: string | null;
  address?: InvoiceAddress | null;
  email?: string | null;
  phone?: string | null;
};

export type InvoiceBuyer = {
  name: string;
  orgNr?: string | null;
  email?: string | null;
  address?: InvoiceAddress | null;
  /** Kjøperens eget ordrenummer. Uten den kan systemet deres ikke matche. */
  reference?: string | null;
};

export type PublicInvoice = {
  documentType: "invoice" | "credit_note";
  /**
   * Et testdokument kunngjør seg selv.
   *
   * Et dokument fra testmiljøet som ser ut som en faktura havner i en innboks,
   * blir skrevet ut, og noen prøver å bokføre det. Banneret står øverst, og
   * live får ingenting.
   */
  isTest?: boolean;
  invoiceNumber: string | null;
  /**
   * Den **leste** statusen. `overdue` er ikke lagret noe sted: den utledes av
   * forfallsdatoen hver gang, så siden aldri sier «sent» om noe som ble
   * forfalt i natt.
   */
  status: string;
  invoiceDate: string | null;
  dueDate: string | null;
  deliveryDate: string | null;
  deliveryPeriod: { from?: string; to?: string } | null;
  deliveryPlace: InvoiceAddress | null;
  seller: InvoiceSeller | null;
  buyer: InvoiceBuyer | null;
  lines: InvoiceLine[];
  totals: InvoiceTotals | null;
  /** Gross minus betalt minus kreditert, i øre. Aldri negativ. */
  outstanding: number;
  note: string | null;
  /** Hvem som utstedte dokumentet og for hvem. Kommer fra API-et. */
  issuerStatement: string | null;
  creditsInvoice: string | null;
  paidAt: string | null;
  hasPdf: boolean;
  /** Betalingslenken, når det er noe utestående og fakturaen er sendt. */
  paymentLinkId?: string | null;
};

export type InvoiceResult =
  | { ok: true; invoice: PublicInvoice }
  | { ok: false; reason: "not-found" | "timeout" | "error" };

export async function fetchInvoice(token: string): Promise<InvoiceResult> {
  let response: Response;

  try {
    response = await fetch(
      `${PAYMENTS_API_BASE}/invoices/public/${encodeURIComponent(token)}`,
      {
        /**
         * Aldri cache. Fakturaen går fra «sendt» til «betalt» i det kunden
         * trykker på knappen, og en side som husket den forrige tilstanden
         * ville bedt dem betale noe de nettopp betalte.
         */
        cache: "no-store",
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(PLOREA_TIMEOUT_MS),
      }
    );
  } catch (err) {
    console.error("Henting av faktura feilet", err);
    return { ok: false, reason: isTimeoutError(err) ? "timeout" : "error" };
  }

  /**
   * API-et svarer samme 404 for et token som ikke finnes, et utkast, og en
   * faktura som tilhører noen andre. Siden skal ikke prøve å skille dem — det
   * er nettopp poenget med at de er like.
   */
  if (response.status === 404 || response.status === 410) {
    return { ok: false, reason: "not-found" };
  }

  if (!response.ok) {
    console.error(`Henting av faktura feilet (${response.status})`);
    return { ok: false, reason: "error" };
  }

  try {
    return { ok: true, invoice: (await response.json()) as PublicInvoice };
  } catch (err) {
    console.error("Fakturaen kunne ikke leses", err);
    return { ok: false, reason: "error" };
  }
}

/** `2026-11-19` → `19.11.2026`. Tom streng for alt annet, aldri «Invalid Date». */
export function formatInvoiceDate(value: string | null | undefined): string {
  const text = String(value ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return "";
  return `${text.slice(8, 10)}.${text.slice(5, 7)}.${text.slice(0, 4)}`;
}

/** `19. november 2026`, for den ene store linja. */
export function formatInvoiceDateLong(value: string | null | undefined): string {
  const text = String(value ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return "";
  const months = [
    "januar", "februar", "mars", "april", "mai", "juni",
    "juli", "august", "september", "oktober", "november", "desember",
  ];
  return `${Number(text.slice(8, 10))}. ${months[Number(text.slice(5, 7)) - 1]} ${text.slice(0, 4)}`;
}

/** `0.25` → `25 %`. En brøk, ikke prosentpoeng. */
export function formatVatRate(rate: number | null | undefined): string {
  if (rate === null || rate === undefined) return "";
  return `${Math.round(Number(rate) * 100)} %`;
}

export function addressLines(address: InvoiceAddress | null | undefined): string[] {
  if (!address) return [];
  return [
    address.line1,
    address.line2,
    [address.postalCode, address.city].filter(Boolean).join(" "),
    address.country && address.country !== "NO" ? address.country : null,
  ]
    .map((line) => String(line ?? "").trim())
    .filter(Boolean);
}

/**
 * Hva denne siden heter, og hva den ber om.
 *
 * En kreditnota ber **aldri** om betaling. Den går andre veien, og en side som
 * sa «Betal 499,00» på en kreditnota ville bedt noen betale penger de har krav
 * på. Det er en feil ingen statuskode fanger, så ordene velges her og ett
 * sted.
 */
export function documentWording(invoice: PublicInvoice) {
  const isCreditNote = invoice.documentType === "credit_note";
  const overdue = invoice.status === "overdue";
  const settled = Boolean(invoice.paidAt) || invoice.outstanding <= 0;
  return {
    isCreditNote,
    title: isCreditNote ? "Kreditnota" : "Faktura",
    numberLabel: isCreditNote ? "Kreditnotanummer" : "Fakturanummer",
    dateLabel: isCreditNote ? "Kreditnotadato" : "Fakturadato",
    /** «Å betale», eller «Kreditert» når pengene går andre veien. */
    totalLabel: isCreditNote ? "Kreditert" : "Å betale",
    /** Betal-knappen vises bare når det faktisk er noe å betale. */
    payable: !isCreditNote && !settled && Boolean(invoice.paymentLinkId),
    /**
     * Lenken og QR-koden. Samme regel som knappen, men uten å kreve en
     * betalingslenke: adressen til denne siden virker uansett, og en utskrift
     * uten en vei videre er en faktura noen må gjette seg fram til.
     */
    showPaymentRoute: !isCreditNote && !settled,
    overdue,
    /** `TESTFAKTURA – ikke gyldig`, eller ingenting i live. */
    testBanner: invoice.isTest
      ? `${isCreditNote ? "TESTKREDITNOTA" : "TESTFAKTURA"} – ikke gyldig`
      : null,
  };
}

/**
 * Prisoverskriften, og om begge prisformene må vises.
 *
 * `taxBehavior` avgjør: en pris oppgitt inkludert MVA og en oppgitt uten er to
 * ulike tall. «299» på et treningssenters nettside er 299 å betale; «299» i et
 * tilbud til et selskap er 373,75 å betale. En kolonne som bare sier «Pris»
 * lar leseren gjette.
 *
 * Blandes de to i samme faktura, vises **begge** per linje — alternativet er
 * én overskrift som er feil for halvparten av linjene.
 */
export function priceColumns(lines: InvoiceLine[]) {
  const behaviours = new Set(lines.map((l) => l.taxBehavior).filter(Boolean));
  const mixed = behaviours.size > 1;
  return {
    mixed,
    header: !mixed && behaviours.has("inclusive") ? "Pris inkl. MVA" : "Pris eks. MVA",
  };
}

/** Den andre prisformen, regnet per enhet. Bare for visning. */
export function otherUnitPrice(line: InvoiceLine): number {
  const rate = Number(line.vatRate ?? 0);
  const unit = Number(line.unitAmount ?? 0);
  return line.taxBehavior === "inclusive"
    ? Math.round(unit / (1 + rate))
    : Math.round(unit * (1 + rate));
}

/**
 * Enhetene, med entall og flertall. Speilet fra invoices/catalog.js.
 *
 * «2 time» står på et dokument en kunde leser, og det er feil norsk på en
 * faktura noen har betalt for. Bøyningen kan **ikke** utledes: norsk gir
 * `time → timer`, men `mnd → mnd`, `kg → kg` og `år → år`. En regel som la på
 * «-er» ville gitt «2 kger» og «3 mnder».
 *
 * En ukjent enhet **gjettes ikke på** — den vises som den kom. Avvisningen hører
 * ved opprettelsen, der et menneske kan rette den; en faktura som ikke kan vises
 * fordi en enhet er ukjent er verre enn én der enheten står ubøyd.
 */
export const UNIT_FORMS: Record<string, { one: string; many: string }> = {
  stk: { one: "stk", many: "stk" },
  time: { one: "time", many: "timer" },
  dag: { one: "dag", many: "dager" },
  uke: { one: "uke", many: "uker" },
  mnd: { one: "mnd", many: "mnd" },
  år: { one: "år", many: "år" },
  kg: { one: "kg", many: "kg" },
  liter: { one: "liter", many: "liter" },
  km: { one: "km", many: "km" },
  abonnement: { one: "abonnement", many: "abonnementer" },
};

export function formatUnit(unit: string | undefined, quantity: number): string {
  if (!unit) return "";
  const forms = UNIT_FORMS[unit];
  if (!forms) return unit;
  return Math.abs(Number(quantity)) === 1 ? forms.one : forms.many;
}

/** `2 timer`, `1 mnd`, `3 abonnementer`. Bare tallet uten enhet. */
export function formatQuantity(quantity: number, unit?: string): string {
  if (!unit) return String(quantity);
  return `${quantity} ${formatUnit(unit, quantity)}`;
}

/**
 * Leveringstidspunktet på dokumentet.
 *
 * Når **hver** linje bærer sin egen periode, er dokumentets «Levert» spennet av
 * dem — tidligste start til seneste slutt — og ikke det kalleren oppgav.
 *
 * Grunnen er at faktura 0427 motsa seg selv: dokumentet sa `01.11–30.11`,
 * linjen sa `19.11–18.12`. Leveringstidspunkt er et krav i
 * bokføringsforskriften kapittel 5, og to ulike svar på det er verre enn ett.
 * Nå er dokumentets linje utledet av linjenes, så den kan ikke si noe annet
 * enn dem.
 *
 * Mangler én linje perioden, faller den tilbake på kallerens felt: et spenn
 * regnet av halve dokumentet ville vært en tredje påstand.
 */
export function deliverySpan(
  invoice: PublicInvoice
): { from: string; to?: string } | null {
  const lines = invoice.lines ?? [];
  const withPeriod = lines.filter((l) => l.periodStart);
  if (withPeriod.length && withPeriod.length === lines.length) {
    const starts = withPeriod.map((l) => String(l.periodStart)).sort();
    const ends = withPeriod.map((l) => String(l.periodEnd || l.periodStart)).sort();
    return { from: starts[0], to: ends[ends.length - 1] };
  }
  if (invoice.deliveryPeriod?.from) {
    return { from: invoice.deliveryPeriod.from, to: invoice.deliveryPeriod.to };
  }
  return invoice.deliveryDate ? { from: invoice.deliveryDate } : null;
}

/** `19.11.2026–18.12.2026`, eller én dato. Samme strek som på linjen. */
export function formatSpan(span: { from: string; to?: string } | null): string {
  if (!span) return "";
  const from = formatInvoiceDate(span.from);
  const to = span.to && span.to !== span.from ? formatInvoiceDate(span.to) : "";
  return to ? `${from}–${to}` : from;
}
