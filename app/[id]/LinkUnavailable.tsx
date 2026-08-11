export default function LinkUnavailable({ message }: { message: string }) {
  return (
    <main className="unavailable">
      <div className="unavailable-inner">
        <span className="wordmark wordmark-light">
          done<span className="wordmark-degree">°</span>
        </span>
        <h1 className="unavailable-title">{message}</h1>
        <p className="unavailable-body">
          Kontakt avsender for å få en ny betalingslenke.
        </p>
      </div>
    </main>
  );
}
