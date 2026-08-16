export type PerformanceFlow = {
  date: string;
  amount: number;
};

export type MonthlyPerformanceInput = {
  month: string;
  openingValue: number;
  closingValue: number;
  flows: PerformanceFlow[];
};

export type MonthlyPerformanceResult = {
  capitalGain: number;
  investedCapital: number;
  portfolioPct: number;
  netFlow: number;
  openingValue: number;
  closingValue: number;
};

function finite(value: number) {
  return Number.isFinite(value) ? value : 0;
}

function daysInMonth(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
}

function flowWeight(month: string, date: string) {
  const totalDays = daysInMonth(month);
  const parsed = new Date(`${date.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 7) !== month) return 0;
  return (totalDays - parsed.getUTCDate() + 1) / totalDays;
}

/** Monthly Modified Dietz return adjusted for the timing of capital flows. */
export function calculateMonthlyPerformance(input: MonthlyPerformanceInput): MonthlyPerformanceResult {
  const openingValue = finite(input.openingValue);
  const closingValue = finite(input.closingValue);
  const flows = input.flows.filter(flow => Number.isFinite(flow.amount));
  const netFlow = flows.reduce((sum, flow) => sum + flow.amount, 0);
  const weightedFlow = flows.reduce((sum, flow) => sum + flow.amount * flowWeight(input.month, flow.date), 0);
  const capitalGain = closingValue - openingValue - netFlow;
  const dietzCapital = openingValue + weightedFlow;
  const contributedCapital = openingValue + flows.reduce(
    (sum, flow) => sum + (flow.amount > 0 ? flow.amount * flowWeight(input.month, flow.date) : 0),
    0,
  );
  // A full same-day round trip can make the standard Dietz denominator zero
  // because its purchase and sale carry the same time weight. In that edge
  // case, use the positively contributed capital instead of emitting infinity.
  const investedCapital = dietzCapital > Math.max(0.01, contributedCapital * 0.01)
    ? dietzCapital
    : contributedCapital;
  const portfolioPct = investedCapital > 0 ? capitalGain / investedCapital * 100 : 0;

  return { capitalGain, investedCapital, portfolioPct, netFlow, openingValue, closingValue };
}
