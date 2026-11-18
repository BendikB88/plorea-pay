/**
 * Kvitteringssiden: pay.plorea.no/kvittering/{token}
 *
 * Dette er lenken kunden får — i `subscription.charge_succeeded`, i
 * `receipt.ready` og i e-posten. Den peker hit og ikke rett på PDF-en med
 * vilje: hendelsen går ut i det pengene flyttes, og dokumentet rendres noen
 * sekunder senere av en annen funksjon. En side kan si «kvitteringen lages
 * nå»; en 404 kan bare se ødelagt ut.
 *
 * Oppsettet er det samme som PDF-ens, og det er ikke en smakssak: en kunde som
 * laster ned dokumentet rett etter å ha lest siden skal kjenne igjen det samme
 * arket. Tittel øverst til venstre, merkelapp og verdi for nummer og dato,
 * selger og betaler i to kolonner, én stor linje som sier hva som ble betalt og
 * når, linjene, summene og betalingshistorikken — og nederst setningen om hva
 * dokumentet er. Samme rekkefølge, samme ord.
 *
 * Beløpene er inkludert MVA, så totalen står først og MVA-en er en del *av*
 * den — «herav» er ordet som sier det. Ingen «delsum» som netto: det ville
 * invitert leseren til å legge sammen to tall som aldri ble lagt sammen.
 *
 * Tokenet i URL-en er hele beskyttelsen, som på /krav/{token}. Det var
 * referansen `sub_...-chg_...` fram til 18. november 2026 — men den sendes i
 * selve hendelsen og ligger hos hver tenant, så den var ingen hemmelighet å
 * bygge en side på. Nå er den 404 her.
 */
import { formatAmount } from "@/app/lib/paymentLink";
import {
  addressLines,
  cardLabel,
  fetchReceipt,
  formatOrgNr,
  formatReceiptDate,
  formatVatRate,
} from "@/app/lib/receipt";
import LinkUnavailable from "@/app/[id]/LinkUnavailable";

export const metadata = {
  title: "Kvittering · Plorea",
};

