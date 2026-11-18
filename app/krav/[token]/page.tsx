/**
 * Fakturasiden: pay.plorea.no/krav/{token}
 *
 * Viser kravet — selger, nummer, forfall, linjer og sum — og sender videre til
 * betalingssiden som alt virker. Betalingen skjer altså ikke her, og det er
 * med vilje: Drop-in, 3DS, lagret kort og descriptoren ligger i /{id}, som har
 * tatt betalinger i produksjon i månedsvis, og en kopi av den koden ville vært
 * en kopi som kan skli fra originalen.
 *
 * Tokenet i URL-en er hele beskyttelsen, som lenke-id-en er på /{id}.
 */
import Link from "next/link";
import { formatAmount } from "@/app/lib/paymentLink";
import { fetchPaymentRequest, formatDueDate } from "@/app/lib/paymentRequest";
import { notFound } from "next/navigation";
import LinkUnavailable from "@/app/[id]/LinkUnavailable";

export const metadata = {
  title: "Faktura · Plorea",
};

export default async function Page({ params }: PageProps<"/krav/[token]">) {
  const { token } = await params;
  const result = await fetchPaymentRequest(token);

  // A real 404 for a request that is not there, and only for that: a timeout
  // means we did not manage to ask, not that the demand is gone.
  if (!result.ok) {
    if (result.reason === "not-found") notFound();
    return <LinkUnavailable message="Kunne ikke hente fakturaen akkurat nå" />;
  }

  const request = result.request;

  /**
   * A withdrawn demand stays 200. It is not missing — it existed, it was this
   * one, and "withdrawn" is a different thing to tell somebody than "never
   * was". Same reasoning as an expired payment link.
   */
  if (request.status === "cancelled") {
    return <LinkUnavailable message="Fakturaen er trukket tilbake" />;
  }

  const paid = request.status === "paid";

  return (
    <main className="pay-shell">
      <div className="pay-card">
        <div className="pay-merchant">
          <span className="pay-merchant-name">
            {request.sellerName ?? "Faktura"}
          </span>
        </div>

        <dl className="pay-details">
          <div className="pay-detail">
            <dt>Fakturanummer</dt>
            <dd>{request.externalNumber}</dd>
          </div>
          <div className="pay-detail">
            <dt>Forfall</dt>
            <dd>{formatDueDate(request.dueDate)}</dd>
          </div>
          {request.buyerName ? (
            <div className="pay-detail">
              <dt>Fakturert til</dt>
              <dd>{request.buyerName}</dd>
            </div>
          ) : null}
          {request.status === "overdue" ? (
            <div className="pay-detail">
              <dt>Status</dt>
              <dd>Forfalt</dd>
            </div>
          ) : null}
        </dl>

        {request.description ? (
          <dl className="pay-details">
            <div className="pay-detail">
              <dt>Gjelder</dt>
              <dd>{request.description}</dd>
            </div>
          </dl>
        ) : null}

        {request.lines?.length ? (
          <dl className="pay-details">
            {request.lines.map((line, i) => (
              <div className="pay-detail" key={i}>
                <dt>
                  {line.quantity
                    ? `${line.quantity}${line.unit ? ` ${line.unit}` : ""} × `
                    : ""}
                  {line.description}
                </dt>
                <dd>
                  {typeof line.amount === "number"
                    ? formatAmount(line.amount, request.currency)
                    : ""}
                </dd>
              </div>
            ))}
          </dl>
        ) : null}

        <div className="pay-total">
          <span className="pay-total-label">Å betale</span>
          <span className="pay-total-value">
            {formatAmount(request.amount, request.currency)}
          </span>
        </div>

        {paid ? (
          <div className="pay-result">
            <p>Fakturaen er betalt.</p>
          </div>
        ) : request.paymentLinkId ? (
          <Link className="pay-button" href={`/${request.paymentLinkId}`}>
            Betal med kort
          </Link>
        ) : (
          <div className="pay-result">
            <p>Denne fakturaen kan ikke betales med kort.</p>
          </div>
        )}

        {request.externalDocumentUrl ? (
          <a
            className="pay-button-secondary"
            href={request.externalDocumentUrl}
            target="_blank"
            rel="noreferrer noopener"
          >
            Se fakturaen
          </a>
        ) : null}
      </div>
    </main>
  );
}
