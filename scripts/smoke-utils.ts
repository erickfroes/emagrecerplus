import pg from "pg";

function getDatabaseTarget(databaseUrl: string) {
  const parsed = new URL(databaseUrl);
  const databaseName = parsed.pathname.replace(/^\//, "") || "(sem nome)";
  const port = parsed.port || "5432";

  return `${parsed.hostname}:${port}/${databaseName}`;
}

export async function assertDatabaseAvailable(databaseUrl: string) {
  const target = getDatabaseTarget(databaseUrl);
  const client = new pg.Client({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 5_000,
  });

  try {
    await client.connect();
    await client.query("select 1");
  } catch (error) {
    const message =
      error instanceof Error && error.message.trim()
        ? error.message
        : "Falha desconhecida ao conectar no PostgreSQL.";

    if (typeof error === "object" && error && "code" in error && error.code === "ECONNREFUSED") {
      throw new Error(
        `Nao foi possivel conectar ao PostgreSQL em ${target}. Verifique se o Docker Desktop/daemon esta em execucao e se os containers do banco local foram iniciados.`
      );
    }

    throw new Error(`Falha ao validar o PostgreSQL em ${target}: ${message}`);
  } finally {
    await client.end().catch(() => undefined);
  }
}
