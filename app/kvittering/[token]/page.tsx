/**
 * Kvitteringssiden: pay.plorea.no/kvittering/{token}
 *
 * Dette er lenken kunden får — i `subscription.charge_succeeded`, i
 * `receipt.ready` og i e-posten. Den peker hit og ikke rett på PDF-en med
 * vilje: hendelsen går ut i det pengene flyttes, og dokumentet rendres noen
 * sekunder senere av en annen funksjon. En side kan si «kvitteringen lages
 * nå»; en 404 kan bare se ødelagt ut.
 *
 * Den viser det samme som PDF-en og henter alt fra ett endepunkt, så siden
 * aldri kan si et annet tall enn dokumentet. Beløpene er inkludert MVA, så
 * totalen står først og MVA-en er en del *av* den — «herav» er ordet som sier
 * det. Ingen «delsum» som netto: det ville invitert leseren til å legge sammen
 * to tall som aldri ble lagt sammen.
 *
 * Tokenet i URL-en er hele beskyttelsen, som på /krav/{token}. Det var
 * referansen `sub_...-chg_...` fram til 18. november 2026 — men den sendes i
 * selve hendelsen og ligger hos hver tenant, så den var ingen hemmelighet å
 * bygge en side på. Nå er den 404 her.
 */
import { formatAmount } from "@/app/lib/paymentLink";
import {
  addressLines,
  fetchReceipt,
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

  return (
    <main className="pay-shell">
      <div className="pay-card">
        {/*
          Selgerens navn øverst, ikke vårt. Kunden kjøpte av dem, pengene gikk
          til dem, og navnet de kjenner igjen hører hjemme størst på siden.
        */}
        <div className="pay-merchant">
          <span className="pay-merchant-name">{seller?.name ?? "Kvittering"}</span>
          {seller?.orgNrFormatted ? (
            <span className="pay-merchant-org">Org.nr {seller.orgNrFormatted}</span>
          ) : null}
        </div>

        <h1 className="pay-heading">Betalingskvittering</h1>

        <dl className="pay-details">
          {receipt.receiptNumber ? (
            <div className="pay-detail">
              <dt>Kvitteringsnummer</dt>
              <dd>{receipt.receiptNumber}</dd>
            </div>
          ) : null}
          <div className="pay-detail">
            <dt>Dato</dt>
            <dd>{formatReceiptDate(receipt.paidAt)}</dd>
          </div>
          {customer?.name ? (
            <div className="pay-detail">
              <dt>Betalt av</dt>
              <dd>{customer.name}</dd>
            </div>
          ) : null}
          {receipt.card?.last4 ? (
            <div className="pay-detail">
              <dt>Betalt med</dt>
              <dd>
                {receipt.card.brand ? receipt.card.brand.toUpperCase() : "Kort"}
                {" •••• "}
                {receipt.card.last4}
              </dd>
            </div>
          ) : null}
        </dl>

        {customer && (customer.orgNrFormatted || addressLines(customer.address).length) ? (
          <dl className="pay-details">
            {customer.orgNrFormatted ? (
              <div className="pay-detail">
                <dt>Org.nr</dt>
                <dd>{customer.orgNrFormatted}</dd>
              </div>
            ) : null}
            {addressLines(customer.address).length ? (
              <div className="pay-detail">
                <dt>Adresse</dt>
                <dd>{addressLines(customer.address).join(", ")}</dd>
              </div>
            ) : null}
          </dl>
        ) : null}

        <dl className="pay-details">
          {receipt.lines.map((line, i) => (
            <div className="pay-detail" key={i}>
              <dt>
                {line.quantity > 1 ? `${line.quantity} × ` : ""}
                {line.description}
              </dt>
              <dd>{formatAmount(line.lineAmount, receipt.currency)}</dd>
            </div>
          ))}
        </dl>

        {/*
          Totalen først, så «herav MVA» per sats. Prisene er inkludert MVA, så
          MVA-en ligger inne i tallet over og legges ikke til det.
        */}
        <div className="pay-total">
          <span className="pay-total-label">Totalt inkl. MVA</span>
          <span className="pay-total-value">
            {formatAmount(receipt.total, receipt.currency)}
          </span>
        </div>

        <dl className="pay-details">
          {receipt.vatByRate
            .filter((group) => group.vatRate !== null && group.vat > 0)
            .map((group, i) => (
              <div className="pay-detail" key={i}>
                <dt>herav MVA {formatVatRate(group.vatRate)}</dt>
                <dd>{formatAmount(group.vat, receipt.currency)}</dd>
              </div>
            ))}
          <div className="pay-detail">
            <dt>Betalt</dt>
            <dd>{formatAmount(receipt.paid, receipt.currency)}</dd>
          </div>
          {receipt.refunded > 0 ? (
            <div className="pay-detail">
              <dt>Refundert</dt>
              <dd>{formatAmount(receipt.refunded, receipt.currency)}</dd>
            </div>
          ) : null}
        </dl>

        {pending ? (
          <div className="pay-result">
            <p>
              Kvitteringen lages nå. Last siden på nytt om noen sekunder for å
              laste den ned som PDF.
            </p>
          </div>
        ) : receipt.fileUrl ? (
          <a className="pay-button-secondary" href={receipt.fileUrl}>
            Last ned kvittering
          </a>
        ) : null}

        {/*
          Setningen som sier hva dokumentet er. Den kommer fra API-et og ikke
          herfra, så den står ett sted og kan ikke skli fra PDF-en.
        */}
        <p className="pay-footnote">{receipt.disclaimer}</p>
        <p className="pay-footnote pay-footnote-quiet">Levert av Done Pay</p>
      </div>
    </main>
  );
}
