/**
 * Fakturasiden: pay.plorea.no/faktura/{token}
 *
 * Dette er lenken kunden får i e-posten og i `invoice.sent`. Den peker hit og
 * ikke rett på PDF-en med vilje: siden kan si «betal», og en PDF kan ikke.
 *
 * Oppsettet er det samme som PDF-ens, og det er ikke en smakssak: en kunde som
 * laster ned dokumentet rett etter å ha lest siden skal kjenne igjen det samme
 * arket. Tittel øverst til venstre, merkelapp og verdi for nummer, dato,
 * forfall og levering, selger og kjøper i to kolonner, én stor linje som sier
 * hva som skal betales og når, linjene, summene — og nederst setningen om hvem
 * som utstedte dokumentet.
 *
 * ── Fakturaen er ikke kvitteringen ─────────────────────────────────────────
 * Kvitteringen er betalingsdokumentasjon; fakturaen er **regnskapsbilaget**.
 * Derfor har denne siden felt kvitteringen ikke har: selgerens registerstatus,
 * leveringstidspunkt, kjøperens adresse, og MVA spesifisert **per sats**. Og
 * derfor er beløpene her vist med netto, MVA og totalt — ikke «herav MVA» som
 * på kvitteringen, der prisene er inkludert MVA og en delsum ville invitert
 * leseren til å legge sammen to tall som aldri ble lagt sammen.
 *
 * ── En kreditnota ber aldri om betaling ────────────────────────────────────
 * Den går andre veien. En side som sa «Betal 499,00» på en kreditnota ville
 * bedt noen betale penger de har krav på, og det er en feil ingen statuskode
 * fanger. Ordene kommer fra `documentWording`, ett sted.
 */
import { notFound } from "next/navigation";
import { formatAmount } from "@/app/lib/paymentLink";
import {
  addressLines,
  documentWording,
  fetchInvoice,
  formatInvoiceDate,
  formatInvoiceDateLong,
  formatVatRate,
} from "@/app/lib/invoice";
import LinkUnavailable from "@/app/[id]/LinkUnavailable";

