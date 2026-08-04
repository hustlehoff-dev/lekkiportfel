import { eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { portfolioSnapshots } from "../../../db/schema";

const USER_ID = "user-1";
const MAX_PAYLOAD_BYTES = 4_000_000;

export async function GET() {
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

export async function POST(request: Request) {
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_PAYLOAD_BYTES) {
      return Response.json({ error: "Raport jest zbyt duży" }, { status: 413 });
    }

    const portfolio = JSON.parse(raw) as {
      positions?: unknown[];
      cash?: unknown[];
      trades?: unknown[];
      source?: string;
    };
    if (!Array.isArray(portfolio.positions) || !Array.isArray(portfolio.cash) || !Array.isArray(portfolio.trades)) {
      return Response.json({ error: "Nieprawidłowy format portfela" }, { status: 400 });
    }

    const now = new Date();
    await getDb()
      .insert(portfolioSnapshots)
      .values({ userId: USER_ID, data: raw, source: portfolio.source?.slice(0, 300) || "XTB", updatedAt: now })
      .onConflictDoUpdate({
        target: portfolioSnapshots.userId,
        set: { data: raw, source: portfolio.source?.slice(0, 300) || "XTB", updatedAt: now },
      });

    return Response.json({ saved: true, updatedAt: now });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Nie udało się zapisać portfela" },
      { status: 500 },
    );
  }
}
