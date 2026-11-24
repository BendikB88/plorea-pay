/**
 * Beviset for plorea-pays halvdel av HANDOFF §42.1.
 *
 *   node verify-brand-accent.mjs      (etter `npm run build`)
 *
 * Starter en **stubb** av betalings-API-et, starter den bygde Next-serveren mot
 * den, og henter de fire sidene. Ingen deploy, ingen ekte tenant: det som måles
 * er om siden faktisk skriver `--violet` når API-et svarer en farge.
 *
 * Grunnen til at det ikke er nok å prøve `brandVariables` alene: en modul som
 * er riktig mens siden ikke bruker den er `storedPaymentMethodMode` om igjen.
 * Og det var ikke teori her — `normalize` i `paymentRequest.ts` og
 * `paymentLink.ts` bygger svaret fra en navngitt liste, og fargen ble droppet
 * i stillhet til denne sjekken fant det.
 *
 * ── Markøren, og hvorfor 200 ikke er nok ────────────────────────────────
 *
 * `LinkUnavailable` svarer også 200. Første utgaven av denne sjekken så bare
 * på statuskoden, og da gikk `/krav` for «rendret» mens den faktisk viste
 * «Kunne ikke hente fakturaen akkurat nå» — og en side som ikke rendret kan
 * ikke si noe om en farge. Så hver sjekk krever at `class="unavailable"`
 * **ikke** står i svaret.
 */
import { spawn } from "node:child_process";
import http from "node:http";

const PORT_API = 4971;
const PORT_APP = 4972;

/**
 * Portene må være frie, og det er ikke ryddighet — det er forrige kjøring.
 *
 * Første utgave av denne sjekken hang på nedrivingen, ble stoppet, og
 * etterlot en `next start` som fortsatt lyttet på porten. Neste kjøring fikk
 * da ikke opp sin egen server, snakket med den **gamle** — altså bygget fra
 * før rettelsen — og meldte to sider som røde. Koden var riktig hele tiden.
 *
 * En sjekk som i stillhet måler en annen server enn den den startet, er verre
 * enn ingen sjekk. Så den nekter å begynne i stedet.
 */
for (const [navn, port] of [["API-stubben", PORT_API], ["appen", PORT_APP]]) {
  const tatt = await new Promise(resolve => {
    const prøve = http.createServer();
    prøve.once("error", () => resolve(true));
    prøve.once("listening", () => prøve.close(() => resolve(false)));
    prøve.listen(port, "127.0.0.1");
  });
  if (tatt) {
    console.error(
      `AVBRYTER: port ${port} (${navn}) er i bruk. En tidligere kjøring lever\n` +
      "fortsatt, og denne sjekken ville målt den i stedet. Finn den med\n" +
      `  netstat -ano | grep :${port}\n` +
      "og avslutt den før du prøver igjen."
    );
    process.exit(2);
  }
}

let farge = null;
const medFarge = o => (farge ? { ...o, brandColor: farge } : o);

const kvittering = () => medFarge({
  status: "ready", documentType: "receipt", isTest: false,
  receiptNumber: "1000-0042", paidAt: "2026-11-24T12:00:00.000Z", currency: "NOK",
  seller: { name: "Fjordglott Trevare AS", orgNr: "979684002", orgNrFormatted: "979 684 002" },
  customer: { name: "Kari Nordmann", email: "kari@example.no" },
  lines: [{ description: "Medlemskap", quantity: 1, unitAmount: 49900, lineAmount: 49900, vatRate: 25 }],
  total: 49900, vatAmount: 9980, vatByRate: [{ vatRate: 25, vat: 9980, gross: 49900 }],
  paid: 49900, refunded: 0, disclaimer: "Kvitteringen er betalingsdokumentasjon."
});

const krav = () => medFarge({
  paymentRequestId: "pr_1", status: "open", externalNumber: "F-0001",
  seller: { name: "Fjordglott Trevare AS", orgNr: "979684002" },
  buyer: { name: "Kari Nordmann" },
  currency: "NOK", amount: 50000, dueDate: "2026-12-03",
  lines: [{ description: "Medlemskap", quantity: 1, unitAmount: 50000, amount: 50000 }],
  publicUrl: "https://pay.plorea.no/krav/x", paymentLinkId: "pl_1"
});

const faktura = () => medFarge({
  status: "sent", documentType: "invoice", invoiceNumber: "0001",
  invoiceDate: "2026-11-19", dueDate: "2026-12-03", currency: "NOK",
  seller: { name: "Fjordglott Trevare AS", orgNr: "979684002", orgNrFormatted: "979 684 002" },
  buyer: { name: "Kari Nordmann", email: "kari@example.no" },
  lines: [{ description: "Medlemskap", quantity: 1, unitAmount: 49900, gross: 49900, vatRate: 0.25 }],
  totals: { net: 39920, vat: 9980, gross: 49900, currency: "NOK" },
  paidTotal: 0, creditedTotal: 0, publicToken: "c".repeat(64), paymentLinkId: "pl_1"
});

const lenke = () => medFarge({
  id: "pl_1", reference: "zz-verify", product: "Medlemskap",
  amount: 49900, currency: "NOK", merchantName: "Fjordglott Trevare AS",
  merchantOrgNr: "979684002", environment: "test", status: "created", expired: false
});