export default async function Page({
  params,
}: {
  // Typed here rather than with PageProps<"/kvittering/[token]">: the
  // generated route type does not exist until the next build, so that form
  // fails a type check on a clean checkout.
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const result = await fetchReceipt(token);

  if (!result.ok) {
    return <LinkUnavailable message="Fant ikke kvitteringen" />;
  }

  const receipt = result.receipt;
  const pending = receipt.status === "pending";
  const seller = receipt.seller;
  const customer = receipt.customer;
  const sellerAddress = addressLines(seller?.address);
  const customerAddress = addressLines(customer?.address);
  // Selgeren kommer ferdig formatert; kunden er fryst slik den ble sendt inn.
  const customerOrgNr = customer?.orgNrFormatted ?? formatOrgNr(customer?.orgNr);

  return (
    <main className="receipt-page">
      <article className="receipt-sheet">
        {/*
          «Kvittering» stort øverst til venstre, og plass til selgerens logo til
          høyre når det finnes et sted å oppbevare en. Ikke vårt merke: kunden
          kjøpte av selgeren, og hjørnet på deres dokument er ikke vårt.
        */}
        <header className="receipt-head">
          <h1 className="receipt-title">Kvittering</h1>
        </header>

        <dl className="receipt-meta">
          {receipt.receiptNumber ? (
            <div className="receipt-meta-row">
              <dt>Kvitteringsnummer</dt>
              <dd>{receipt.receiptNumber}</dd>
            </div>
          ) : null}
          <div className="receipt-meta-row">
            <dt>Betalingsdato</dt>
            <dd>{formatReceiptDate(receipt.paidAt)}</dd>
          </div>
        </dl>

        <div className="receipt-parties">
          <section className="receipt-party">
            {seller?.name ? <p className="receipt-party-name">{seller.name}</p> : null}
            {sellerAddress.map((line) => (
              <p className="receipt-party-line" key={line}>
                {line}
              </p>
            ))}
            {seller?.orgNrFormatted ? (
              <p className="receipt-party-line">Org.nr {seller.orgNrFormatted}</p>
            ) : null}
            {seller?.email ? <p className="receipt-party-line">{seller.email}</p> : null}
            {seller?.phone ? <p className="receipt-party-line">{seller.phone}</p> : null}
          </section>

          {customer ? (
            <section className="receipt-party">
              <p className="receipt-party-label">Betalt av</p>
              <p className="receipt-party-name">{customer.name}</p>
              {customerAddress.map((line) => (
                <p className="receipt-party-line" key={line}>
                  {line}
                </p>
              ))}
              {customerOrgNr ? (
                <p className="receipt-party-line">Org.nr {customerOrgNr}</p>
              ) : null}
              {customer.email ? <p className="receipt-party-line">{customer.email}</p> : null}
            </section>
          ) : null}
        </div>

        <p className="receipt-headline">
          {formatAmount(receipt.total, receipt.currency)} betalt{" "}
          {formatReceiptDate(receipt.paidAt)}
        </p>

        {/*
          Selgerens egen setning, når de har skrevet en. Vi finner ikke på en:
          en høflighetsfrase ingen har skrevet ville vært oss som legger ord i
          munnen på en selger, på deres eget dokument.
        */}
        {receipt.note ? <p className="receipt-note">{receipt.note}</p> : null}

        <table className="receipt-items">
          <thead>
            <tr>
              <th scope="col">Beskrivelse</th>
              <th scope="col" className="receipt-num">
                Ant
              </th>
              <th scope="col" className="receipt-num">
                Pris
              </th>
              <th scope="col" className="receipt-num">
                Beløp
              </th>
            </tr>
          </thead>
          <tbody>
            {receipt.lines.map((line, i) => (
              <tr key={i}>
                <td>
                  {line.description}
                  {line.vatRate === undefined || line.vatRate === null ? null : (
                    <span className="receipt-vat">MVA {formatVatRate(line.vatRate)}</span>
                  )}
                </td>
                <td className="receipt-num">{line.quantity}</td>
                <td className="receipt-num">
                  {formatAmount(line.unitAmount, receipt.currency)}
                </td>
                <td className="receipt-num">
                  {formatAmount(line.lineAmount, receipt.currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/*
          Totalen først, så «herav MVA» per sats. Prisene er inkludert MVA, så
          MVA-en ligger inne i tallet over og legges ikke til det.
        */}
        <table className="receipt-totals">
          <tbody>
            <tr className="receipt-total-main">
              <th scope="row">Totalt inkl. MVA</th>
              <td>{formatAmount(receipt.total, receipt.currency)}</td>
            </tr>
            {receipt.vatByRate
              .filter((group) => group.vatRate !== null && group.vat > 0)
              .map((group, i) => (
                <tr key={i}>
                  <th scope="row">herav MVA {formatVatRate(group.vatRate)}</th>
                  <td>{formatAmount(group.vat, receipt.currency)}</td>
                </tr>
              ))}
            <tr className="receipt-total-paid">
              <th scope="row">Betalt</th>
              <td>{formatAmount(receipt.paid, receipt.currency)}</td>
            </tr>
            {receipt.refunded > 0 ? (
              <tr className="receipt-total-paid">
                <th scope="row">Refundert</th>
                <td>{formatAmount(receipt.refunded, receipt.currency)}</td>
              </tr>
            ) : null}
          </tbody>
        </table>

        {/*
          Betalingshistorikken, med de samme fire kolonnene som PDF-en.
          Dokumentet lister hvert trekk på abonnementet; denne siden kjenner
          bare dette ene, fordi det offentlige endepunktet svarer med nøyaktig
          det kvitteringen gjelder og ikke ett felt mer. Oppsettet er likt, og
          raden er den samme raden.
        */}
        <h2 className="receipt-section">Betalingshistorikk</h2>
        <table className="receipt-history">
          <thead>
            <tr>
              <th scope="col">Betalingsmetode</th>
              <th scope="col">Dato</th>
              <th scope="col" className="receipt-num">
                Betalt beløp
              </th>
              <th scope="col" className="receipt-num">
                Kvitteringsnummer
              </th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>{cardLabel(receipt.card)}</td>
              <td>{formatReceiptDate(receipt.paidAt)}</td>
              <td className="receipt-num">
                {formatAmount(receipt.paid, receipt.currency)}
              </td>
              <td className="receipt-num">{receipt.receiptNumber ?? "–"}</td>
            </tr>
          </tbody>
        </table>

        {pending ? (
          <p className="receipt-pending">
            Kvitteringen lages nå. Last siden på nytt om noen sekunder for å laste den
            ned som PDF.
          </p>
        ) : receipt.fileUrl ? (
          <p className="receipt-download">
            <a className="pay-button-secondary" href={receipt.fileUrl}>
              Last ned kvittering
            </a>
          </p>
        ) : null}

        {/*
          Setningen som sier hva dokumentet er. Den kommer fra API-et og ikke
          herfra, så den står ett sted og kan ikke skli fra PDF-en.
        */}
        <footer className="receipt-foot">
          <p className="receipt-disclaimer">{receipt.disclaimer}</p>
          <p className="receipt-byline">Levert av Done Pay</p>
        </footer>
      </article>
    </main>
  );
}
