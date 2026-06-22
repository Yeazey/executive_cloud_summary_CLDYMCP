#!/usr/bin/env node
import { CloudabilityDataCollector } from './data-collector.mjs';
import { UnitEconomicsCalculator } from './unit-economics.mjs';
import { InsightEngine } from './insight-engine.mjs';
import { CHART_COLORS, OUTPUT_PATH, BUDGET_CONFIG, DATE_CONFIG } from './config.mjs';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';

const CLDY_BASE = 'https://app.apptio.com/cloudability';
const COMPUTE_SERVICE_PATTERNS = ['EC2', 'Compute', 'Virtual Machine', 'GCE', 'OCI Compute', 'VM', 'Container', 'ECS', 'EKS', 'AKS', 'GKE'];
const MATURITY_MAP = { rightsizing: 'Crawl', commitments: 'Walk', efficiency: 'Run', anomaly: 'Crawl' };

class DashboardGenerator {
  constructor(data) {
    this.data = data;
    this.unitEconomics = null;
    this.insights = null;

    if (data.currentMonthResources && data.previousMonthResources) {
      const calculator = new UnitEconomicsCalculator(
        data.currentMonthResources,
        data.previousMonthResources,
        data.rightsizing || []
      );
      this.unitEconomics = calculator.calculateAll();
    }
  }

  calculateMetrics() {
    const current = this.aggregateByAccount(this.data.currentMonth?.results || []);
    const previous = this.aggregateByAccount(this.data.previousMonth?.results || []);
    const ytd = this.aggregateByMonth(this.data.yearToDate?.results || []);

    const currentTotal = Object.values(current).reduce((s, v) => s + v, 0);
    const previousTotal = Object.values(previous).reduce((s, v) => s + v, 0);
    const ytdTotal = Object.values(ytd).reduce((s, v) => s + v, 0);

    const cm = DATE_CONFIG.getCurrentMonth();
    const daysInMonth = new Date(cm.year, cm.month, 0).getDate();
    const projectedMonthly = currentTotal > 0 ? (currentTotal / cm.day) * daysInMonth : 0;
    const momChange = previousTotal > 0 ? ((projectedMonthly - previousTotal) / previousTotal) * 100 : 0;
    const avgMonthly = cm.month > 0 ? ytdTotal / cm.month : 0;
    const projectedYearEnd = ytdTotal + (avgMonthly * (12 - cm.month));

    return {
      currentTotal, previousTotal, projectedMonthly, ytdTotal, momChange, avgMonthly,
      projectedYearEnd,
      budgetVariance: projectedYearEnd - BUDGET_CONFIG.annual,
      ytdBudgetPercent: BUDGET_CONFIG.annual > 0 ? (ytdTotal / BUDGET_CONFIG.annual) * 100 : 0
    };
  }

  aggregateByAccount(results) {
    const agg = {};
    results.forEach(r => {
      const k = r.vendor_account_name || 'Unknown';
      agg[k] = (agg[k] || 0) + parseFloat(r.unblended_cost || r.total_amortized_cost || 0);
    });
    return agg;
  }

  aggregateByMonth(results) {
    const agg = {};
    results.forEach(r => {
      const k = r.month || 'Unknown';
      agg[k] = (agg[k] || 0) + parseFloat(r.unblended_cost || 0);
    });
    return agg;
  }

  generateInsights(metrics) {
    const engine = new InsightEngine({
      unitEconomics: this.unitEconomics?.summary || {},
      rightsizing: this.data.rightsizing || [],
      anomalies: this.data.anomalies || [],
      metrics,
      historicalMonths: this.data.historicalMonths || []
    });
    return engine.generateInsights();
  }

