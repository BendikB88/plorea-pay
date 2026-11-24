import { brandVariables } from "../lib/brandColor";

/**
 * Selgerens aksentfarge, satt på `:root` for denne ene sidevisningen.
 *
 * HANDOFF §42.1. Fargen kommer fra API-et, og **ingenting rendres** når den
 * ikke er satt eller ikke kan leses — se `brandVariables`. Da står
 * `globals.css` som den står, og siden er den samme siden som i går.
 *
 * ── Hvorfor en `<style>` og ikke en inline-stil på en wrapper ────────────
 *
 * Variablene brukes av regler som sikter på `:root` og av Adyens egne
 * `--adyen-sdk-*`-variabler i `globals.css`, som også er definert på `:root`.
 * En inline-stil på en wrapper ville truffet barna, men ikke reglene som alt
 * leser `:root` — og ikke drop-in-en, som rendres i sitt eget tre.
 *
 * ── Hvorfor ingen `precedence` ──────────────────────────────────────────
 *
 * React 19 kan hoiste en `<style precedence>` til `<head>`, men den dedupliserer
 * og **beholder** den på tvers av klientnavigasjoner. To tenanter med ulik
 * farge kunne da arvet hverandres: åpner noen en kvittering fra én selger og
 * navigerer videre til en fra en annen, ville den første stilen fortsatt ligget
 * der. En `<style>` som står på plass fjernes når komponenten forsvinner, og
 * det er oppførselen denne siden skal ha.
 *
 * ── Og hvorfor det er trygt å skrive fargen rått ────────────────────────
 *
 * Verdien er aldri kallerens tekst. `brandVariables` slipper bare gjennom
 * `/^#[0-9a-f]{6}$/`, og den lysere varianten regnes ut av den — så det som
 * havner i stilarket er seks heksadesimale tegn og ingenting annet. Uten den
 * sperren ville dette vært et sted en tenant kunne skrevet CSS inn på en side
 * kundene deres åpner.
 *
 * Verdien reiser likevel **rått** inn i sidens HTML på `/{id}`: `link` sendes
 * til en klientkomponent, og React serialiserer propene inn i RSC-nyttelasten.
 * Der er den JSON-escapet tekst i et script og ikke CSS, så den kan ikke
 * styles med — men den er verdt å vite om: sperren står ved **bruken**, ikke
 * ved inngangen, og API-et lagrer bare `#rrggbb` fordi
 * `validateSellerPatch` krever det. Begge leddene trengs.
 */
export function BrandAccent({ color }: { color?: string | null }) {
  const variables = brandVariables(color);
  if (!variables) return null;
  return <style>{`:root{${variables}}`}</style>;
}
