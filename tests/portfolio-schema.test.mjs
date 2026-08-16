import assert from "node:assert/strict";
import test from "node:test";
import {
  CURRENT_PORTFOLIO_SCHEMA_VERSION,
  PortfolioSchemaError,
  UnsupportedPortfolioSchemaVersionError,
  getPortfolioSchemaVersion,
  migratePortfolioData,
  portfolioSchemaMigrations,
} from "../lib/portfolio-schema.ts";

const legacyPortfolio = () => ({
  positions: [{ id: "position-1", symbol: "XTB.PL", quantity: 10, cost: 650, value: 720 }],
  cash: [{ id: "cash-1", date: "2026-01-02", type: "Wpłata", amount: 1000 }],
  trades: [],
  lots: [],
  taxLosses: { "2023": { amount: 1200, used: 300 } },
  cryptoTransactions: [],
  cryptoCostOverrides: { "2025": 500 },
  source: "Raport XTB",
  customUserField: { remains: true },
});

test("portfolio schema migrates legacy unversioned data without losing or mutating it", () => {
  const legacy = legacyPortfolio();
  const snapshot = structuredClone(legacy);
  const migrated = migratePortfolioData(legacy);

  assert.deepEqual(legacy, snapshot);
  assert.deepEqual(migrated, { ...snapshot, schemaVersion: CURRENT_PORTFOLIO_SCHEMA_VERSION });
  assert.equal(getPortfolioSchemaVersion(legacy), 0);
  assert.equal(getPortfolioSchemaVersion(migrated), CURRENT_PORTFOLIO_SCHEMA_VERSION);
});

test("portfolio schema migrations are ordered and contiguous", () => {
  assert.deepEqual(
    portfolioSchemaMigrations.map(({ from, to }) => [from, to]),
    [[0, 1]],
  );
  for (let index = 0; index < portfolioSchemaMigrations.length; index += 1) {
    const migration = portfolioSchemaMigrations[index];
    assert.equal(migration.from, index);
    assert.equal(migration.to, index + 1);
  }
});

test("migrating current portfolio data is idempotent", () => {
  const current = { ...legacyPortfolio(), schemaVersion: CURRENT_PORTFOLIO_SCHEMA_VERSION };
  const once = migratePortfolioData(current);
  const twice = migratePortfolioData(once);

  assert.deepEqual(once, current);
  assert.deepEqual(twice, once);
  assert.notEqual(once, current);
  assert.notEqual(twice, once);
});

test("portfolio schema rejects unsupported future versions without changing input", () => {
  const future = { ...legacyPortfolio(), schemaVersion: CURRENT_PORTFOLIO_SCHEMA_VERSION + 1 };
  const snapshot = structuredClone(future);

  assert.throws(
    () => migratePortfolioData(future),
    error => error instanceof UnsupportedPortfolioSchemaVersionError
      && error.version === CURRENT_PORTFOLIO_SCHEMA_VERSION + 1
      && error.supportedVersion === CURRENT_PORTFOLIO_SCHEMA_VERSION,
  );
  assert.deepEqual(future, snapshot);
});

test("portfolio schema rejects malformed records and versions", () => {
  assert.throws(() => migratePortfolioData(null), PortfolioSchemaError);
  assert.throws(() => migratePortfolioData([]), PortfolioSchemaError);
  assert.throws(() => migratePortfolioData({ schemaVersion: "1" }), PortfolioSchemaError);
  assert.throws(() => migratePortfolioData({ schemaVersion: -1 }), PortfolioSchemaError);
  assert.throws(() => migratePortfolioData({ schemaVersion: 1.5 }), PortfolioSchemaError);
});
