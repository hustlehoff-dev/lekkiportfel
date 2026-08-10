import { eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { portfolioSnapshots } from "../../../db/schema";

const USER_ID = "user-1";

function canMigrate(request: Request) {
  const expected = process.env.LEGACY_MIGRATION_KEY;
  const supplied = request.headers.get("x-migration-key");
  return Boolean(expected && supplied && supplied === expected);
}

export async function GET(request: Request) {
  if (!canMigrate(request)) {
    return Response.json({ error: "Migracja starego portfela jest wyłączona lub kod jest nieprawidłowy." }, { status: 401 });
  }
  try {
    const [snapshot] = await getDb()
      .select()
      .from(portfolioSnapshots)
      .where(eq(portfolioSnapshots.userId, USER_ID))
      .limit(1);

    return Response.json({
      portfolio: snapshot ? JSON.parse(snapshot.data) : null,
      updatedAt: snapshot?.updatedAt ?? null,
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Nie udało się odczytać portfela" },
      { status: 500 },
    );
  }
}

export async function POST() {
  return Response.json(
    { error: "Stary zapis jest tylko do odczytu podczas jednorazowej migracji." },
    { status: 405, headers: { Allow: "GET" } },
  );
}
