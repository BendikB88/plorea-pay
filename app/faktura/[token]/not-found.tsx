import LinkUnavailable from "@/app/[id]/LinkUnavailable";

/**
 * Fant ikke fakturaen
 *
 * Rendered when the page calls `notFound()`, which is the only way an App
 * Router page can answer a real **404** — returning a component from the page
 * itself answers 200 with a "not found" picture on it, which is a page that
 * lies to every crawler, monitor and `curl` that ever looks at it.
 *
 * Colocated rather than relying on the root `not-found`, so the message stays
 * the specific one. A customer who followed a dead invoice link should not be
 * told the payment link was not found.
 *
 * This is also what a **draft** answers. A draft has no number and is not a
 * document, so it is not readable even by somebody holding the token — and the
 * answer is deliberately the same as for a token that does not exist, because
 * telling the two apart would say something about an invoice nobody has issued.
 */
export default function NotFound() {
  return <LinkUnavailable message="Fant ikke fakturaen" />;
}