  fmt(n) {
    if (n == null || isNaN(n)) return '$0';
    const abs = Math.abs(n);
    if (abs >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
    if (abs >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
    return `$${n.toFixed(0)}`;
  }

  pct(n) { return n != null ? `${n >= 0 ? '+' : ''}${n.toFixed(1)}%` : '0%'; }

  parseAIData() {
    const aiRaw = this.data.aiSpend?.results || [];
    const aiRows = aiRaw.filter(r =>
      (r.enhanced_service_name || '').match(/bedrock|openai|foundry|cognitive|sagemaker|vertex/i) ||
      (r.usage_type || '').match(/token/i)
    );
    const models = {};
    aiRows.forEach(r => {
      const cost = parseFloat(r.total_amortized_cost || 0);
      const qty = parseFloat(r.usage_quantity || 0);
      const ut = (r.usage_type || '').toLowerCase();
      const svc = r.enhanced_service_name || 'Unknown';
      const isInput = ut.includes('input');
      const isOutput = ut.includes('output');
      if (!isInput && !isOutput) return;
      let modelName = (r.usage_type || '').replace(/^[A-Z]{2,4}\d?-/, '').replace(/-(input|output)-tokens$/i, '').replace(/-(input|output)$/i, '');
      if (!modelName) modelName = 'Unknown';
      if (!models[modelName]) models[modelName] = { cost: 0, input: 0, output: 0, provider: svc };
      models[modelName].cost += cost;
      if (isInput) models[modelName].input += qty;
      if (isOutput) models[modelName].output += qty;
    });
    return { models };
  }

  cldyLink(route, params = {}, label = '🔗') {
    let url;
    if (route === 'report') {
      const cm = DATE_CONFIG.getCurrentMonth();
      const qp = new URLSearchParams();
      qp.set('start_date', cm.start + ' at 00:00:00');
      qp.set('end_date', cm.end + ' at 23:59:59');
      if (params.dimensions) qp.set('dimensions', params.dimensions);
      if (params.metrics) qp.set('metrics', params.metrics);
      qp.set('sort_by', params.sort_by || 'total_amortized_cost');
      qp.set('order', 'desc');
      url = `${CLDY_BASE}#/reports/report?${qp.toString()}`;
    } else {
      url = `${CLDY_BASE}#/${route}`;
    }
    return `<a href="${url}" target="_blank" title="Open in Cloudability" style="text-decoration:none;margin-left:6px;font-size:0.8em;opacity:0.7">${label}</a>`;
  }

  isComputeService(name) {
    return COMPUTE_SERVICE_PATTERNS.some(p => name.toUpperCase().includes(p.toUpperCase()));
  }

  getComputeServices(byService) {
    return Object.entries(byService || {}).filter(([svc, d]) => {
      const vcpuHrs = d?.current?.resources?.vcpuHours ?? 0;
      return vcpuHrs > 0 && this.isComputeService(svc);
    });
  }

  generateCSS() {
    return `
    :root{--bg:#0f172a;--surface:#1e293b;--surface2:#273548;--border:#334155;--text:#e2e8f0;--muted:#94a3b8;--accent:#6366f1;--positive:#4ade80;--negative:#f87171;--warning:#fbbf24;--info:#3b82f6}
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:'Inter',system-ui,sans-serif;background:var(--bg);color:var(--text);min-height:100vh;padding:24px;font-size:14px;font-variant-numeric:tabular-nums}
    .dashboard{max-width:1440px;margin:0 auto}
    .header{display:flex;align-items:center;justify-content:space-between;margin-bottom:24px;padding:20px 28px;background:var(--surface);border-radius:12px;border:1px solid var(--border)}
    .header h1{font-size:1.4em;font-weight:700}
    .header .meta{color:var(--muted);font-size:0.8em}
    .header-actions{display:flex;align-items:center;gap:12px}
    .summarize-btn{padding:8px 16px;background:var(--accent);color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:600;font-size:0.85em;transition:all .2s}
    .summarize-btn:hover{background:#4f46e5;transform:translateY(-1px)}
    .status-badge{display:inline-flex;align-items:center;gap:6px;padding:6px 14px;border-radius:20px;font-weight:600;font-size:0.85em}
    .status-green{background:rgba(74,222,128,0.12);color:var(--positive)}
    .status-yellow{background:rgba(251,191,36,0.12);color:var(--warning)}
    .status-red{background:rgba(248,113,113,0.12);color:var(--negative)}
    .nav{display:flex;gap:4px;margin-bottom:20px;background:var(--surface);padding:4px;border-radius:10px;border:1px solid var(--border);flex-wrap:wrap}
    .nav button{background:none;border:none;padding:10px 20px;border-radius:8px;color:var(--muted);cursor:pointer;font-weight:500;font-size:0.85em;transition:all .2s}
    .nav button:hover{color:var(--text);background:var(--surface2)}
    .nav button.active{background:var(--accent);color:#fff}
    .page{display:none}.page.active{display:block}
    .grid{display:grid;gap:16px;margin-bottom:20px}
    .grid-5{grid-template-columns:repeat(auto-fit,minmax(200px,1fr))}
    .grid-3{grid-template-columns:repeat(auto-fit,minmax(280px,1fr))}
    .grid-2{grid-template-columns:repeat(auto-fit,minmax(400px,1fr))}
    .card{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:20px}
    .kpi-card{position:relative;overflow:hidden}
    .kpi-label{font-size:0.7em;text-transform:uppercase;letter-spacing:1.5px;color:var(--muted);margin-bottom:8px}
    .kpi-value{font-size:2.2em;font-weight:800;line-height:1.1}
    .kpi-delta{font-size:0.8em;margin-top:6px;display:flex;align-items:center;gap:4px}
    .kpi-delta.up{color:var(--positive)}.kpi-delta.down{color:var(--negative)}.kpi-delta.neutral{color:var(--muted)}
    .kpi-context{font-size:0.75em;color:var(--muted);margin-top:8px;padding-top:8px;border-top:1px solid var(--border)}
    .tldr{background:linear-gradient(135deg,rgba(99,102,241,0.08),rgba(139,92,246,0.08));border:1px solid rgba(99,102,241,0.2);border-radius:12px;padding:20px;margin-bottom:20px}
    .tldr p{margin-bottom:6px;line-height:1.5}.tldr strong{color:var(--accent)}
    .insight-card{border-left:4px solid var(--accent);margin-bottom:12px}
    .insight-card.DO_NOW{border-left-color:var(--negative)}
    .insight-card.PLAN{border-left-color:var(--warning)}
    .insight-card.AUTOMATE{border-left-color:var(--positive)}
    .insight-card.SKIP{border-left-color:var(--muted)}
    .insight-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}
    .insight-priority{font-size:0.7em;text-transform:uppercase;letter-spacing:1px;padding:3px 8px;border-radius:4px;font-weight:700}
    .insight-priority.DO_NOW{background:rgba(248,113,113,0.15);color:var(--negative)}
    .insight-priority.PLAN{background:rgba(251,191,36,0.15);color:var(--warning)}
    .insight-priority.AUTOMATE{background:rgba(74,222,128,0.15);color:var(--positive)}
    .insight-impact{font-weight:700;color:var(--positive)}
    .chart-wrap{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:20px;margin-bottom:20px}
    .chart-wrap h3{font-size:0.9em;color:var(--muted);margin-bottom:12px;text-transform:uppercase;letter-spacing:1px}
    .chart-container{position:relative;height:280px}
    table{width:100%;border-collapse:collapse;font-size:0.85em}
    th{text-align:left;padding:10px 12px;color:var(--muted);font-size:0.75em;text-transform:uppercase;letter-spacing:1px;border-bottom:1px solid var(--border)}
    td{padding:10px 12px;border-bottom:1px solid var(--border)}
    tr:hover td{background:var(--surface2)}
    .badge{display:inline-block;padding:2px 8px;border-radius:4px;font-size:0.75em;font-weight:600}
    .badge-green{background:rgba(74,222,128,0.12);color:var(--positive)}
    .badge-red{background:rgba(248,113,113,0.12);color:var(--negative)}
    .badge-yellow{background:rgba(251,191,36,0.12);color:var(--warning)}
    .badge-blue{background:rgba(99,102,241,0.12);color:var(--accent)}
    .maturity-badge{display:inline-block;padding:2px 8px;border-radius:4px;font-size:0.7em;font-weight:700;text-transform:uppercase;letter-spacing:0.5px}
    .maturity-crawl{background:rgba(74,222,128,0.12);color:var(--positive)}
    .maturity-walk{background:rgba(251,191,36,0.12);color:var(--warning)}
    .maturity-run{background:rgba(248,113,113,0.12);color:var(--negative)}
    .benchmark-bar{height:8px;background:var(--border);border-radius:4px;overflow:hidden;margin-top:6px}
    .benchmark-fill{height:100%;border-radius:4px;transition:width .3s}
    .drill-panel{display:none;margin-top:12px;padding:16px;background:var(--bg);border-radius:8px;border:1px solid var(--border)}
    .drill-panel.open{display:block}
    .drill-toggle{cursor:pointer;color:var(--accent);font-size:0.8em;font-weight:500}
    .drill-toggle:hover{text-decoration:underline}
    .pivot-controls{display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap}
    .pivot-btn{padding:6px 12px;border-radius:6px;border:1px solid var(--border);background:var(--surface);color:var(--muted);cursor:pointer;font-size:0.8em;transition:all .15s}
    .pivot-btn:hover,.pivot-btn.active{background:var(--accent);color:#fff;border-color:var(--accent)}
    .section-title{font-size:1.1em;font-weight:700;margin-bottom:16px;display:flex;align-items:center;gap:8px}
    .trend-alert{padding:12px 16px;border-radius:8px;margin-bottom:8px;font-size:0.85em;display:flex;align-items:center;gap:10px}
    .trend-alert.warning{background:rgba(251,191,36,0.08);border:1px solid rgba(251,191,36,0.2)}
    .trend-alert.info{background:rgba(99,102,241,0.08);border:1px solid rgba(99,102,241,0.2)}
    .modal-overlay{display:none;position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);z-index:1000;align-items:center;justify-content:center;padding:24px}
    .modal-overlay.open{display:flex}
    .modal{background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:32px;max-width:800px;width:100%;max-height:80vh;overflow-y:auto}
    .modal h2{margin-bottom:16px;font-size:1.3em}
    .modal p{margin-bottom:12px;line-height:1.7;color:var(--text)}
    .modal-close{position:absolute;top:16px;right:24px;background:none;border:none;color:var(--muted);font-size:1.5em;cursor:pointer}
    @media(max-width:768px){.grid-5{grid-template-columns:repeat(2,1fr)}.grid-2,.grid-3{grid-template-columns:1fr}.kpi-value{font-size:1.6em}}
    @media print{:root{--bg:#fff;--surface:#fff;--text:#1e293b;--muted:#64748b;--border:#e2e8f0}.nav,.pivot-controls,.summarize-btn{display:none}.page{display:block!important}.modal-overlay{display:none!important}}
    `;
  }

  generateHTML() {
    const metrics = this.calculateMetrics();
    this.insights = this.generateInsights(metrics);
    const topAccounts = Object.entries(this.aggregateByAccount(this.data.currentMonth?.results || [])).sort((a, b) => b[1] - a[1]).slice(0, 8);
    const esr = this.unitEconomics?.esr || {};
    const waste = this.unitEconomics?.waste || {};
    const commitment = this.unitEconomics?.commitmentImpact || {};
    const summary = this.unitEconomics?.summary || {};
    const byService = this.getComputeServices(this.unitEconomics?.byService);
    const byInstance = Object.entries(this.unitEconomics?.byInstanceType || {}).slice(0, 10);
    const rightsizing = (this.data.rightsizing || []).slice(0, 15);
    const anomalies = (this.data.anomalies || []).slice(0, 10);
    const historical = this.data.historicalMonths || [];

    const statusClass = metrics.budgetVariance <= 0 ? 'status-green' : metrics.budgetVariance < BUDGET_CONFIG.annual * 0.05 ? 'status-yellow' : 'status-red';
    const statusText = metrics.budgetVariance <= 0 ? '● ON TRACK' : metrics.budgetVariance < BUDGET_CONFIG.annual * 0.05 ? '● AT RISK' : '● OVER BUDGET';

    return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Executive Cloud Dashboard</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"><\/script>
<style>${this.generateCSS()}</style>
</head><body>
<div class="dashboard">
  <div class="header">
    <div><h1>☁️ Cloud Cost Executive Dashboard</h1><div class="meta">Generated ${new Date().toLocaleString()} · Data through ${this.data.metadata?.currentMonth?.end || 'today'}</div></div>
    <div class="header-actions">
      <button class="summarize-btn" onclick="openSummaryModal()">📋 Summarize Dashboard</button>
      <span class="${statusClass}">${statusText}</span>
    </div>
  </div>

  <div class="tldr">
    ${this.insights.tldr.map(s => `<p>${s}</p>`).join('')}
  </div>

  <div class="nav">
    <button class="active" onclick="showPage('overview')">Overview</button>
    <button onclick="showPage('kpis')">Unit Economics</button>
    <button onclick="showPage('insights')">Insights & Actions</button>
    <button onclick="showPage('optimization')">Optimization</button>
    <button onclick="showPage('ai')">AI Overview</button>
    <button onclick="showPage('anomalies')">Anomalies</button>
  </div>

${this.generateOverviewPage(metrics, topAccounts, historical, esr)}
${this.generateKPIsPage(summary, commitment, esr, waste, byService, byInstance)}
${this.generateInsightsPage()}
${this.generateOptimizationPage(rightsizing, waste)}
${this.generateAIPage()}
${this.generateAnomaliesPage(anomalies)}

  <div class="modal-overlay" id="summary-modal" onclick="if(event.target===this)closeSummaryModal()">
    <div class="modal" style="position:relative">
      <button class="modal-close" onclick="closeSummaryModal()">×</button>
      <h2>📋 Executive Summary</h2>
      <div id="summary-content"></div>
    </div>
  </div>

<script>${this.generateJS(metrics, topAccounts, historical, esr, byService, byInstance)}<\/script>
</div></body></html>`;
  }

  generateOverviewPage(metrics, topAccounts, historical, esr) {
    const esrVal = esr?.current?.rate ?? 0;
    const savings = esr?.current?.savings ?? 0;
    const byProduct = this.data.byProduct?.results || [];
    const byApplication = this.data.byApplication?.results || [];
    const byBusinessUnit = this.data.byBusinessUnit?.results || [];

    return `
  <div class="page active" id="overview">
    <div class="grid grid-5">
      <div class="card kpi-card">
        <div class="kpi-label">MTD Spend ${this.cldyLink('report', { dimensions: 'vendor_account_name,category3', metrics: 'total_amortized_cost' })}</div>
        <div class="kpi-value">${this.fmt(metrics.currentTotal)}</div>
        <div class="kpi-delta ${metrics.momChange > 0 ? 'down' : 'up'}">${metrics.momChange > 0 ? '▲' : '▼'} ${Math.abs(metrics.momChange).toFixed(1)}% vs last month</div>
        <div class="kpi-context">Day ${this.data.metadata?.currentMonth?.day || '?'} of month</div>
      </div>
      <div class="card kpi-card">
        <div class="kpi-label">Projected Month-End ${this.cldyLink('report', { dimensions: 'vendor_account_name', metrics: 'total_amortized_cost' })}</div>
        <div class="kpi-value">${this.fmt(metrics.projectedMonthly)}</div>
        <div class="kpi-delta ${metrics.projectedMonthly > BUDGET_CONFIG.monthly ? 'down' : 'up'}">${metrics.projectedMonthly > BUDGET_CONFIG.monthly ? '▲ Over' : '▼ Under'} budget</div>
        <div class="kpi-context">Budget: ${this.fmt(BUDGET_CONFIG.monthly)}/mo</div>
      </div>
      <div class="card kpi-card">
        <div class="kpi-label">Effective Savings Rate ${this.cldyLink('rightsizing/explorer?dimensions=vendor%2Cservice%2Caction%2Cregion&duration=ten-day&costBasis=on-demand')}</div>
        <div class="kpi-value">${esrVal.toFixed(1)}%</div>
        <div class="kpi-delta ${esrVal >= 23 ? 'up' : 'neutral'}">${esr?.percentile ? `${esr.percentile.toFixed(0)}th percentile` : '—'}</div>
        <div class="kpi-context">Saving ${this.fmt(savings)}/mo via RI/SP</div>
      </div>
      <div class="card kpi-card">
        <div class="kpi-label">YTD Spend ${this.cldyLink('report', { dimensions: 'vendor_account_name', metrics: 'total_amortized_cost' })}</div>
        <div class="kpi-value">${this.fmt(metrics.ytdTotal)}</div>
        <div class="kpi-delta neutral">${metrics.ytdBudgetPercent.toFixed(0)}% of annual budget</div>
        <div class="kpi-context">Annual: ${this.fmt(BUDGET_CONFIG.annual)}</div>
      </div>
      <div class="card kpi-card">
        <div class="kpi-label">Optimization Potential ${this.cldyLink('rightsizing/explorer?dimensions=vendor%2Cservice%2Caction%2Cregion&duration=ten-day&costBasis=on-demand')}</div>
        <div class="kpi-value">${this.fmt((this.data.rightsizing || []).reduce((s, r) => s + (r.monthlySavings || r.potentialSavings || 0), 0))}</div>
        <div class="kpi-delta up">${(this.data.rightsizing || []).length} recommendations</div>
        <div class="kpi-context">Monthly savings available</div>
      </div>
    </div>

    <div class="grid grid-2">
      <div class="chart-wrap">
        <h3>12-Month Cost Trend ${this.cldyLink('report', { dimensions: 'vendor_account_name', metrics: 'total_amortized_cost' })}</h3>
        <div class="chart-container"><canvas id="trendChart"></canvas></div>
      </div>
      <div class="chart-wrap">
        <h3>Spend by Account ${this.cldyLink('report', { dimensions: 'vendor_account_name', metrics: 'total_amortized_cost' })}</h3>
        <div class="pivot-controls">
          <button class="pivot-btn active" onclick="pivotAccounts('cost')">By Cost</button>
          <button class="pivot-btn" onclick="pivotAccounts('growth')">By Growth</button>
        </div>
        <div class="chart-container"><canvas id="accountsChart"></canvas></div>
      </div>
    </div>

    <div class="card">
      <div class="section-title">📊 Account Breakdown ${this.cldyLink('reports')}
        <div class="pivot-controls" style="margin:0;margin-left:auto" id="dimension-pivot">
          <button class="pivot-btn active" onclick="pivotDimension('account')">Account</button>
          <button class="pivot-btn" onclick="pivotDimension('product')">Product</button>
          <button class="pivot-btn" onclick="pivotDimension('application')">Application</button>
          <button class="pivot-btn" onclick="pivotDimension('businessUnit')">Business Unit</button>
          <button class="pivot-btn" onclick="pivotDimension('team')">Team</button>
        </div>
      </div>
      <div id="dimension-table-container">
      <table id="dimension-table">
        <tr><th>Account</th><th>MTD Spend</th><th>% of Total</th><th>ESR</th><th>Trend</th></tr>
        ${topAccounts.map(([name, cost]) => {
          const acctData = this.unitEconomics?.byAccount?.[name];
          const acctEsr = acctData?.current?.savings?.percent ?? 0;
          return `<tr><td><strong>${name}</strong></td><td>${this.fmt(cost)}</td><td>${(cost / metrics.currentTotal * 100).toFixed(1)}%</td><td><span class="badge ${acctEsr > 20 ? 'badge-green' : acctEsr > 0 ? 'badge-yellow' : 'badge-red'}">${acctEsr.toFixed(0)}%</span></td><td>${acctData?.trend?.amortizedCostChange != null ? this.pct(acctData.trend.amortizedCostChange) : '—'}</td></tr>`;
        }).join('')}
      </table>
      </div>
      <span class="drill-toggle" onclick="toggleDrill('acct-drill')">[expand details]</span>
      <div class="drill-panel" id="acct-drill">
        <div class="pivot-controls">
          <button class="pivot-btn active" onclick="drillBy('account')">By Account</button>
          <button class="pivot-btn" onclick="drillBy('service')">By Service</button>
          <button class="pivot-btn" onclick="drillBy('instance')">By Instance Type</button>
        </div>
        <div id="drill-content">Select a dimension to drill down.</div>
      </div>
    </div>
  </div>`;
  }

  generateKPIsPage(summary, commitment, esr, waste, byService, byInstance) {
    const cur = summary?.current || {};
    const esrVal = esr?.current?.rate ?? 0;
    const esrPct = esr?.percentile ?? 0;
    const wasteTotal = waste?.total ?? 0;
    const costPerVcpu = cur?.amortized?.costPerVCPUHour ?? 0;
    const costPerVcpuOD = cur?.onDemand?.costPerVCPUHour ?? 0;
    const costPerUsage = cur?.amortized?.costPerUsageHour ?? 0;
    const costPerGB = cur?.amortized?.costPerGBMonth ?? 0;
    const costPerRes = cur?.amortized?.costPerResource ?? 0;
    const trends = this.unitEconomics?.trends || {};

    return `
  <div class="page" id="kpis">
    <div class="card" style="margin-bottom:20px;background:linear-gradient(135deg,rgba(99,102,241,0.1),rgba(74,222,128,0.05));border-color:rgba(99,102,241,0.3)">
      <div class="grid" style="grid-template-columns:1fr 1fr 1fr;gap:24px;align-items:center">
        <div>
          <div class="kpi-label">Effective Savings Rate ${this.cldyLink('rightsizing/explorer?dimensions=vendor%2Cservice%2Caction%2Cregion&duration=ten-day&costBasis=on-demand')}</div>
          <div class="kpi-value" style="color:var(--accent)">${esrVal.toFixed(1)}%</div>
          <div class="benchmark-bar"><div class="benchmark-fill" style="width:${Math.min(esrVal / 46 * 100, 100)}%;background:var(--accent)"></div></div>
          <div class="kpi-context">${esrPct.toFixed(0)}th percentile · Target: 23%+ (75th)</div>
        </div>
        <div>
          <div class="kpi-label">Monthly RI/SP Savings ${this.cldyLink('rightsizing/explorer?dimensions=vendor%2Cservice%2Caction%2Cregion&duration=ten-day&costBasis=on-demand')}</div>
          <div class="kpi-value" style="color:var(--positive)">${this.fmt(esr?.current?.savings || 0)}</div>
          <div class="kpi-context">On-Demand: ${this.fmt(esr?.current?.onDemandTotal || 0)} → Amortized: ${this.fmt(esr?.current?.amortizedTotal || 0)}</div>
        </div>
        <div>
          <div class="kpi-label">Estimated Waste ${this.cldyLink('rightsizing/explorer?dimensions=vendor%2Cservice%2Caction%2Cregion&duration=ten-day&costBasis=on-demand')}</div>
          <div class="kpi-value" style="color:var(--negative)">${this.fmt(wasteTotal)}</div>
          <div class="kpi-context">${waste?.industryComparison ? `Your ${waste.industryComparison.yourPercent?.toFixed(0) || '?'}% vs industry avg ${waste.industryComparison.industryAvg}%` : '—'}</div>
        </div>
      </div>
    </div>

    <div class="grid grid-5" style="grid-template-columns:repeat(4,1fr)">
      <div class="card kpi-card">
        <div class="kpi-label">Cost per vCPU Hour ${this.cldyLink('report', { dimensions: 'vendor_account_name', metrics: 'total_amortized_cost' })}</div>
        <div class="kpi-value">$${costPerVcpu.toFixed(4)}</div>
        <div class="kpi-delta ${(trends?.amortized?.costPerVCPUHourChange ?? 0) < 0 ? 'up' : 'down'}">${this.pct(trends?.amortized?.costPerVCPUHourChange ?? 0)} MoM</div>
        <div class="kpi-context">On-Demand: $${costPerVcpuOD.toFixed(4)} · Save: ${costPerVcpuOD > 0 ? ((1 - costPerVcpu / costPerVcpuOD) * 100).toFixed(0) : 0}%</div>
      </div>
      <div class="card kpi-card">
        <div class="kpi-label">Cost per Usage Hour ${this.cldyLink('report', { dimensions: 'vendor_account_name', metrics: 'total_amortized_cost' })}</div>
        <div class="kpi-value">$${costPerUsage.toFixed(4)}</div>
        <div class="kpi-delta ${(trends?.amortized?.costPerUsageHourChange ?? 0) < 0 ? 'up' : 'down'}">${this.pct(trends?.amortized?.costPerUsageHourChange ?? 0)} MoM</div>
        <div class="kpi-context">${(cur?.resources?.usageHours ?? 0) > 0 ? `${(cur.resources.usageHours / 1000).toFixed(0)}K hours this month` : '—'}</div>
      </div>
      <div class="card kpi-card">
        <div class="kpi-label">Cost per GB Month ${this.cldyLink('report', { dimensions: 'vendor_account_name', metrics: 'total_amortized_cost' })}</div>
        <div class="kpi-value">$${costPerGB.toFixed(4)}</div>
        <div class="kpi-delta ${(trends?.amortized?.costPerGBMonthChange ?? 0) < 0 ? 'up' : 'down'}">${this.pct(trends?.amortized?.costPerGBMonthChange ?? 0)} MoM</div>
        <div class="kpi-context">${(cur?.resources?.gbMonths ?? 0) > 0 ? `${(cur.resources.gbMonths / 1000).toFixed(0)}K GB stored` : '—'}</div>
      </div>
      <div class="card kpi-card">
        <div class="kpi-label">Cost per Resource ${this.cldyLink('report', { dimensions: 'vendor_account_name', metrics: 'total_amortized_cost' })}</div>
        <div class="kpi-value">${this.fmt(costPerRes)}</div>
        <div class="kpi-delta neutral">${(cur?.resources?.resourceCount ?? 0).toFixed(0)} resources</div>
        <div class="kpi-context">${(cur?.resources?.vcpuHours ?? 0) > 0 ? `${(cur.resources.vcpuHours / 1000).toFixed(0)}K vCPU-hrs` : '—'}</div>
      </div>
    </div>

    <div class="grid grid-2">
      <div class="chart-wrap">
        <h3>ESR Trend (12 Months) ${this.cldyLink('rightsizing/explorer?dimensions=vendor%2Cservice%2Caction%2Cregion&duration=ten-day&costBasis=on-demand')}</h3>
        <div class="chart-container"><canvas id="esrChart"></canvas></div>
      </div>
      <div class="chart-wrap">
        <h3>Cost per vCPU Trend ${this.cldyLink('report', { dimensions: 'vendor_account_name', metrics: 'total_amortized_cost' })}</h3>
        <div class="chart-container"><canvas id="vcpuChart"></canvas></div>
      </div>
    </div>

    <div class="card">
      <div class="section-title">📋 Service-Level Unit Economics (Compute Only) ${this.cldyLink('report', { dimensions: 'vendor_account_name', metrics: 'total_amortized_cost' })}
        <div class="pivot-controls" style="margin:0;margin-left:auto">
          <button class="pivot-btn active" onclick="pivotServiceTable('vcpu')">Cost/vCPU</button>
          <button class="pivot-btn" onclick="pivotServiceTable('usage')">Cost/Usage Hr</button>
          <button class="pivot-btn" onclick="pivotServiceTable('gb')">Cost/GB</button>
        </div>
      </div>
      <table id="service-table">
        <thead><tr><th>Service</th><th>Amortized Cost</th><th class="metric-col">Cost/vCPU Hr</th><th>ESR</th><th>Savings</th></tr></thead>
        <tbody>
        ${byService.map(([svc, d]) => `<tr data-vcpu="${(d?.current?.amortized?.costPerVCPUHour ?? 0).toFixed(6)}" data-usage="${(d?.current?.amortized?.costPerUsageHour ?? 0).toFixed(6)}" data-gb="${(d?.current?.amortized?.costPerGBMonth ?? 0).toFixed(6)}">
          <td><strong>${svc}</strong></td>
          <td>${this.fmt(d?.current?.amortized?.totalCost ?? 0)}</td>
          <td class="metric-col">$${(d?.current?.amortized?.costPerVCPUHour ?? 0).toFixed(4)}</td>
          <td><span class="badge ${(d?.current?.savings?.percent ?? 0) > 20 ? 'badge-green' : (d?.current?.savings?.percent ?? 0) > 0 ? 'badge-yellow' : 'badge-red'}">${(d?.current?.savings?.percent ?? 0).toFixed(0)}%</span></td>
          <td>${this.fmt(d?.current?.savings?.amount ?? 0)}</td>
        </tr>`).join('')}
        </tbody>
      </table>
    </div>

    <div class="card" style="margin-top:16px">
      <div class="section-title">🖥️ Instance Type Analysis ${this.cldyLink('rightsizing/explorer?dimensions=vendor%2Cservice%2Caction%2Cregion&duration=ten-day&costBasis=on-demand')} <span class="drill-toggle" onclick="toggleDrill('instance-drill')">[show all]</span></div>
      <table>
        <tr><th>Instance Type</th><th>Cost/Hr (Amortized)</th><th>Cost/Hr (On-Demand)</th><th>Usage Hours</th><th>RI/SP Savings</th></tr>
        ${byInstance.slice(0, 8).map(([type, d]) => {
          const sav = d?.current?.savings?.percent ?? 0;
          return `<tr>
            <td><strong>${type}</strong></td>
            <td>$${(d?.current?.amortized?.costPerUsageHour ?? 0).toFixed(4)}</td>
            <td>$${(d?.current?.onDemand?.costPerUsageHour ?? 0).toFixed(4)}</td>
            <td>${((d?.current?.resources?.usageHours ?? 0) / 1000).toFixed(1)}K</td>
            <td><span class="badge ${sav > 20 ? 'badge-green' : sav > 0 ? 'badge-yellow' : 'badge-red'}">${sav.toFixed(0)}% ${sav === 0 ? '⚠️' : ''}</span></td>
          </tr>`;
        }).join('')}
      </table>
      <div class="drill-panel" id="instance-drill">
        ${byInstance.slice(8).map(([type, d]) => `<div style="padding:4px 0;font-size:0.85em"><strong>${type}</strong> — $${(d?.current?.amortized?.costPerUsageHour ?? 0).toFixed(4)}/hr · ${(d?.current?.savings?.percent ?? 0).toFixed(0)}% savings</div>`).join('')}
      </div>
    </div>
  </div>`;
  }

  generateInsightsPage() {
    const { actions, benchmarks, trends, alerts } = this.insights;

    const getMaturity = (category) => MATURITY_MAP[category] || 'Crawl';
    const maturityOrder = { 'Crawl': 0, 'Walk': 1, 'Run': 2 };
    const sortedActions = [...actions].sort((a, b) => maturityOrder[getMaturity(a.category)] - maturityOrder[getMaturity(b.category)]);

    return `
  <div class="page" id="insights">
    <div class="section-title">⚡ Prioritized Actions ${this.cldyLink('rightsizing/explorer?dimensions=vendor%2Cservice%2Caction%2Cregion&duration=ten-day&costBasis=on-demand')}</div>
    <div class="pivot-controls" id="action-filters">
      <button class="pivot-btn active" onclick="filterActions('all')">All (${actions.length})</button>
      <button class="pivot-btn" onclick="filterActions('DO_NOW')">Do Now</button>
      <button class="pivot-btn" onclick="filterActions('PLAN')">Plan</button>
      <button class="pivot-btn" onclick="filterActions('AUTOMATE')">Automate</button>
    </div>
    <div id="actions-list">
    ${sortedActions.map(a => {
      const maturity = getMaturity(a.category);
      const maturityClass = `maturity-${maturity.toLowerCase()}`;
      return `
      <div class="card insight-card ${a.priority}" data-priority="${a.priority}" data-maturity="${maturity}">
        <div class="insight-header">
          <div style="display:flex;gap:8px;align-items:center">
            <span class="insight-priority ${a.priority}">${a.priority.replace('_', ' ')}</span>
            <span class="maturity-badge ${maturityClass}">${maturity}</span>
          </div>
          <span class="insight-impact">${this.fmt(a.impact)}/mo</span>
        </div>
        <div style="font-weight:600;margin-bottom:4px">${a.title}</div>
        <div style="color:var(--muted);font-size:0.85em">${a.detail}</div>
        <div style="margin-top:8px;font-size:0.75em;color:var(--muted)">Effort: ${a.effort} · Category: ${a.category}</div>
      </div>`;
    }).join('')}
    </div>

    <div class="grid grid-3" style="margin-top:20px">
      <div class="card">
        <div class="section-title">📊 Benchmarks</div>
        <div style="margin-bottom:16px">
          <div class="kpi-label">ESR vs Industry</div>
          <div style="font-size:1.4em;font-weight:700">${(benchmarks?.esr?.value ?? 0).toFixed(1)}%</div>
          <div class="benchmark-bar"><div class="benchmark-fill" style="width:${Math.min((benchmarks?.esr?.value ?? 0) / 46 * 100, 100)}%;background:${(benchmarks?.esr?.rating === 'good' || benchmarks?.esr?.rating === 'excellent') ? 'var(--positive)' : 'var(--warning)'}"></div></div>
          <div style="font-size:0.75em;color:var(--muted);margin-top:4px">Rating: ${benchmarks?.esr?.rating ?? '—'} · ${(benchmarks?.esr?.percentile ?? 0).toFixed(0)}th percentile</div>
        </div>
        <div style="margin-bottom:16px">
          <div class="kpi-label">Cost/vCPU vs Benchmark</div>
          <div style="font-size:1.4em;font-weight:700">$${(benchmarks?.costPerVcpu?.value ?? 0).toFixed(4)}</div>
          <div class="benchmark-bar"><div class="benchmark-fill" style="width:${Math.min(100 - ((benchmarks?.costPerVcpu?.value ?? 0.05) / 0.12 * 100), 100)}%;background:${benchmarks?.costPerVcpu?.rating === 'good' ? 'var(--positive)' : 'var(--warning)'}"></div></div>
          <div style="font-size:0.75em;color:var(--muted)">Rating: ${benchmarks?.costPerVcpu?.rating ?? '—'} (good: &lt;$0.04, avg: &lt;$0.08)</div>
        </div>
        <div>
          <div class="kpi-label">Waste vs Industry</div>
          <div style="font-size:1.4em;font-weight:700">${(benchmarks?.waste?.value ?? 0).toFixed(0)}%</div>
          <div class="benchmark-bar"><div class="benchmark-fill" style="width:${Math.min(100 - (benchmarks?.waste?.value ?? 30), 100)}%;background:${benchmarks?.waste?.rating === 'good' || benchmarks?.waste?.rating === 'excellent' ? 'var(--positive)' : 'var(--negative)'}"></div></div>
          <div style="font-size:0.75em;color:var(--muted)">Industry avg: ${benchmarks?.waste?.industryAverage ?? 29}% · ${benchmarks?.waste?.rating ?? '—'}</div>
        </div>
      </div>

      <div class="card">
        <div class="section-title">📈 Trend Alerts</div>
        ${trends.length > 0 ? trends.map(t => `
          <div class="trend-alert ${t.severity}">
            <span>${t.severity === 'warning' ? '⚠️' : 'ℹ️'}</span>
            <span>${t.message}</span>
          </div>
        `).join('') : '<div style="color:var(--muted)">No trend alerts — all metrics stable.</div>'}
      </div>

      <div class="card">
        <div class="section-title">🔗 Cross-Metric Correlations</div>
        ${alerts.length > 0 ? alerts.map(a => `
          <div class="trend-alert info">
            <span>🔗</span>
            <span>${a.message}</span>
          </div>
        `).join('') : '<div style="color:var(--muted)">No cross-metric correlations detected.</div>'}
      </div>
    </div>
  </div>`;
  }

  generateOptimizationPage(rightsizing, waste) {
    const totalSavings = rightsizing.reduce((s, r) => s + (r.monthlySavings || r.potentialSavings || 0), 0);
    const categories = waste?.categories || [];
    const rsLink = this.cldyLink('rightsizing/explorer?dimensions=vendor%2Cservice%2Caction%2Cregion&duration=ten-day&costBasis=on-demand');

    // Group rightsizing by action urgency
    const doNow = rightsizing.filter(r => (r.savingsPercentage || 0) > 40 || (r.monthlySavings || 0) > 1000);
    const plan = rightsizing.filter(r => (r.savingsPercentage || 0) > 20 && (r.savingsPercentage || 0) <= 40 && (r.monthlySavings || 0) <= 1000);
    const automate = rightsizing.filter(r => (r.savingsPercentage || 0) <= 20);

    // Group by account for commitment insights
    const byAcct = {};
    rightsizing.forEach(r => {
      const a = r.vendorAccountName || 'Unknown';
      byAcct[a] = byAcct[a] || { count: 0, savings: 0 };
      byAcct[a].count++;
      byAcct[a].savings += (r.monthlySavings || r.potentialSavings || 0);
    });
    const acctSorted = Object.entries(byAcct).sort((a, b) => b[1].savings - a[1].savings);

    // ESR/commitment data
    const esr = this.unitEconomics?.esr || {};
    const esrVal = esr?.current?.rate ?? 0;
    const esrTarget = 23;
    const additionalSavings = esr?.targetSavings ?? 0;

    return `
  <div class="page" id="optimization">
    <div class="grid grid-5" style="grid-template-columns:repeat(4,1fr)">
      <div class="card kpi-card">
        <div class="kpi-label">Total Savings Available ${rsLink}</div>
        <div class="kpi-value" style="color:var(--positive)">${this.fmt(totalSavings)}<span style="font-size:0.4em;color:var(--muted)">/mo</span></div>
        <div class="kpi-context">${rightsizing.length} rightsizing recommendations</div>
      </div>
      <div class="card kpi-card">
        <div class="kpi-label">Commitment Opportunity</div>
        <div class="kpi-value" style="color:var(--accent)">${this.fmt(additionalSavings)}<span style="font-size:0.4em;color:var(--muted)">/mo</span></div>
        <div class="kpi-context">If ESR reaches ${esrTarget}% (currently ${esrVal.toFixed(1)}%)</div>
      </div>
      <div class="card kpi-card">
        <div class="kpi-label">Quick Wins</div>
        <div class="kpi-value">${doNow.length}</div>
        <div class="kpi-context">High savings, immediate action</div>
      </div>
      <div class="card kpi-card">
        <div class="kpi-label">Estimated Waste</div>
        <div class="kpi-value" style="color:var(--negative)">${this.fmt(waste?.total ?? 0)}<span style="font-size:0.4em;color:var(--muted)">/mo</span></div>
        <div class="kpi-context">${waste?.industryComparison?.yourPercent?.toFixed(0) || '?'}% of spend (industry: 29%)</div>
      </div>
    </div>

    <div class="card" style="margin-bottom:16px;border-left:4px solid var(--negative)">
      <div class="section-title">🔴 Do Now — High Impact, Act Immediately (${doNow.length} items, ${this.fmt(doNow.reduce((s,r) => s + (r.monthlySavings || 0), 0))}/mo)</div>
      <p style="color:var(--muted);margin-bottom:12px;font-size:0.85em">Resources with >40% savings potential or >$1K/mo. These are over-provisioned and should be rightsized this sprint.</p>
      ${doNow.length > 0 ? `<table><thead><tr><th>Resource</th><th>Account</th><th>Current → Recommended</th><th>Savings</th></tr></thead><tbody>
        ${doNow.slice(0, 10).map(r => `<tr>
          <td style="font-family:monospace;font-size:0.8em">${(r.resourceIdentifier || '').slice(0, 28)}</td>
          <td>${r.vendorAccountName || '—'}</td>
          <td>${r.currentInstanceType || '?'} → <span style="color:var(--positive)">${r.recommendedInstanceType || '?'}</span></td>
          <td style="font-weight:700;color:var(--positive)">${this.fmt(r.monthlySavings || r.potentialSavings || 0)} (${r.savingsPercentage || 0}%)</td>
        </tr>`).join('')}
      </tbody></table>` : '<div style="color:var(--muted)">No high-urgency rightsizing recommendations.</div>'}
    </div>

    <div class="card" style="margin-bottom:16px;border-left:4px solid var(--warning)">
      <div class="section-title">🟡 Plan — Requires Coordination (${plan.length} items, ${this.fmt(plan.reduce((s,r) => s + (r.monthlySavings || 0), 0))}/mo)</div>
      <p style="color:var(--muted);margin-bottom:12px;font-size:0.85em">Moderate savings (20-40%). Validate with app owners, schedule during maintenance windows.</p>
      ${plan.length > 0 ? `<table><thead><tr><th>Resource</th><th>Account</th><th>Current → Recommended</th><th>Savings</th></tr></thead><tbody>
        ${plan.slice(0, 8).map(r => `<tr>
          <td style="font-family:monospace;font-size:0.8em">${(r.resourceIdentifier || '').slice(0, 28)}</td>
          <td>${r.vendorAccountName || '—'}</td>
          <td>${r.currentInstanceType || '?'} → <span style="color:var(--positive)">${r.recommendedInstanceType || '?'}</span></td>
          <td style="font-weight:700">${this.fmt(r.monthlySavings || r.potentialSavings || 0)} (${r.savingsPercentage || 0}%)</td>
        </tr>`).join('')}
      </tbody></table>` : '<div style="color:var(--muted)">No medium-priority recommendations.</div>'}
    </div>

    <div class="card" style="margin-bottom:16px;border-left:4px solid var(--positive)">
      <div class="section-title">🟢 Automate — Low-Touch Optimization (${automate.length} items)</div>
      <p style="color:var(--muted);margin-bottom:12px;font-size:0.85em">Small savings (<20%). Set up automated policies or scheduling rules.</p>
      <div style="color:var(--muted);font-size:0.85em">${automate.length} resources with minor optimization opportunities totaling ${this.fmt(automate.reduce((s,r) => s + (r.monthlySavings || 0), 0))}/mo.</div>
    </div>

    <div class="grid grid-2">
      <div class="card">
        <div class="section-title">💰 Commitment Portfolio Strategy</div>
        <div style="margin-bottom:16px">
          <div style="display:flex;justify-content:space-between;margin-bottom:4px"><span>Current ESR</span><strong>${esrVal.toFixed(1)}%</strong></div>
          <div class="benchmark-bar"><div class="benchmark-fill" style="width:${Math.min(esrVal / 46 * 100, 100)}%;background:var(--accent)"></div></div>
          <div style="font-size:0.75em;color:var(--muted);margin-top:4px">Target: ${esrTarget}% (75th percentile) | World-class: 40%+</div>
        </div>
        <div style="border-top:1px solid var(--border);padding-top:12px;font-size:0.85em;color:var(--muted)">
          <p style="margin-bottom:8px"><strong style="color:var(--text)">Recommendation:</strong> ${esrVal < 15 ? 'Your coverage is low. Purchase Savings Plans for your top 3-5 steady-state instance families to reach 23% ESR.' : esrVal < 23 ? 'Good start. Extend coverage to remaining production workloads to hit 75th percentile.' : esrVal < 40 ? 'Strong coverage. Consider convertible RIs for remaining on-demand spend.' : 'Excellent coverage. Monitor utilization to avoid over-commitment.'}</p>
          <p><strong style="color:var(--text)">Potential gain:</strong> ${this.fmt(additionalSavings)}/mo additional savings at ${esrTarget}% ESR</p>
        </div>
      </div>

      <div class="card">
        <div class="section-title">📊 Savings by Account ${rsLink}</div>
        <table><thead><tr><th>Account</th><th>Recommendations</th><th>Monthly Savings</th></tr></thead><tbody>
        ${acctSorted.slice(0, 8).map(([acct, d]) => `<tr>
          <td><strong>${acct}</strong></td>
          <td>${d.count}</td>
          <td style="font-weight:700;color:var(--positive)">${this.fmt(d.savings)}</td>
        </tr>`).join('')}
        </tbody></table>
      </div>
    </div>

    <div class="chart-wrap">
      <h3>Waste by Category</h3>
      <div class="chart-container"><canvas id="wasteChart"></canvas></div>
    </div>
  </div>`;
  }

  generateAIPage() {
    const aiRaw = this.data.aiSpend?.results || [];
    // Filter to AI services only
    const aiRows = aiRaw.filter(r =>
      (r.enhanced_service_name || '').match(/bedrock|openai|foundry|cognitive|sagemaker|vertex/i) ||
      (r.usage_type || '').match(/token/i)
    );

    // Parse model names and input/output from usage_type
    const models = {};
    const providers = {};
    let totalCost = 0, totalInput = 0, totalOutput = 0;

    aiRows.forEach(r => {
      const cost = parseFloat(r.total_amortized_cost || 0);
      const qty = parseFloat(r.usage_quantity || 0);
      const ut = (r.usage_type || '').toLowerCase();
      const svc = r.enhanced_service_name || 'Unknown';
      const vendor = r.vendor || 'Unknown';
      const isInput = ut.includes('input');
      const isOutput = ut.includes('output');
      if (!isInput && !isOutput) return; // skip non-token rows

      // Extract model name: strip region prefix (e.g. "USE1-", "APS2-", "EU-") and "-input/output-tokens" suffix
      let modelName = (r.usage_type || '').replace(/^[A-Z]{2,4}\d?-/, '').replace(/-(input|output)-tokens$/i, '').replace(/-(input|output)$/i, '');
      if (!modelName) modelName = 'Unknown';

      totalCost += cost;
      if (isInput) totalInput += qty;
      if (isOutput) totalOutput += qty;

      if (!models[modelName]) models[modelName] = { cost: 0, input: 0, output: 0, provider: svc };
      models[modelName].cost += cost;
      if (isInput) models[modelName].input += qty;
      if (isOutput) models[modelName].output += qty;

      if (!providers[svc]) providers[svc] = { cost: 0, input: 0, output: 0, vendor };
      providers[svc].cost += cost;
      if (isInput) providers[svc].input += qty;
      if (isOutput) providers[svc].output += qty;
    });

    const modelsSorted = Object.entries(models).sort((a, b) => b[1].cost - a[1].cost);
    const providersSorted = Object.entries(providers).sort((a, b) => b[1].cost - a[1].cost);
    const modelsJSON = JSON.stringify(modelsSorted.map(([n, d]) => ({ name: n, cost: d.cost, input: d.input, output: d.output })));
    const providersJSON = JSON.stringify(providersSorted.map(([n, d]) => ({ name: n, cost: d.cost, vendor: d.vendor })));

    return `
  <div class="page" id="ai">
    <div class="grid grid-5" style="grid-template-columns:repeat(5,1fr)">
      <div class="card kpi-card">
        <div class="kpi-label">AI Spend (MTD)</div>
        <div class="kpi-value">${this.fmt(totalCost)}</div>
        <div class="kpi-context">${aiRows.length} line items</div>
      </div>
      <div class="card kpi-card">
        <div class="kpi-label">Input Tokens</div>
        <div class="kpi-value">${totalInput > 1e6 ? (totalInput/1e6).toFixed(1) + 'M' : totalInput > 1e3 ? (totalInput/1e3).toFixed(0) + 'K' : totalInput.toFixed(0)}</div>
        <div class="kpi-context">Across all models</div>
      </div>
      <div class="card kpi-card">
        <div class="kpi-label">Output Tokens</div>
        <div class="kpi-value">${totalOutput > 1e6 ? (totalOutput/1e6).toFixed(1) + 'M' : totalOutput > 1e3 ? (totalOutput/1e3).toFixed(0) + 'K' : totalOutput.toFixed(0)}</div>
        <div class="kpi-context">Across all models</div>
      </div>
      <div class="card kpi-card">
        <div class="kpi-label">Avg Cost/1K Tokens</div>
        <div class="kpi-value">$${(totalInput + totalOutput) > 0 ? ((totalCost / ((totalInput + totalOutput) / 1000))).toFixed(4) : '0'}</div>
        <div class="kpi-context">Blended input+output</div>
      </div>
      <div class="card kpi-card">
        <div class="kpi-label">Models in Use</div>
        <div class="kpi-value">${modelsSorted.length}</div>
        <div class="kpi-context">${providersSorted.length} provider${providersSorted.length !== 1 ? 's' : ''}</div>
      </div>
    </div>

    <div class="grid grid-2">
      <div class="chart-wrap">
        <h3>Spend by Model</h3>
        <div class="chart-container"><canvas id="aiModelChart"></canvas></div>
      </div>
      <div class="chart-wrap">
        <h3>Input vs Output Tokens by Model</h3>
        <div class="chart-container"><canvas id="aiTokenChart"></canvas></div>
      </div>
    </div>

    <div class="card">
      <div class="section-title">🤖 Model Breakdown
        <div class="pivot-controls" style="margin:0;margin-left:auto">
          <button class="pivot-btn active" onclick="filterAI('all')">All</button>
          ${providersSorted.map(([p]) => `<button class="pivot-btn" onclick="filterAI('${p}')">${p.replace('AWS ', '').replace('Azure ', '')}</button>`).join('')}
        </div>
      </div>
      <table id="ai-table">
        <thead><tr><th>Model</th><th>Provider</th><th>Cost</th><th>Input Tokens</th><th>Output Tokens</th><th>Cost/1K Input</th><th>Cost/1K Output</th></tr></thead>
        <tbody>
        ${modelsSorted.map(([name, d]) => {
          const costPerInput = d.input > 0 ? (d.cost * (d.input / (d.input + d.output)) / (d.input / 1000)).toFixed(4) : '—';
          const costPerOutput = d.output > 0 ? (d.cost * (d.output / (d.input + d.output)) / (d.output / 1000)).toFixed(4) : '—';
          return `<tr data-provider="${d.provider}">
            <td><strong>${name}</strong></td>
            <td>${d.provider.replace('AWS ', '').replace('Azure ', '')}</td>
            <td style="font-weight:700">${this.fmt(d.cost)}</td>
            <td>${d.input > 1000 ? (d.input/1000).toFixed(0) + 'K' : d.input.toFixed(0)}</td>
            <td>${d.output > 1000 ? (d.output/1000).toFixed(0) + 'K' : d.output.toFixed(0)}</td>
            <td>$${costPerInput}</td>
            <td>$${costPerOutput}</td>
          </tr>`;
        }).join('')}
        </tbody>
      </table>
    </div>

    <div class="card" style="margin-top:16px">
      <div class="section-title">📊 Provider Summary</div>
      <table>
        <thead><tr><th>Service</th><th>Vendor</th><th>Total Cost</th><th>Input Tokens</th><th>Output Tokens</th><th>% of AI Spend</th></tr></thead>
        <tbody>
        ${providersSorted.map(([name, d]) => `<tr>
          <td><strong>${name}</strong></td>
          <td>${d.vendor}</td>
          <td style="font-weight:700">${this.fmt(d.cost)}</td>
          <td>${d.input > 1000 ? (d.input/1000).toFixed(0) + 'K' : d.input.toFixed(0)}</td>
          <td>${d.output > 1000 ? (d.output/1000).toFixed(0) + 'K' : d.output.toFixed(0)}</td>
          <td>${totalCost > 0 ? ((d.cost / totalCost) * 100).toFixed(1) : 0}%</td>
        </tr>`).join('')}
        </tbody>
      </table>
    </div>
  </div>`;
  }

  generateAnomaliesPage(anomalies) {
    const highSev = anomalies.filter(a => a.severity === 'high' || (a.percentageIncrease || 0) > 100);
    return `
  <div class="page" id="anomalies">
    <div class="grid grid-3" style="grid-template-columns:1fr 1fr 1fr">
      <div class="card kpi-card">
        <div class="kpi-label">Total Anomalies (90d) ${this.cldyLink('anomalies')}</div>
        <div class="kpi-value">${anomalies.length}</div>
        <div class="kpi-context">Last 90 days</div>
      </div>
      <div class="card kpi-card">
        <div class="kpi-label">High Severity ${this.cldyLink('anomalies')}</div>
        <div class="kpi-value" style="color:var(--negative)">${highSev.length}</div>
        <div class="kpi-context">Requires investigation</div>
      </div>
      <div class="card kpi-card">
        <div class="kpi-label">Largest Spike ${this.cldyLink('anomalies')}</div>
        <div class="kpi-value">${anomalies[0] ? `+${anomalies[0].percentageIncrease || 0}%` : '—'}</div>
        <div class="kpi-context">${anomalies[0]?.vendorAccountName || '—'}</div>
      </div>
    </div>

    <div class="card">
      <div class="section-title">🚨 Anomaly Timeline ${this.cldyLink('anomalies')}
        <div class="pivot-controls" style="margin:0;margin-left:auto">
          <button class="pivot-btn active" onclick="filterAnomalies('all')">All</button>
          <button class="pivot-btn" onclick="filterAnomalies('high')">High Only</button>
        </div>
      </div>
      <table id="anomaly-table">
        <thead><tr><th>Date</th><th>Account</th><th>Service</th><th>Increase</th><th>Cost</th><th>Severity</th></tr></thead>
        <tbody>
        ${anomalies.map(a => {
          const sev = (a.severity || (a.percentageIncrease > 100 ? 'high' : 'medium'));
          return `<tr data-severity="${sev}">
            <td>${a.date || '—'}</td>
            <td>${a.vendorAccountName || '—'}</td>
            <td>${a.service || '—'}</td>
            <td style="color:var(--negative)">+${(a.percentageIncrease || 0).toFixed(0)}%</td>
            <td style="font-weight:700">${this.fmt(a.cost || 0)}</td>
            <td><span class="badge ${sev === 'high' ? 'badge-red' : 'badge-yellow'}">${sev}</span></td>
          </tr>`;
        }).join('')}
        </tbody>
      </table>
    </div>
  </div>`;
  }

  generateJS(metrics, topAccounts, historical, esr, byService, byInstance) {
    const months = historical.map(h => h.month?.slice(0, 7) || '').reverse();
    const amortizedData = historical.map(h => {
      const results = h?.data?.results || [];
      return results.reduce((s, r) => s + parseFloat(r.total_amortized_cost || 0), 0);
    }).reverse();
    const onDemandData = historical.map(h => {
      const results = h?.data?.results || [];
      return results.reduce((s, r) => s + parseFloat(r.public_on_demand_cost || 0), 0);
    }).reverse();
    const esrData = amortizedData.map((a, i) => onDemandData[i] > 0 ? ((onDemandData[i] - a) / onDemandData[i]) * 100 : 0);
    const vcpuData = historical.map(h => {
      const results = h?.data?.results || [];
      const cost = results.reduce((s, r) => s + parseFloat(r.total_amortized_cost || 0), 0);
      const vcpu = results.reduce((s, r) => s + parseFloat(r.vcpu_hours || 0), 0);
      return vcpu > 0 ? cost / vcpu : 0;
    }).reverse();

    const wasteCategories = this.unitEconomics?.waste?.categories || [];

    // Compute growth data for accounts
    const previousAccounts = this.aggregateByAccount(this.data.previousMonth?.results || []);
    const accountGrowth = topAccounts.map(([name, cost]) => {
      const prev = previousAccounts[name] || 0;
      return { name, cost, growth: prev > 0 ? ((cost - prev) / prev) * 100 : 0 };
    });

    // Business dimension data for pivots
    const byProduct = (this.data.byProduct?.results || []).map(r => ({
      name: r.category4 || 'Untagged',
      cost: parseFloat(r.total_amortized_cost || r.unblended_cost || 0)
    }));
    const byApplication = (this.data.byApplication?.results || []).map(r => ({
      name: r.category3 || 'Untagged',
      cost: parseFloat(r.total_amortized_cost || r.unblended_cost || 0)
    }));
    const byBusinessUnit = (this.data.byBusinessUnit?.results || []).map(r => ({
      name: r.category5 || 'Untagged',
      cost: parseFloat(r.total_amortized_cost || r.unblended_cost || 0)
    }));
    const byTeam = (this.data.byTeam?.results || []).map(r => ({
      name: r.category2 || 'Untagged',
      cost: parseFloat(r.total_amortized_cost || r.unblended_cost || 0)
    }));

    // Service data for pivot table
    const serviceData = byService.map(([svc, d]) => ({
      name: svc,
      cost: d?.current?.amortized?.totalCost ?? 0,
      vcpu: (d?.current?.amortized?.costPerVCPUHour ?? 0).toFixed(4),
      usage: (d?.current?.amortized?.costPerUsageHour ?? 0).toFixed(4),
      gb: (d?.current?.amortized?.costPerGBMonth ?? 0).toFixed(4),
      esr: (d?.current?.savings?.percent ?? 0).toFixed(0),
      savings: d?.current?.savings?.amount ?? 0
    }));

    // Summary data for modal
    const summaryData = {
      currentTotal: metrics.currentTotal,
      projectedMonthly: metrics.projectedMonthly,
      previousTotal: metrics.previousTotal,
      momChange: metrics.momChange,
      ytdTotal: metrics.ytdTotal,
      budgetAnnual: BUDGET_CONFIG.annual,
      budgetMonthly: BUDGET_CONFIG.monthly,
      esrRate: esr?.current?.rate ?? 0,
      esrPercentile: esr?.percentile ?? 0,
      esrSavings: esr?.current?.savings ?? 0,
      topAccount: topAccounts[0] ? { name: topAccounts[0][0], cost: topAccounts[0][1] } : null,
      rightsizingCount: (this.data.rightsizing || []).length,
      rightsizingSavings: (this.data.rightsizing || []).reduce((s, r) => s + (r.monthlySavings || r.potentialSavings || 0), 0),
      anomalyCount: (this.data.anomalies || []).length,
      wasteTotal: this.unitEconomics?.waste?.total ?? 0
    };

    return `
    Chart.defaults.font.family = "'Inter', system-ui, sans-serif";
    Chart.defaults.color = '#94a3b8';
    Chart.defaults.plugins.legend.labels.boxWidth = 12;
    Chart.defaults.animation.duration = 400;

    const CLDY_BASE = '${CLDY_BASE}';
    const summaryData = ${JSON.stringify(summaryData)};
    const accountGrowthData = ${JSON.stringify(accountGrowth)};
    const dimensionData = {
      account: ${JSON.stringify(topAccounts.map(([n, c]) => ({ name: n, cost: c })))},
      product: ${JSON.stringify(byProduct)},
      application: ${JSON.stringify(byApplication)},
      businessUnit: ${JSON.stringify(byBusinessUnit)},
      team: ${JSON.stringify(byTeam)}
    };
    const serviceTableData = ${JSON.stringify(serviceData)};

    // Page navigation
    function showPage(id) {
      document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
      document.querySelectorAll('.nav button').forEach(b => b.classList.remove('active'));
      document.getElementById(id).classList.add('active');
      event.target.classList.add('active');
    }

    // Drill panel toggle
    function toggleDrill(id) {
      document.getElementById(id).classList.toggle('open');
    }

    // Filter action cards
    function filterActions(priority) {
      document.querySelectorAll('#action-filters .pivot-btn').forEach(b => b.classList.remove('active'));
      event.target.classList.add('active');
      document.querySelectorAll('#actions-list .insight-card').forEach(card => {
        card.style.display = (priority === 'all' || card.dataset.priority === priority) ? '' : 'none';
      });
    }

    // Filter anomalies
    function filterAnomalies(filter) {
      event.target.parentElement.querySelectorAll('.pivot-btn').forEach(b => b.classList.remove('active'));
      event.target.classList.add('active');
      document.querySelectorAll('#anomaly-table tbody tr').forEach(row => {
        row.style.display = (filter === 'all' || row.dataset.severity === filter) ? '' : 'none';
      });
    }

    // Sort rightsizing table
    function sortRightsizing(by) {
      event.target.parentElement.querySelectorAll('.pivot-btn').forEach(b => b.classList.remove('active'));
      event.target.classList.add('active');
      const tbody = document.querySelector('#rightsizing-table tbody');
      const rows = Array.from(tbody.querySelectorAll('tr'));
      rows.sort((a, b) => parseFloat(b.dataset[by === 'savings' ? 'savings' : 'pct']) - parseFloat(a.dataset[by === 'savings' ? 'savings' : 'pct']));
      rows.forEach(r => tbody.appendChild(r));
    }

    // Pivot accounts chart between cost and growth
    let accountsChartInstance = null;
    function pivotAccounts(mode) {
      event.target.parentElement.querySelectorAll('.pivot-btn').forEach(b => b.classList.remove('active'));
      event.target.classList.add('active');
      if (!accountsChartInstance) return;
      let sorted;
      if (mode === 'growth') {
        sorted = [...accountGrowthData].sort((a, b) => b.growth - a.growth);
        accountsChartInstance.data.labels = sorted.map(d => d.name);
        accountsChartInstance.data.datasets[0].data = sorted.map(d => d.growth);
        accountsChartInstance.options.scales.x.ticks.callback = v => v.toFixed(0) + '%';
        accountsChartInstance.data.datasets[0].backgroundColor = sorted.map(d => d.growth > 20 ? '#f87171' : d.growth > 0 ? '#fbbf24' : '#4ade80');
      } else {
        sorted = [...accountGrowthData].sort((a, b) => b.cost - a.cost);
        accountsChartInstance.data.labels = sorted.map(d => d.name);
        accountsChartInstance.data.datasets[0].data = sorted.map(d => d.cost);
        accountsChartInstance.options.scales.x.ticks.callback = v => '$' + (v/1000).toFixed(0) + 'K';
        accountsChartInstance.data.datasets[0].backgroundColor = '#6366f1';
      }
      accountsChartInstance.update();
    }

    // Pivot service table metric column
    function pivotServiceTable(metric) {
      event.target.parentElement.querySelectorAll('.pivot-btn').forEach(b => b.classList.remove('active'));
      event.target.classList.add('active');
      const headerLabels = { vcpu: 'Cost/vCPU Hr', usage: 'Cost/Usage Hr', gb: 'Cost/GB' };
      document.querySelectorAll('#service-table .metric-col').forEach(el => {
        if (el.tagName === 'TH') {
          el.textContent = headerLabels[metric];
        }
      });
      const rows = document.querySelectorAll('#service-table tbody tr');
      rows.forEach(row => {
        const cell = row.querySelector('.metric-col');
        if (cell) cell.textContent = '$' + parseFloat(row.dataset[metric]).toFixed(4);
      });
    }

    // Pivot dimension table (Account/Product/Application/Business Unit)
    function pivotDimension(dim) {
      document.querySelectorAll('#dimension-pivot .pivot-btn').forEach(b => b.classList.remove('active'));
      event.target.classList.add('active');
      const data = dimensionData[dim] || [];
      const sorted = [...data].sort((a, b) => b.cost - a.cost).slice(0, 10);
      const total = sorted.reduce((s, d) => s + d.cost, 0);
      const dimLabel = { account: 'Account', product: 'Product', application: 'Application', businessUnit: 'Business Unit' }[dim];
      let html = '<table><tr><th>' + dimLabel + '</th><th>MTD Spend</th><th>% of Total</th></tr>';
      sorted.forEach(d => {
        const pct = total > 0 ? (d.cost / total * 100).toFixed(1) : '0.0';
        html += '<tr><td><strong>' + d.name + '</strong></td><td>$' + (d.cost >= 1e6 ? (d.cost/1e6).toFixed(2) + 'M' : d.cost >= 1e3 ? (d.cost/1e3).toFixed(1) + 'K' : d.cost.toFixed(0)) + '</td><td>' + pct + '%</td></tr>';
      });
      html += '</table>';
      document.getElementById('dimension-table-container').innerHTML = html;

      // Also update the accounts chart
      if (accountsChartInstance) {
        const chartData = sorted.slice(0, 8);
        accountsChartInstance.data.labels = chartData.map(d => d.name);
        accountsChartInstance.data.datasets[0].data = chartData.map(d => d.cost);
        accountsChartInstance.data.datasets[0].backgroundColor = '#6366f1';
        accountsChartInstance.options.scales.x.ticks.callback = v => '$' + (v/1000).toFixed(0) + 'K';
        accountsChartInstance.update();
      }
    }

    // Drill-down by dimension
    function drillBy(dimension) {
      event.target.parentElement.querySelectorAll('.pivot-btn').forEach(b => b.classList.remove('active'));
      event.target.classList.add('active');
      const content = document.getElementById('drill-content');
      const data = dimension === 'service' ? ${JSON.stringify(byService.map(([s, d]) => ({ name: s, cost: d?.current?.amortized?.totalCost ?? 0, esr: d?.current?.savings?.percent ?? 0 })))}
        : dimension === 'instance' ? ${JSON.stringify(Object.entries(this.unitEconomics?.byInstanceType || {}).slice(0, 10).map(([t, d]) => ({ name: t, cost: d?.current?.amortized?.totalCost ?? 0, esr: d?.current?.savings?.percent ?? 0 })))}
        : ${JSON.stringify(topAccounts.map(([n, c]) => ({ name: n, cost: c, esr: this.unitEconomics?.byAccount?.[n]?.current?.savings?.percent ?? 0 })))};
      content.innerHTML = '<table><tr><th>Name</th><th>Cost</th><th>ESR</th></tr>' + data.map(d => '<tr><td>' + d.name + '</td><td>$' + (d.cost/1000).toFixed(1) + 'K</td><td>' + d.esr.toFixed(0) + '%</td></tr>').join('') + '</table>';
    }

    // Summary modal
    function openSummaryModal() {
      const d = summaryData;
      const fmtM = n => n >= 1e6 ? '$' + (n/1e6).toFixed(2) + 'M' : n >= 1e3 ? '$' + (n/1e3).toFixed(1) + 'K' : '$' + n.toFixed(0);
      let narrative = '<p><strong>Spending Overview:</strong> Month-to-date cloud spend stands at ' + fmtM(d.currentTotal) + ', projecting to ' + fmtM(d.projectedMonthly) + ' by month-end. ';
      narrative += 'This represents a ' + (d.momChange >= 0 ? '+' : '') + d.momChange.toFixed(1) + '% change versus last month\\'s ' + fmtM(d.previousTotal) + '. ';
      narrative += 'Year-to-date spend is ' + fmtM(d.ytdTotal) + ' against an annual budget of ' + fmtM(d.budgetAnnual) + '.</p>';

      if (d.topAccount) {
        narrative += '<p><strong>Top Spender:</strong> Your highest-spending account is <em>' + d.topAccount.name + '</em> at ' + fmtM(d.topAccount.cost) + ' MTD, representing ' + (d.currentTotal > 0 ? (d.topAccount.cost / d.currentTotal * 100).toFixed(0) : 0) + '% of total spend.</p>';
      }

      narrative += '<p><strong>Efficiency:</strong> Your Effective Savings Rate (ESR) is ' + d.esrRate.toFixed(1) + '%, placing you at the ' + d.esrPercentile.toFixed(0) + 'th percentile. ';
      narrative += 'RI/SP commitments are saving ' + fmtM(d.esrSavings) + ' per month. ';
      if (d.esrRate < 23) {
        narrative += 'This is below the 75th percentile target of 23% — increasing commitment coverage would yield significant savings.</p>';
      } else {
        narrative += 'This exceeds the 75th percentile benchmark of 23% — your commitment strategy is performing well.</p>';
      }

      narrative += '<p><strong>Optimization Opportunity:</strong> There are ' + d.rightsizingCount + ' active rightsizing recommendations totaling ' + fmtM(d.rightsizingSavings) + '/month in potential savings. ';
      narrative += 'Estimated waste across idle and underutilized resources is ' + fmtM(d.wasteTotal) + '/month.</p>';

      if (d.anomalyCount > 0) {
        narrative += '<p><strong>Risk:</strong> ' + d.anomalyCount + ' cost anomalies were detected in the past 90 days. Review the Anomalies tab for details on unusual spend spikes requiring investigation.</p>';
      }

      narrative += '<p><strong>Recommendation:</strong> ';
      if (d.esrRate < 23) {
        narrative += 'Priority 1 — Increase RI/SP coverage to reach 23%+ ESR. ';
      }
      if (d.rightsizingSavings > 1000) {
        narrative += 'Priority ' + (d.esrRate < 23 ? '2' : '1') + ' — Action top rightsizing recommendations for ' + fmtM(d.rightsizingSavings) + '/mo in quick wins. ';
      }
      narrative += 'Continue monitoring cost-per-vCPU trends to track efficiency gains over time.</p>';

      document.getElementById('summary-content').innerHTML = narrative;
      document.getElementById('summary-modal').classList.add('open');
    }

    function closeSummaryModal() {
      document.getElementById('summary-modal').classList.remove('open');
    }

    // --- CHARTS ---
    const months = ${JSON.stringify(months)};
    const gridColor = 'rgba(255,255,255,0.04)';

    // 12-month cost trend
    const trendCtx = document.getElementById('trendChart');
    if (trendCtx) {
      const gradient = trendCtx.getContext('2d').createLinearGradient(0, 0, 0, 280);
      gradient.addColorStop(0, 'rgba(99,102,241,0.3)');
      gradient.addColorStop(1, 'rgba(99,102,241,0)');
      new Chart(trendCtx, {
        type: 'line',
        data: {
          labels: months,
          datasets: [
            { label: 'Amortized', data: ${JSON.stringify(amortizedData)}, borderColor: '#6366f1', backgroundColor: gradient, fill: true, tension: 0.3, pointRadius: 0, pointHoverRadius: 5 },
            { label: 'On-Demand', data: ${JSON.stringify(onDemandData)}, borderColor: '#94a3b8', borderDash: [5,5], fill: false, tension: 0.3, pointRadius: 0 },
            { label: 'Budget', data: Array(${months.length}).fill(${BUDGET_CONFIG.monthly}), borderColor: 'rgba(248,113,113,0.5)', borderDash: [3,3], fill: false, pointRadius: 0 }
          ]
        },
        options: { responsive: true, maintainAspectRatio: false, interaction: { intersect: false, mode: 'index' },
          scales: { y: { grid: { color: gridColor }, ticks: { callback: v => '$' + (v/1000).toFixed(0) + 'K' } }, x: { grid: { display: false } } },
          plugins: { tooltip: { callbacks: { label: ctx => ctx.dataset.label + ': $' + (ctx.parsed.y/1000).toFixed(1) + 'K' } } }
        }
      });
    }

    // Accounts bar chart
    const acctCtx = document.getElementById('accountsChart');
    if (acctCtx) {
      accountsChartInstance = new Chart(acctCtx, {
        type: 'bar',
        data: { labels: ${JSON.stringify(topAccounts.map(([n]) => n))}, datasets: [{ data: ${JSON.stringify(topAccounts.map(([, c]) => c))}, backgroundColor: '#6366f1', borderRadius: 4 }] },
        options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } },
          scales: { x: { grid: { color: gridColor }, ticks: { callback: v => '$' + (v/1000).toFixed(0) + 'K' } }, y: { grid: { display: false } } }
        }
      });
    }

