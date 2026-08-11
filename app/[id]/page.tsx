import { fetchPaymentLink } from "@/app/lib/paymentLink";
import LinkUnavailable from "./LinkUnavailable";
import PaymentPage from "./PaymentPage";

export const metadata = {
  title: "Betaling · Plorea",
};

export default async function Page({ params }: PageProps<"/[id]">) {
  const { id } = await params;
  const result = await fetchPaymentLink(id);

  if (!result.ok) {
    return <LinkUnavailable message="Fant ikke betalingslenken" />;
  }

  if (result.link.expired) {
    return <LinkUnavailable message="Betalingslenken er utløpt" />;
  }

  return <PaymentPage link={result.link} />;
}
