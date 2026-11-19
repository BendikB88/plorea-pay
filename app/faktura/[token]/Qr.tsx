import QRCode from "qrcode";

/**
 * QR-koden, som SVG-rektangler og ikke som et bilde.
 *
 * `QRCode.create` gir modulmatrisen, og hver modul blir et `<rect>`. Det gir en
 * **vektor**: skarp i enhver zoom og i enhver utskrift, noen hundre byte, og
 * ingen klientkomponent — alt rendres på serveren som ren markup.
 *
 * `errorCorrectionLevel: "M"` tåler omtrent 15 % skade. Et fakturaark blir
 * brettet og kopiert, så det er ikke teoretisk. Og en kode som ikke skannes er
 * verre enn ingen kode: da taster folk adressen, og de taster den feil.
 *
 * Den hvite rammen er ikke pynt. Uten den har skanneren ingenting å kjenne
 * kanten på, og en kode som ligger inntil en strek leses ikke.
 */
export default function Qr({ value, size = 96 }: { value: string; size?: number }) {
  const qr = QRCode.create(value, { errorCorrectionLevel: "M" });
  const n = qr.modules.size;
  const data = qr.modules.data;
  const quiet = 2;
  const span = n + quiet * 2;

  const rects: React.ReactElement[] = [];
  for (let row = 0; row < n; row += 1) {
    for (let col = 0; col < n; col += 1) {
      if (!data[row * n + col]) continue;
      rects.push(
        <rect
          key={`${row}-${col}`}
          x={col + quiet}
          y={row + quiet}
          width={1}
          height={1}
        />
      );
    }
  }

  return (
    <svg
      className="invoice-qr"
      width={size}
      height={size}
      viewBox={`0 0 ${span} ${span}`}
      shapeRendering="crispEdges"
      role="img"
      aria-label="QR-kode til betalingssiden"
    >
      <rect x={0} y={0} width={span} height={span} fill="#ffffff" />
      <g fill="#000000">{rects}</g>
    </svg>
  );
}