    // ESR trend
    const esrCtx = document.getElementById('esrChart');
    if (esrCtx) {
      const esrGrad = esrCtx.getContext('2d').createLinearGradient(0, 0, 0, 280);
      esrGrad.addColorStop(0, 'rgba(74,222,128,0.2)');
      esrGrad.addColorStop(1, 'rgba(74,222,128,0)');
      new Chart(esrCtx, {
        type: 'line',
        data: { labels: months, datasets: [
          { label: 'ESR %', data: ${JSON.stringify(esrData)}, borderColor: '#4ade80', backgroundColor: esrGrad, fill: true, tension: 0.3, pointRadius: 0, pointHoverRadius: 5 },
          { label: '75th Percentile', data: Array(${months.length}).fill(23), borderColor: 'rgba(251,191,36,0.4)', borderDash: [4,4], fill: false, pointRadius: 0 },
          { label: '90th Percentile', data: Array(${months.length}).fill(40), borderColor: 'rgba(74,222,128,0.3)', borderDash: [4,4], fill: false, pointRadius: 0 }
        ]},
        options: { responsive: true, maintainAspectRatio: false, interaction: { intersect: false, mode: 'index' },
          scales: { y: { min: 0, max: 50, grid: { color: gridColor }, ticks: { callback: v => v + '%' } }, x: { grid: { display: false } } }
        }
      });
    }

