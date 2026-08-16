import assert from "node:assert/strict";
import test from "node:test";
import { calculateMonthlyPerformance } from "../lib/portfolio-performance.ts";

test("monthly return uses opening market value instead of historical purchase cost", () => {
  const result = calculateMonthlyPerformance({ month: "2026-07", openingValue: 200, closingValue: 220, flows: [] });
  assert.equal(result.capitalGain, 20);
  assert.equal(result.investedCapital, 200);
  assert.equal(result.portfolioPct, 10);
});

test("a contribution changes invested capital but is not reported as profit", () => {
  const result = calculateMonthlyPerformance({
    month: "2026-07",
    openingValue: 100,
    closingValue: 210,
    flows: [{ date: "2026-07-01", amount: 100 }],
  });
  assert.equal(result.capitalGain, 10);
  assert.equal(result.investedCapital, 200);
  assert.equal(result.portfolioPct, 5);
});

test("a sale removes capital without turning proceeds into a loss", () => {
  const result = calculateMonthlyPerformance({
    month: "2026-07",
    openingValue: 100,
    closingValue: 0,
    flows: [{ date: "2026-07-31", amount: -110 }],
  });
  assert.equal(result.capitalGain, 10);
  assert.ok(result.investedCapital > 96 && result.investedCapital < 97);
  assert.ok(result.portfolioPct > 10 && result.portfolioPct < 11);
});

test("a same-day round trip has a finite return based on contributed capital", () => {
  const result = calculateMonthlyPerformance({
    month: "2026-07",
    openingValue: 0,
    closingValue: 0,
    flows: [
      { date: "2026-07-10", amount: 100 },
      { date: "2026-07-10", amount: -110 },
    ],
  });
  assert.equal(result.capitalGain, 10);
  assert.ok(Number.isFinite(result.portfolioPct));
  assert.ok(result.portfolioPct > 13 && result.portfolioPct < 15);
});
