import SetupTest from "./SetupTest";

export const metadata = {
  title: "Testside · kortregistrering",
  robots: { index: false, follow: false },
};

function first(value: string | string[] | undefined): string | null {
  return (Array.isArray(value) ? value[0] : value) ?? null;
}

// Kun for testing: tar ferdig opprettet Adyen-sesjon rett fra URL-en.
// /setup-test-b7x9k2?sessionId=…&sessionData=…&clientKey=…[&environment=test|live]
export default async function Page({ searchParams }: PageProps<"/setup-test-b7x9k2">) {
  const params = await searchParams;

  return (
    <SetupTest
      sessionId={first(params.sessionId)}
      sessionData={first(params.sessionData)}
      clientKey={first(params.clientKey)}
      environment={first(params.environment) === "live" ? "live" : "test"}
    />
  );
}