    // Cost per vCPU trend
    const vcpuCtx = document.getElementById('vcpuChart');
    if (vcpuCtx) {
      new Chart(vcpuCtx, {
        type: 'line',
        data: { labels: months, datasets: [
          { label: 'Cost/vCPU Hr', data: ${JSON.stringify(vcpuData)}, borderColor: '#6366f1', tension: 0.3, pointRadius: 0, pointHoverRadius: 5 },
          { label: 'Good (<$0.04)', data: Array(${months.length}).fill(0.04), borderColor: 'rgba(74,222,128,0.3)', borderDash: [4,4], fill: false, pointRadius: 0 },
          { label: 'Avg (<$0.08)', data: Array(${months.length}).fill(0.08), borderColor: 'rgba(251,191,36,0.3)', borderDash: [4,4], fill: false, pointRadius: 0 }
        ]},
        options: { responsive: true, maintainAspectRatio: false, interaction: { intersect: false, mode: 'index' },
          scales: { y: { grid: { color: gridColor }, ticks: { callback: v => '$' + v.toFixed(3) } }, x: { grid: { display: false } } }
        }
      });
    }

    // Waste doughnut
    const wasteCtx = document.getElementById('wasteChart');
    if (wasteCtx) {
      new Chart(wasteCtx, {
        type: 'doughnut',
        data: {
          labels: ${JSON.stringify(wasteCategories.map(c => c.name))},
          datasets: [{ data: ${JSON.stringify(wasteCategories.map(c => c.amount))}, backgroundColor: ['#f87171','#fb923c','#fbbf24','#a78bfa','#94a3b8'], borderWidth: 0 }]
        },
        options: { responsive: true, maintainAspectRatio: false, cutout: '70%',
          plugins: { legend: { position: 'bottom' } }
        }
      });
    }