/**
 * Fanetittelen følger dokumentet, ikke ruten.
 *
 * `export const metadata` er statisk, så en kreditnota fikk «Faktura · Plorea»
 * i fanen — og en kunde med tre faner åpne kan ikke se hvilken som er hva.
 * Dette koster et ekstra kall til API-et, som er cachet per forespørsel av
 * Next, så det er samme svar siden selv leser.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const result = await fetchInvoice(token);
  if (!result.ok) return { title: "Faktura · Plorea" };
  const title = result.invoice.documentType === "credit_note" ? "Kreditnota" : "Faktura";
  const number = result.invoice.invoiceNumber;
  return { title: number ? `${title} ${number} · Plorea` : `${title} · Plorea` };
}

export default async function Page({
  params,
}: {
  // Typed here rather than with PageProps<"/faktura/[token]">: the generated
  // route type does not exist until the next build, so that form fails a type
  // check on a clean checkout.
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const result = await fetchInvoice(token);

  /**
   * En ekte 404 for en faktura som ikke er der, og bare for det.
   *
   * `notFound()` er den eneste måten en App Router-side kan sette statusen, og
   * statusen er den ærlige delen. Et **utkast** svarer også 404 fra API-et: det
   * har ingen nummer og er ikke et dokument.
   *
   * Et tidsavbrudd er **ikke** en 404 og må ikke bli det. Fakturaen finnes
   * antakelig; vi fikk ikke spurt. Å svare «ikke funnet» på det ville fortalt
   * en kunde at fakturaen er borte fordi API-et vårt var tregt — og en kunde
   * som tror fakturaen er borte, betaler den ikke.
   */
  if (!result.ok) {
    if (result.reason === "not-found") notFound();
    return <LinkUnavailable message="Kunne ikke hente fakturaen akkurat nå" />;
  }

  const invoice = result.invoice;
  const words = documentWording(invoice);
  const currency = invoice.totals?.currency ?? "NOK";
  const seller = invoice.seller;
  const buyer = invoice.buyer;
  const sellerAddress = addressLines(seller?.address);
  const buyerAddress = addressLines(buyer?.address);

  const delivery = invoice.deliveryDate
    ? formatInvoiceDate(invoice.deliveryDate)
    : invoice.deliveryPeriod?.from
      ? `${formatInvoiceDate(invoice.deliveryPeriod.from)} – ${formatInvoiceDate(invoice.deliveryPeriod.to)}`
      : "";

  /**
   * Den ene store linja, og den sier tre ulike ting.
   *
   * En betalt faktura skal ikke be om penger. En kreditnota skal ikke be om
   * penger. Alt annet skal si hvor mye og innen når — og for en forfalt
   * faktura hvilken dato som gikk.
   */
  const headline = words.isCreditNote
    ? `${formatAmount(invoice.totals?.gross ?? 0, currency)} kreditert ${formatInvoiceDateLong(invoice.invoiceDate)}`
    : invoice.paidAt
      ? `${formatAmount(invoice.totals?.gross ?? 0, currency)} betalt ${formatInvoiceDateLong(invoice.paidAt)}`
      : words.overdue
        ? `${formatAmount(invoice.outstanding, currency)} forfalt ${formatInvoiceDateLong(invoice.dueDate)}`
        : `${formatAmount(invoice.outstanding, currency)} betales innen ${formatInvoiceDateLong(invoice.dueDate)}`;

  const vatRows = Object.entries(invoice.totals?.vatByRate ?? {})
    .sort((a, b) => Number(b[0]) - Number(a[0]));

  return (
    <main className="receipt-page">
      <article className="receipt-sheet">
        {/*
          Tittelen stort øverst til venstre, og plass til selgerens logo til
          høyre når det finnes et sted å oppbevare en. Ikke vårt merke: kunden
          kjøpte av selgeren, og hjørnet på deres dokument er ikke vårt.
        */}
        <header className="receipt-head">
          <h1 className="receipt-title">{words.title}</h1>
          {seller?.name ? <p className="invoice-seller-mark">{seller.name}</p> : null}
        </header>

        <dl className="receipt-meta">
          {invoice.invoiceNumber ? (
            <div className="receipt-meta-row">
              <dt>{words.numberLabel}</dt>
              <dd>{invoice.invoiceNumber}</dd>
            </div>
          ) : null}
          <div className="receipt-meta-row">
            <dt>{words.dateLabel}</dt>
            <dd>{formatInvoiceDate(invoice.invoiceDate)}</dd>
          </div>
          {/* Ingen forfallsdato på en kreditnota: ingenting skyldes. */}
          {!words.isCreditNote && invoice.dueDate ? (
            <div className="receipt-meta-row">
              <dt>Forfall</dt>
              <dd>{formatInvoiceDate(invoice.dueDate)}</dd>
            </div>
          ) : null}
          {invoice.creditsInvoice ? (
            <div className="receipt-meta-row">
              <dt>Krediterer faktura</dt>
              <dd>{invoice.creditsInvoice}</dd>
            </div>
          ) : null}
          {delivery ? (
            <div className="receipt-meta-row">
              <dt>Levert</dt>
              <dd>{delivery}</dd>
            </div>
          ) : null}
          {buyer?.reference ? (
            <div className="receipt-meta-row">
              <dt>Deres referanse</dt>
              <dd>{buyer.reference}</dd>
            </div>
          ) : null}
        </dl>

        <div className="receipt-parties">
          <section className="receipt-party">
            <p className="receipt-party-label">Selger</p>
            {seller?.name ? <p className="receipt-party-name">{seller.name}</p> : null}
            {sellerAddress.map((line) => (
              <p className="receipt-party-line" key={line}>
                {line}
              </p>
            ))}
            {/*
              Ferdig formatert av API-et: `NO 979 684 002 MVA`, uten suffikset
              for et selskap som ikke er MVA-registrert. Vi setter den ikke
              sammen her — suffikset er en påstand om selskapet.
            */}
            {seller?.orgNrLine ? (
              <p className="receipt-party-line">{seller.orgNrLine}</p>
            ) : null}
            {seller?.email ? <p className="receipt-party-line">{seller.email}</p> : null}
            {seller?.phone ? <p className="receipt-party-line">{seller.phone}</p> : null}
          </section>

          {buyer ? (
            <section className="receipt-party">
              <p className="receipt-party-label">Fakturert til</p>
              <p className="receipt-party-name">{buyer.name}</p>
              {buyerAddress.map((line) => (
                <p className="receipt-party-line" key={line}>
                  {line}
                </p>
              ))}
              {buyer.orgNr ? (
                <p className="receipt-party-line">Org.nr {buyer.orgNr}</p>
              ) : null}
              {buyer.email ? <p className="receipt-party-line">{buyer.email}</p> : null}
            </section>
          ) : null}
        </div>

        <p className={words.overdue ? "receipt-headline invoice-overdue" : "receipt-headline"}>
          {headline}
        </p>

        {/*
          Betal-knappen, og bare når det faktisk er noe å betale. Den peker på
          /{paymentLinkId}, som er den samme siden hvert annet krav betales på —
          samme Drop-in, samme 3DS, samme splitter, alt verifisert i live.
        */}
        {words.payable ? (
          <p className="invoice-pay">
            <a className="pay-button" href={`/${invoice.paymentLinkId}`}>
              Betal {formatAmount(invoice.outstanding, currency)}
            </a>
          </p>
        ) : null}

        {/*
          Selgerens egen setning, når de har skrevet en. Vi finner ikke på en:
          en høflighetsfrase ingen har skrevet ville vært oss som legger ord i
          munnen på en selger, på deres eget dokument.
        */}
        {invoice.note ? <p className="receipt-note">{invoice.note}</p> : null}

        <table className="receipt-items">
          <thead>
            <tr>
              <th scope="col">Beskrivelse</th>
              <th scope="col" className="receipt-num">
                Antall
              </th>
              <th scope="col" className="receipt-num">
                Pris
              </th>
              <th scope="col" className="receipt-num">
                MVA
              </th>
              <th scope="col" className="receipt-num">
                Beløp
              </th>
            </tr>
          </thead>
          <tbody>
            {invoice.lines.map((line, i) => (
              <tr key={line.lineId ?? i}>
                <td>
                  {line.description}
                  {line.discountAmount ? (
                    <span className="receipt-vat">
                      Rabatt -{formatAmount(line.discountAmount, currency)}
                    </span>
                  ) : null}
                </td>
                <td className="receipt-num">
                  {line.quantity}
                  {line.unit ? ` ${line.unit}` : ""}
                </td>
                <td className="receipt-num">{formatAmount(line.unitAmount, currency)}</td>
                <td className="receipt-num">{formatVatRate(line.vatRate)}</td>
                <td className="receipt-num">{formatAmount(line.gross ?? 0, currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/*
          Netto, MVA per sats, totalt. Spesifikasjonen per sats er et krav, og
          den er lest fra `vatByRate` og ikke regnet ut her: å regne MVA på nytt
          på en side er å invitere et øres avvik mot dokumentet.
        */}
        <table className="receipt-totals">
          <tbody>
            <tr>
              <th scope="row">Netto</th>
              <td>{formatAmount(invoice.totals?.net ?? 0, currency)}</td>
            </tr>
            {vatRows.map(([rate, amount]) => (
              <tr key={rate}>
                <th scope="row">MVA {formatVatRate(Number(rate))}</th>
                <td>{formatAmount(amount, currency)}</td>
              </tr>
            ))}
            <tr className="receipt-total-main">
              <th scope="row">Totalt</th>
              <td>{formatAmount(invoice.totals?.gross ?? 0, currency)}</td>
            </tr>
            {/*
              Hva som er betalt eller kreditert, når det er noe. Et dokument
              der totalen og det utestående er ulike må si hvorfor, ellers ser
              den store linja over ut som en regnefeil.
            */}
            {!words.isCreditNote && invoice.outstanding !== (invoice.totals?.gross ?? 0) ? (
              <tr>
                <th scope="row">Utestående</th>
                <td>{formatAmount(invoice.outstanding, currency)}</td>
              </tr>
            ) : null}
          </tbody>
        </table>

        <footer className="receipt-foot">
          <p className="receipt-disclaimer">
            {words.isCreditNote
              ? "Kreditnotaen er regnskapsbilaget. Beløpet er kreditert og skal ikke betales."
              : "Fakturaen er regnskapsbilaget. Ved spørsmål, kontakt selgeren på adressen over."}
          </p>
          {invoice.issuerStatement ? (
            <p className="receipt-disclaimer">{invoice.issuerStatement}</p>
          ) : null}
          <p className="receipt-byline">Levert av Done Pay</p>
        </footer>
      </article>
    </main>
  );
}