const api = http.createServer((req, res) => {
  const sti = req.url || "";
  let kropp = null;
  if (sti.startsWith("/receipts/public/")) kropp = kvittering();
  else if (sti.startsWith("/payment-requests/public/")) kropp = krav();
  else if (sti.startsWith("/invoices/public/")) kropp = faktura();
  else if (sti.startsWith("/pay/")) kropp = lenke();
  if (!kropp) {
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
    return;
  }
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify(kropp));
});
await new Promise(r => api.listen(PORT_API, "127.0.0.1", r));

const app = spawn(process.platform === "win32" ? "npx.cmd" : "npx",
  ["next", "start", "-p", String(PORT_APP)], {
    env: { ...process.env, PLOREA_API_BASE: `http://127.0.0.1:${PORT_API}` },
    stdio: ["ignore", "pipe", "pipe"], shell: process.platform === "win32"
  });
let logg = "";
app.stdout.on("data", d => { logg += d; });
app.stderr.on("data", d => { logg += d; });

const hent = async sti => {
  const res = await fetch(`http://127.0.0.1:${PORT_APP}${sti}`, { cache: "no-store" });
  return { status: res.status, html: await res.text() };
};

for (let i = 0; i < 60; i++) {
  try {
    await fetch(`http://127.0.0.1:${PORT_APP}/`, { signal: AbortSignal.timeout(500) });
    break;
  } catch { await new Promise(r => setTimeout(r, 500)); }
}

let ok = 0;
const feil = [];
const sjekk = (navn, bestått, detalj = "") => {
  if (bestått) { ok++; console.log(`  ok    ${navn}`); }
  else { feil.push(navn); console.log(`  FEIL  ${navn}${detalj ? "\n          " + detalj : ""}`); }
};

const SIDER = [
  ["betalingssiden", "/pl_1"],
  ["kvitteringen", "/kvittering/" + "a".repeat(43)],
  ["betalingskravet", "/krav/" + "b".repeat(64)],
  ["fakturaen", "/faktura/" + "c".repeat(64)]
];

const SOFT = "#719af2";

try {
  console.log("\n1. hver side rendrer i det hele tatt");
  farge = null;
  for (const [navn, sti] of SIDER) {
    const { status, html } = await hent(sti);
    sjekk(`1 ${navn} svarer 200`, status === 200, `fikk ${status}`);
    sjekk(`1 ${navn} er siden og ikke LinkUnavailable`,
      !html.includes('class="unavailable"'),
      "svaret er fallback-siden, så ingenting under måler en farge");
    sjekk(`1 ${navn} skriver ingen :root-overstyring`, !html.includes("--violet:"));
  }

  console.log("\n2. med #2563eb");
  farge = "#2563eb";
  for (const [navn, sti] of SIDER) {
    const { html } = await hent(sti);
    sjekk(`2 ${navn} er fortsatt siden`, !html.includes('class="unavailable"'));
    sjekk(`2 ${navn} skriver fargen på :root`, html.includes(":root{--violet:#2563eb"));
    sjekk(`2 ${navn} skriver den lysere varianten`, html.includes(`--violet-soft:${SOFT}`));
    sjekk(`2 ${navn} skriver gradienten`,
      html.includes(`--gradient:linear-gradient(135deg,#2563eb 0%,${SOFT} 100%)`));
  }

  console.log("\n3. en farge ingen kan lese");
  farge = "#ffe066";
  for (const [navn, sti] of SIDER) {
    const { html } = await hent(sti);
    sjekk(`3 ${navn} skriver den IKKE`, !html.includes("--violet:"));
  }

  console.log("\n4. en verdi som ikke er en farge");
  farge = "red; } body { display:none } :root { --x:1";
  for (const [navn, sti] of SIDER) {
    const { html } = await hent(sti);
    /**
     * Bare stilen, og det tok to forsøk å komme hit.
     *
     * Først sto det `!html.includes("display:none")` — og det ordet står i
     * appens egen Tailwind-CSS, så påstanden var usann av en grunn den ikke
     * handlet om. Så sto det `!html.includes("--x:1")` — og **den** står i
     * RSC-nyttelasten på `/{id}`, fordi `link` sendes til en klientkomponent
     * og React serialiserer propene inn i sidens HTML. Der er den JSON-escapet
     * tekst i et script, ikke CSS.
     *
     * Det som faktisk måles er om `BrandAccent` skrev et stilark. Gjorde den
     * ikke det, nådde fargen ikke CSS-en — og det er påstanden.
     */
    sjekk(`4 ${navn} skriver ingen stil av den`,
      !html.includes(":root{--violet:"),
      "formsjekken slipper bare #rrggbb gjennom");
  }
} catch (error) {
  feil.push(`kastet: ${error?.message ?? error}`);
  console.log(`  FEIL  kastet\n          ${error?.stack ?? error}`);
} finally {
  app.kill();
  api.close();
  if (feil.length) console.log(`\nserverlogg:\n${logg.slice(-1500)}`);
}

console.log(`\n${ok} ok, ${feil.length} feil`);
/**
 * `process.exit` og ikke `exitCode`: `next start` startes gjennom et skall på
 * Windows, og `kill()` tar skallet og ikke barnebarnet. Røret står da åpent,
 * løkka tømmes aldri, og skriptet henger etter at hver sjekk er ferdig.
 */
process.exit(feil.length ? 1 : 0);