    // AI Model chart
    const aiModelCtx = document.getElementById('aiModelChart');
    if (aiModelCtx) {
      const aiModels = ${JSON.stringify(Object.entries(this.parseAIData().models).sort((a, b) => b[1].cost - a[1].cost).slice(0, 8).map(([n, d]) => ({ name: n, cost: d.cost })))};
      new Chart(aiModelCtx, {
        type: 'bar',
        data: { labels: aiModels.map(m => m.name), datasets: [{ data: aiModels.map(m => m.cost), backgroundColor: '#8b5cf6', borderRadius: 4 }] },
        options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } },
          scales: { x: { grid: { color: gridColor }, ticks: { callback: v => '$' + v.toFixed(0) } }, y: { grid: { display: false } } }
        }
      });
    }

    // AI Token chart (input vs output)
    const aiTokenCtx = document.getElementById('aiTokenChart');
    if (aiTokenCtx) {
      const aiTokens = ${JSON.stringify(Object.entries(this.parseAIData().models).sort((a, b) => b[1].cost - a[1].cost).slice(0, 8).map(([n, d]) => ({ name: n, input: d.input, output: d.output })))};
      new Chart(aiTokenCtx, {
        type: 'bar',
        data: { labels: aiTokens.map(m => m.name), datasets: [
          { label: 'Input', data: aiTokens.map(m => m.input / 1000), backgroundColor: '#6366f1' },
          { label: 'Output', data: aiTokens.map(m => m.output / 1000), backgroundColor: '#4ade80' }
        ]},
        options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false,
          scales: { x: { stacked: true, grid: { color: gridColor }, ticks: { callback: v => v.toFixed(0) + 'K' } }, y: { stacked: true, grid: { display: false } } }
        }
      });
    }

    // AI provider filter
    function filterAI(provider) {
      event.target.parentElement.querySelectorAll('.pivot-btn').forEach(b => b.classList.remove('active'));
      event.target.classList.add('active');
      document.querySelectorAll('#ai-table tbody tr').forEach(row => {
        row.style.display = (provider === 'all' || row.dataset.provider === provider) ? '' : 'none';
      });
    }

    // Keyboard shortcut for summary
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeSummaryModal(); });
`;
  }

  async save() {
    const dir = path.dirname(OUTPUT_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const html = this.generateHTML();
    fs.writeFileSync(OUTPUT_PATH, html);
    console.log(`✅ Dashboard generated: ${OUTPUT_PATH}`);
    return OUTPUT_PATH;
  }

  async open() {
    const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
    exec(`${cmd} "${OUTPUT_PATH}"`, (err) => {
      if (!err) console.log('🌐 Dashboard opened in browser');
    });
  }
}

// CLI usage
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('🚀 Generating Executive Dashboard...\n');
  const collector = new CloudabilityDataCollector();
  const data = await collector.collectAll();
  const generator = new DashboardGenerator(data);
  await generator.save();
  await generator.open();
  console.log('\n✅ Done!');
}

export { DashboardGenerator };
