import { notFound } from "next/navigation";
import { fetchPaymentLink } from "@/app/lib/paymentLink";
import LinkUnavailable from "./LinkUnavailable";
import PaymentPage from "./PaymentPage";
import { BrandAccent } from "@/app/components/BrandAccent";

export const metadata = {
  title: "Betaling · Plorea",
};

export default async function Page({ params }: PageProps<"/[id]">) {
  const { id } = await params;
  const result = await fetchPaymentLink(id);

  // A real 404 for a link that is not there, and only for that: a timeout
  // means we did not manage to ask, not that the link is gone.
  if (!result.ok) {
    if (result.reason === "not-found") notFound();
    return <LinkUnavailable message="Kunne ikke hente betalingslenken akkurat nå" />;
  }

  /**
   * An expired link stays 200 on purpose. It is not missing — it existed, it
   * was this one, and "gone" is a different thing to tell somebody than "never
   * was". 410 would be the literal answer and there is no way to send one from
   * here; 404 would be wrong, so the status stays 200 and the page says it.
   */
  if (result.link.expired) {
    return <LinkUnavailable message="Betalingslenken er utløpt" />;
  }

  /**
   * Selgerens farge, HANDOFF §42.1. Fragmentet er der for at stilen skal
   * kunne stå ved siden av siden — `BrandAccent` rendrer `null` når det ikke
   * er noen farge, så dette er samme tre som før for hver tenant uten en.
   */
  return (
    <>
      <BrandAccent color={result.link.brandColor} />
      <PaymentPage link={result.link} />
    </>
  );
}
