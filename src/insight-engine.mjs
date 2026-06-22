const ESR_BENCHMARKS = { p50: 0, p75: 23, p90: 40, p98: 46 };
const VCPU_BENCHMARKS = { good: 0.04, average: 0.08, poor: 0.12 };
const WASTE_INDUSTRY_AVG = 29;

const PRIORITY_ORDER = ['DO_NOW', 'PLAN', 'AUTOMATE', 'SKIP'];

export class InsightEngine {
  constructor(data) {
    this.unitEconomics = data?.unitEconomics ?? {};
    this.rightsizing = data?.rightsizing ?? [];
    this.anomalies = data?.anomalies ?? [];
    this.metrics = data?.metrics ?? {};
    this.historicalMonths = data?.historicalMonths ?? [];
  }

  generateInsights() {
    const actions = this.#generateActions();
    return {
      tldr: this.#generateTldr(actions),
      actions,
      benchmarks: this.#generateBenchmarks(),
      trends: this.#generateTrendAlerts(),
      alerts: this.#generateCorrelations(),
    };
  }

  // --- TL;DR ---

  #generateTldr(actions) {
    const budgetSentence = this.#budgetSentence();
    const efficiencySentence = this.#efficiencySentence();
    const urgentAction = actions[0]
      ? `Most urgent: ${actions[0].title} (${this.#fmt(actions[0].impact)}/mo impact).`
      : 'No urgent actions identified.';
    return [budgetSentence, efficiencySentence, urgentAction];
  }

  #budgetSentence() {
    const { budgetVariance, projectedMonthly, ytdBudgetPercent } = this.metrics;
    if (budgetVariance == null) return 'Budget status unavailable.';
    if (budgetVariance <= 0)
      return `On track: projected spend ${this.#fmt(projectedMonthly)} is ${this.#fmt(Math.abs(budgetVariance))} under budget (${(ytdBudgetPercent ?? 0).toFixed(0)}% YTD utilization).`;
    if (budgetVariance > 0 && (ytdBudgetPercent ?? 0) < 100)
      return `At risk: projected spend ${this.#fmt(projectedMonthly)} is ${this.#fmt(budgetVariance)} over current pace (${(ytdBudgetPercent ?? 0).toFixed(0)}% YTD utilization).`;
    return `Over budget: projected spend ${this.#fmt(projectedMonthly)} exceeds budget by ${this.#fmt(budgetVariance)} (${(ytdBudgetPercent ?? 0).toFixed(0)}% YTD utilization).`;
  }

  #efficiencySentence() {
    const trend = this.#costPerVcpuTrend();
    if (!trend.direction) return 'Efficiency trend data unavailable.';
    const dir = trend.direction;
    return `Efficiency ${dir}: cost per vCPU ${dir === 'improving' ? 'decreased' : dir === 'degrading' ? 'increased' : 'remained stable'} over the last ${trend.months} months (${trend.latest?.toFixed(4) ?? '?'}/vCPU-hr).`;
  }

  // --- Actions ---

  #generateActions() {
    const actions = [
      ...this.#rightsizingActions(),
      ...this.#esrActions(),
      ...this.#anomalyActions(),
      ...this.#trendActions(),
    ];
    return actions.sort((a, b) => {
      const pi = PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority);
      return pi !== 0 ? pi : b.impact - a.impact;
    });
  }

  #rightsizingActions() {
    const byAccount = {};
    for (const r of this.rightsizing) {
      const acct = r.vendorAccountName ?? 'Unknown';
      byAccount[acct] = byAccount[acct] || { savings: 0, count: 0 };
      byAccount[acct].savings += r.monthlySavings ?? r.potentialSavings ?? 0;
      byAccount[acct].count++;
    }
    return Object.entries(byAccount).map(([acct, { savings, count }]) => ({
      priority: savings > 5000 ? 'DO_NOW' : savings > 1000 ? 'PLAN' : 'AUTOMATE',
      title: `Rightsize ${count} instance${count > 1 ? 's' : ''} in ${acct}`,
      impact: savings,
      effort: count > 10 ? 'high' : count > 3 ? 'medium' : 'low',
      detail: `${count} recommendations totaling ${this.#fmt(savings)}/mo savings.`,
      category: 'rightsizing',
    }));
  }

  #esrActions() {
    const esr = this.#currentEsr();
    if (esr == null || esr >= ESR_BENCHMARKS.p75) return [];
    const spend = this.metrics.currentTotal ?? 0;
    const potentialSavings = spend * 0.23; // typical RI/SP discount
    return [{
      priority: 'PLAN',
      title: 'Purchase commitments (RIs/Savings Plans) to improve ESR',
      impact: potentialSavings,
      effort: 'medium',
      detail: `Current ESR ${esr.toFixed(1)}% is below 75th percentile (${ESR_BENCHMARKS.p75}%). Committing could save ~${this.#fmt(potentialSavings)}/mo.`,
      category: 'commitments',
    }];
  }

  #anomalyActions() {
    return this.anomalies
      .filter(a => (a.severity ?? '').toLowerCase() === 'high' || (a.percentageIncrease ?? 0) > 50)
      .map(a => ({
        priority: 'DO_NOW',
        title: `Investigate anomaly in ${a.vendorAccountName ?? 'unknown'}/${a.service ?? 'unknown'}`,
        impact: a.cost ?? 0,
        effort: 'low',
        detail: `${(a.percentageIncrease ?? 0).toFixed(0)}% spike on ${a.date ?? 'unknown date'} (${this.#fmt(a.cost)}).`,
        category: 'anomaly',
      }));
  }

  #trendActions() {
    const trend = this.#costPerVcpuTrend();
    if (trend.direction !== 'degrading') return [];
    return [{
      priority: 'PLAN',
      title: 'Address degrading cost efficiency (cost/vCPU trending up)',
      impact: (this.metrics.currentTotal ?? 0) * 0.05,
      effort: 'medium',
      detail: `Cost per vCPU has increased over ${trend.months} consecutive months.`,
      category: 'efficiency',
    }];
  }

  // --- Benchmarks ---

  #generateBenchmarks() {
    const esr = this.#currentEsr();
    const costPerVcpu = this.#latestCostPerVcpu();
    const waste = this.#wastePercent();

    return {
      esr: {
        value: esr,
        percentile: this.#esrPercentile(esr),
        rating: esr == null ? 'unknown' : esr >= ESR_BENCHMARKS.p90 ? 'excellent' : esr >= ESR_BENCHMARKS.p75 ? 'good' : esr >= ESR_BENCHMARKS.p50 ? 'average' : 'poor',
      },
      waste: {
        value: waste,
        industryAverage: WASTE_INDUSTRY_AVG,
        rating: waste == null ? 'unknown' : waste < WASTE_INDUSTRY_AVG ? 'better than average' : 'worse than average',
      },
      costPerVcpu: {
        value: costPerVcpu,
        rating: costPerVcpu == null ? 'unknown' : costPerVcpu <= VCPU_BENCHMARKS.good ? 'good' : costPerVcpu <= VCPU_BENCHMARKS.average ? 'average' : 'poor',
        thresholds: VCPU_BENCHMARKS,
      },
    };
  }

  // --- Trend Alerts ---

  #generateTrendAlerts() {
    const alerts = [];
    const months = this.#monthlyMetrics();

    // Spend acceleration
    if (months.length >= 3) {
      const growthRates = [];
      for (let i = 1; i < months.length; i++) {
        const prev = months[i - 1].cost;
        if (prev > 0) growthRates.push((months[i].cost - prev) / prev);
      }
      if (growthRates.length >= 2 && growthRates[growthRates.length - 1] > growthRates[growthRates.length - 2] && growthRates[growthRates.length - 1] > 0) {
        alerts.push({ type: 'spend_acceleration', message: 'MoM growth rate is increasing — spend is accelerating.', severity: 'warning' });
      }
    }

    // Efficiency degradation
    const trend = this.#costPerVcpuTrend();
    if (trend.direction === 'degrading' && trend.months >= 3) {
      alerts.push({ type: 'efficiency_degradation', message: `Cost per vCPU has trended up for ${trend.months} consecutive months.`, severity: 'warning' });
    }

    // Coverage drift
    const esrValues = months.map(m => m.esr).filter(v => v != null);
    if (esrValues.length >= 2 && esrValues[esrValues.length - 1] < esrValues[esrValues.length - 2]) {
      alerts.push({ type: 'coverage_drift', message: 'ESR decreased month over month — commitment coverage is drifting.', severity: 'info' });
    }

    // Rightsizing backlog
    if (this.rightsizing.length > 20) {
      alerts.push({ type: 'rightsizing_backlog', message: `${this.rightsizing.length} rightsizing recommendations pending — backlog may be growing.`, severity: 'info' });
    }

    return alerts;
  }

  // --- Cross-Metric Correlations ---

  #generateCorrelations() {
    const correlations = [];
    const trend = this.#costPerVcpuTrend();
    const mom = this.metrics.momChange ?? 0;

    // Cost/vCPU up + spend flat = fewer expensive instances
    if (trend.direction === 'degrading' && Math.abs(mom) < 5) {
      correlations.push({ pattern: 'expensive_instances', message: 'Cost per vCPU rising while spend is flat suggests a shift toward fewer, more expensive instances.' });
    }

    // ESR down + spend up = growth outpacing commitments
    const months = this.#monthlyMetrics();
    const esrValues = months.map(m => m.esr).filter(v => v != null);
    if (esrValues.length >= 2 && esrValues[esrValues.length - 1] < esrValues[esrValues.length - 2] && mom > 5) {
      correlations.push({ pattern: 'growth_outpacing_commitments', message: 'ESR declining while spend grows indicates growth is outpacing commitment coverage.' });
    }

    // High rightsizing + low adoption = stale recommendations
    if (this.rightsizing.length > 15) {
      correlations.push({ pattern: 'stale_recommendations', message: `${this.rightsizing.length} pending rightsizing recommendations suggest low adoption — consider automating or reviewing staleness.` });
    }

    return correlations;
  }

  // --- Helpers ---

  #monthlyMetrics() {
    return this.historicalMonths.map(m => {
      const r = m?.data?.results ?? m?.data ?? {};
      const cost = parseFloat(r.total_amortized_cost) || 0;
      const onDemand = parseFloat(r.public_on_demand_cost) || 0;
      const vcpu = parseFloat(r.vcpu_hours) || 0;
      const esr = onDemand > 0 ? ((onDemand - cost) / onDemand) * 100 : null;
      const costPerVcpu = vcpu > 0 ? cost / vcpu : null;
      return { month: m.month, cost, onDemand, vcpu, esr, costPerVcpu };
    });
  }

  #currentEsr() {
    const summary = this.unitEconomics?.summary?.current;
    const onDemand = summary?.onDemand ?? 0;
    const amortized = summary?.amortized ?? 0;
    if (onDemand <= 0) return null;
    return ((onDemand - amortized) / onDemand) * 100;
  }

  #latestCostPerVcpu() {
    const months = this.#monthlyMetrics();
    for (let i = months.length - 1; i >= 0; i--) {
      if (months[i].costPerVcpu != null) return months[i].costPerVcpu;
    }
    return null;
  }

  #costPerVcpuTrend() {
    const months = this.#monthlyMetrics();
    const values = months.map(m => m.costPerVcpu).filter(v => v != null);
    if (values.length < 2) return { direction: null, months: 0, latest: values[values.length - 1] ?? null };
    let consecutive = 0;
    for (let i = values.length - 1; i > 0; i--) {
      if (values[i] > values[i - 1]) consecutive++;
      else break;
    }
    let decConsecutive = 0;
    for (let i = values.length - 1; i > 0; i--) {
      if (values[i] < values[i - 1]) decConsecutive++;
      else break;
    }
    const direction = consecutive >= 2 ? 'degrading' : decConsecutive >= 2 ? 'improving' : 'stable';
    return { direction, months: Math.max(consecutive, decConsecutive), latest: values[values.length - 1] };
  }

  #wastePercent() {
    const esr = this.#currentEsr();
    if (esr == null) return null;
    return Math.max(0, 100 - esr);
  }

  #esrPercentile(esr) {
    if (esr == null) return null;
    if (esr >= ESR_BENCHMARKS.p98) return 98;
    if (esr >= ESR_BENCHMARKS.p90) return 90;
    if (esr >= ESR_BENCHMARKS.p75) return 75;
    if (esr >= ESR_BENCHMARKS.p50) return 50;
    return 25;
  }

  #fmt(n) {
    if (n == null) return '$0';
    return '$' + Math.round(n).toLocaleString('en-US');
  }
}
