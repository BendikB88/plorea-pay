import LinkUnavailable from "@/app/[id]/LinkUnavailable";

/**
 * Fant ikke kvitteringen
 *
 * Rendered when the page calls `notFound()`, which is the only way an App
 * Router page can answer a real **404** — returning a component from the page
 * itself answers 200 with a "not found" picture on it, which is a page that
 * lies to every crawler, monitor and `curl` that ever looks at it.
 *
 * Colocated rather than relying on the root `not-found`, so the message stays
 * the specific one. A customer who followed a dead receipt link should not be
 * told the payment link was not found.
 */
export default function NotFound() {
  return <LinkUnavailable message="Fant ikke kvitteringen" />;
}
