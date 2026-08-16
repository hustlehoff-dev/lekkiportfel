export const CURRENT_PORTFOLIO_SCHEMA_VERSION = 1 as const;

type PortfolioDataRecord = Record<string, unknown>;

export type CurrentPortfolioData<T extends object = PortfolioDataRecord> =
  Omit<T, "schemaVersion"> & { schemaVersion: typeof CURRENT_PORTFOLIO_SCHEMA_VERSION };

export type PortfolioSchemaMigration = Readonly<{
  from: number;
  to: number;
  migrate: (portfolio: Readonly<PortfolioDataRecord>) => PortfolioDataRecord;
}>;

export class PortfolioSchemaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PortfolioSchemaError";
  }
}

export class UnsupportedPortfolioSchemaVersionError extends PortfolioSchemaError {
  readonly version: number;
  readonly supportedVersion: number;

  constructor(version: number) {
    super(`Wersja danych portfela ${version} jest nowsza niż obsługiwana wersja ${CURRENT_PORTFOLIO_SCHEMA_VERSION}.`);
    this.name = "UnsupportedPortfolioSchemaVersionError";
    this.version = version;
    this.supportedVersion = CURRENT_PORTFOLIO_SCHEMA_VERSION;
  }
}

const migrations: readonly PortfolioSchemaMigration[] = Object.freeze([
  Object.freeze({
    from: 0,
    to: 1,
    migrate: (portfolio: Readonly<PortfolioDataRecord>) => ({
      ...portfolio,
      schemaVersion: 1,
    }),
  }),
]);

export const portfolioSchemaMigrations = migrations;

function isPortfolioDataRecord(value: unknown): value is PortfolioDataRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function getPortfolioSchemaVersion(portfolio: unknown): number {
  if (!isPortfolioDataRecord(portfolio)) {
    throw new PortfolioSchemaError("Dane portfela muszą być obiektem.");
  }

  const version = portfolio.schemaVersion;
  if (version === undefined) return 0;
  if (typeof version !== "number" || !Number.isSafeInteger(version) || version < 0) {
    throw new PortfolioSchemaError("Wersja danych portfela jest nieprawidłowa.");
  }
  return version;
}

export function migratePortfolioData<T extends object>(portfolio: T): CurrentPortfolioData<T> {
  let version = getPortfolioSchemaVersion(portfolio);

  if (version > CURRENT_PORTFOLIO_SCHEMA_VERSION) {
    throw new UnsupportedPortfolioSchemaVersionError(version);
  }

  let migrated: PortfolioDataRecord = { ...(portfolio as PortfolioDataRecord) };
  while (version < CURRENT_PORTFOLIO_SCHEMA_VERSION) {
    const migration = migrations.find(candidate => candidate.from === version);
    if (!migration || migration.to <= version) {
      throw new PortfolioSchemaError(`Brak migracji danych portfela z wersji ${version}.`);
    }
    migrated = migration.migrate(migrated);
    const migratedVersion = getPortfolioSchemaVersion(migrated);
    if (migratedVersion !== migration.to) {
      throw new PortfolioSchemaError(`Migracja danych portfela z wersji ${version} zakończyła się nieprawidłową wersją ${migratedVersion}.`);
    }
    version = migratedVersion;
  }

  return migrated as CurrentPortfolioData<T>;
}
