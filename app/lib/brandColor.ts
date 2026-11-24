/**
 * Selgerens aksentfarge på de hostede sidene.
 *
 * HANDOFF §42.1. API-et svarer `brandColor` på de fire offentlige rutene denne
 * appen leser — `/pay/{id}`, `/receipts/public/{token}`,
 * `/invoices/public/{token}` og `/payment-requests/public/{token}` — og feltet
 * er **fraværende** når tenanten ikke har satt en farge. Da står sidene i Done
 * Pay-fiolett, som er det de har stått i hele tiden.
 *
 * ── Kontrastgulvet, og hvorfor det også ligger her ───────────────────────
 *
 * SPEILET fra `usableBrandColor` i `plorea-receipt-generator` og
 * `plorea-invoice-generator`. `test-brand-color-mirror.mjs` i
 * payments-link-repoet mater alle tre den samme tabellen.
 *
 * API-et lagrer en farge som er gyldig på formen og sier ingenting om om den
 * kan leses — det er med vilje, og det står i openapi: **den som tegner
 * avgjør**. Her er det «den som tegner».
 *
 * Fargen bærer beløpet og «Betal»-knappen. En blek farge gjør ikke siden stygg,
 * den gjør knappen usynlig på hvit bakgrunn — på den siden der noen skal
 * betale. Så 4,5:1 mot hvitt, målt:
 *
 *   #6323dd  Done Pay-fiolett      7,46:1   ✓
 *   #2563eb  en mellomblå          5,17:1   ✓
 *   #1c9917  en mellomgrønn        3,74:1   ✗
 *   #ffe066  en blek gul           1,30:1   ✗
 *
 * Standardfargen klarer gulvet med margin, så gulvet avviser ikke dagens
 * utseende — det ville vært nok til å si at gulvet var feil.
 */

const BRAND_COLOR_FORM = /^#[0-9a-f]{6}$/i;
export const BRAND_MIN_CONTRAST = 4.5;

function relativeLuminance(hex: string): number {
  const channel = (i: number) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

/** Kontrastforholdet mot hvit bakgrunn. */
export function contrastAgainstWhite(hex: string): number {
  return 1.05 / (relativeLuminance(hex) + 0.05);
}

/**
 * Fargen vi faktisk skal tegne med, eller `null`.
 *
 * `null` betyr «bruk sidens egen farge», ikke «bruk svart». Kalleren tegner
 * da ingenting, og CSS-en i `globals.css` står som den står.
 */
export function usableBrandColor(raw: string | null | undefined): string | null {
  const colour = typeof raw === "string" ? raw.trim() : "";
  if (!colour || !BRAND_COLOR_FORM.test(colour)) return null;
  const lower = colour.toLowerCase();
  if (contrastAgainstWhite(lower) < BRAND_MIN_CONTRAST) return null;
  return lower;
}

/**
 * Den lysere varianten, blandet mot hvitt.
 *
 * `--violet-soft` brukes på mørk bakgrunn og i gradienten, og den er ikke
 * valgfri: uten den ville en tenants farge gitt en side med ny primærfarge og
 * Done Pays gamle lilla i gradienten ved siden av.
 *
 * Regnet ut i JS og ikke med `color-mix`, fordi dette er en betalingsside.
 * `color-mix` er greit i hver gjeldende nettleser, men «greit i hver
 * gjeldende» er ikke det samme som «greit i den nettleseren som åpner
 * betalingslenken», og en reserve er billigere enn en support-sak.
 *
 * 35 % hvitt, og tallet er målt og ikke valgt — men ikke slik jeg først
 * skrev det. Designsystemets eget par er **ikke** en ren hvitblanding:
 * `#6323dd` → `#9b6fe8` er 0,359 på rødt, 0,345 på grønt og 0,324 på blått,
 * altså en håndplukket farge og ikke en formel.
 *
 * 0,35 er den enkeltbrøken som kommer nærmest den: den gir `#9a70e9`, som
 * avviker **1 av 255** på det meste per kanal. Så en tenants lysere variant
 * forholder seg til deres egen farge omtrent som Done Pays gjør til sin — og
 * det er det beste en formel kan si her.
 */
export function softenTowardsWhite(hex: string, amount = 0.35): string {
  const mix = (i: number) => {
    const v = parseInt(hex.slice(i, i + 2), 16);
    return Math.round(v + (255 - v) * amount);
  };
  const two = (n: number) => n.toString(16).padStart(2, "0");
  return `#${two(mix(1))}${two(mix(3))}${two(mix(5))}`;
}

/**
 * De tre variablene en side skal overstyre, eller `null` når det ikke er noen
 * farge å overstyre med.
 */
export function brandVariables(raw: string | null | undefined): string | null {
  const colour = usableBrandColor(raw);
  if (!colour) return null;
  const soft = softenTowardsWhite(colour);
  return [
    `--violet:${colour}`,
    `--violet-soft:${soft}`,
    `--gradient:linear-gradient(135deg,${colour} 0%,${soft} 100%)`
  ].join(";");
}
