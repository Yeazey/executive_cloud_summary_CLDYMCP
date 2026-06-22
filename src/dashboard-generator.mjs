#!/usr/bin/env node
import { CloudabilityDataCollector } from './data-collector.mjs';
import { UnitEconomicsCalculator } from './unit-economics.mjs';
import { CHART_COLORS, OUTPUT_PATH, BUDGET_CONFIG, DATE_CONFIG } from './config.mjs';
import fs from 'fs';
import { exec } from 'child_process';

class DashboardGenerator {
  constructor(data) {
    this.data = data;
    // Calculate unit economics if resource data is available
    this.unitEconomics = null;
    if (data.currentMonthResources && data.previousMonthResources) {
      const calculator = new UnitEconomicsCalculator(
        data.currentMonthResources,
        data.previousMonthResources
      );
      this.unitEconomics = calculator.calculateAll();
    }
  }

  calculateMetrics() {
    const current = this.aggregateByAccount(this.data.currentMonth.results);
    const previous = this.aggregateByAccount(this.data.previousMonth.results);
    const ytd = this.aggregateByMonth(this.data.yearToDate.results);
    
    const currentTotal = Object.values(current).reduce((sum, val) => sum + val, 0);
    const previousTotal = Object.values(previous).reduce((sum, val) => sum + val, 0);
    const ytdTotal = Object.values(ytd).reduce((sum, val) => sum + val, 0);
    
    const currentMonth = DATE_CONFIG.getCurrentMonth();
    const daysInMonth = new Date(currentMonth.year, currentMonth.month, 0).getDate();
    const projectedMonthly = (currentTotal / currentMonth.day) * daysInMonth;
    
    const momChange = ((projectedMonthly - previousTotal) / previousTotal) * 100;
    const avgMonthly = ytdTotal / currentMonth.month;
    const projectedYearEnd = ytdTotal + (avgMonthly * (12 - currentMonth.month)) + (projectedMonthly - (currentTotal));
    
    return {
      currentTotal,
      previousTotal,
      projectedMonthly,
      ytdTotal,
      momChange,
      avgMonthly,
      projectedYearEnd,
      budgetVariance: projectedYearEnd - BUDGET_CONFIG.annual,
      ytdBudgetPercent: (ytdTotal / BUDGET_CONFIG.annual) * 100
    };
  }

  aggregateByAccount(results) {
    const agg = {};
    results.forEach(r => {
      const account = r.vendor_account_name || 'Unknown';
      agg[account] = (agg[account] || 0) + parseFloat(r.unblended_cost || 0);
    });
    return agg;
  }

  aggregateByMonth(results) {
    const agg = {};
    results.forEach(r => {
      const month = r.month || 'Unknown';
      agg[month] = (agg[month] || 0) + parseFloat(r.unblended_cost || 0);
    });
    return agg;
  }

  generateUnitEconomicsPage() {
    if (!this.unitEconomics) {
      return `
        <div class="alert warning">
          <span style="font-size:1.5em">⚠️</span>
          <div><strong>Unit Economics Not Available:</strong> Resource-level data is required. Please ensure data collection includes resource metrics.</div>
        </div>
      `;
    }

    const ue = this.unitEconomics;
    const summary = ue.summary;
    const commitment = ue.commitmentImpact;
    const trends = ue.trends;
    const byAccount = Object.entries(ue.byAccount).slice(0, 5);
    const byService = Object.entries(ue.byService).slice(0, 5);
    const byInstanceType = Object.entries(ue.byInstanceType).slice(0, 10);

    return `

      <!-- Immediate Action Section -->
      <div class="alert ${commitment.current.savingsPercent < 10 ? 'warning' : 'info'}" style="margin-bottom: 30px; background: ${commitment.current.savingsPercent < 10 ? '#fff3cd' : '#d1ecf1'}; border-left: 5px solid ${commitment.current.savingsPercent < 10 ? '#ffc107' : '#17a2b8'};">
        <span style="font-size:1.5em">💡</span>
        <div>
          <strong>What This Means:</strong>
          ${commitment.current.savingsPercent > 15
            ? `Your RI/SP commitments are saving ${commitment.current.savingsPercent.toFixed(1)}% ($${(commitment.current.savings / 1000).toFixed(1)}K/month). This is excellent coverage.`
            : commitment.current.savingsPercent > 5
            ? `You're saving ${commitment.current.savingsPercent.toFixed(1)}% with RI/SP commitments, but there's room for improvement.`
            : `Low RI/SP coverage (${commitment.current.savingsPercent.toFixed(1)}% savings). Significant cost reduction opportunity available.`
          }
          <br><strong>Immediate Action:</strong>
          ${commitment.current.savingsPercent > 15
            ? `Monitor efficiency trends below. If cost per vCPU is increasing, investigate resource utilization and right-sizing opportunities.`
            : commitment.current.savingsPercent > 5
            ? `1) Review Instance Type Analysis below for high-usage resources without RI/SP coverage. 2) Analyze 3-month usage patterns. 3) Purchase RIs/SPs for stable workloads.`
            : `URGENT: 1) Identify top 10 instance types by usage hours. 2) Calculate 3-month average usage. 3) Purchase Reserved Instances for resources with >70% utilization. Potential savings: $${((commitment.current.onDemandCost - commitment.current.amortizedCost) * 0.3 / 1000).toFixed(1)}K+/month.`
          }
        </div>
      </div>


      <!-- Hero Section: Commitment Impact -->
      <div class="commitment-hero">
        <h2>💰 RI/SP Commitment Savings This Month</h2>
        <div class="commitment-card">
          <div class="commitment-savings">
            <div class="savings-amount">${commitment.current.savings >= 0 ? '$' + (commitment.current.savings / 1000).toFixed(1) + 'K saved' : 'No savings'}</div>
            <div class="savings-percent">(${commitment.current.savingsPercent.toFixed(1)}%)</div>
          </div>
          <div class="commitment-breakdown">
            <div class="breakdown-item">
              <span class="label">On-Demand Cost:</span>
              <span class="value">$${(commitment.current.onDemandCost / 1000).toFixed(1)}K</span>
            </div>
            <div class="breakdown-arrow">→</div>
            <div class="breakdown-item">
              <span class="label">Amortized Cost (Actual):</span>
              <span class="value">$${(commitment.current.amortizedCost / 1000).toFixed(1)}K</span>
            </div>
          </div>
          <div class="commitment-trend">
            Trend: ${commitment.trend.savingsChange >= 0 ? '↑' : '↓'} $${Math.abs(commitment.trend.savingsChange / 1000).toFixed(1)}K vs last month
          </div>
          <div class="commitment-message">${commitment.message}</div>
        </div>
      </div>

      <!-- KPI Cards -->
      <div class="kpi-grid">
        <div class="kpi-card">
          <div class="kpi-label">Cost per vCPU Hour</div>
          <div class="kpi-section">
            <div class="kpi-sublabel">On-Demand:</div>
            <div class="kpi-value">$${summary.current.onDemand.costPerVCPUHour.toFixed(4)}</div>
            <div class="kpi-change ${trends.onDemand.costPerVCPUHourChange < 0 ? 'positive' : 'negative'}">
              ${trends.onDemand.costPerVCPUHourChange >= 0 ? '↑' : '↓'} ${Math.abs(trends.onDemand.costPerVCPUHourChange).toFixed(1)}% MoM
            </div>
          </div>
          <div class="kpi-section">
            <div class="kpi-sublabel">Amortized (Actual):</div>
            <div class="kpi-value">$${summary.current.amortized.costPerVCPUHour.toFixed(4)}</div>
            <div class="kpi-change ${trends.amortized.costPerVCPUHourChange < 0 ? 'positive' : 'negative'}">
              ${trends.amortized.costPerVCPUHourChange >= 0 ? '↑' : '↓'} ${Math.abs(trends.amortized.costPerVCPUHourChange).toFixed(1)}% MoM
            </div>
          </div>
          <div class="kpi-impact">RI/SP Savings: ${((1 - summary.current.amortized.costPerVCPUHour / summary.current.onDemand.costPerVCPUHour) * 100).toFixed(1)}%</div>
        </div>

        <div class="kpi-card">
          <div class="kpi-label">Cost per Usage Hour</div>
          <div class="kpi-section">
            <div class="kpi-sublabel">On-Demand:</div>
            <div class="kpi-value">$${summary.current.onDemand.costPerUsageHour.toFixed(4)}</div>
            <div class="kpi-change ${trends.onDemand.costPerUsageHourChange < 0 ? 'positive' : 'negative'}">
              ${trends.onDemand.costPerUsageHourChange >= 0 ? '↑' : '↓'} ${Math.abs(trends.onDemand.costPerUsageHourChange).toFixed(1)}% MoM
            </div>
          </div>
          <div class="kpi-section">
            <div class="kpi-sublabel">Amortized (Actual):</div>
            <div class="kpi-value">$${summary.current.amortized.costPerUsageHour.toFixed(4)}</div>
            <div class="kpi-change ${trends.amortized.costPerUsageHourChange < 0 ? 'positive' : 'negative'}">
              ${trends.amortized.costPerUsageHourChange >= 0 ? '↑' : '↓'} ${Math.abs(trends.amortized.costPerUsageHourChange).toFixed(1)}% MoM
            </div>
          </div>
          <div class="kpi-impact">RI/SP Savings: ${((1 - summary.current.amortized.costPerUsageHour / summary.current.onDemand.costPerUsageHour) * 100).toFixed(1)}%</div>
        </div>

        <div class="kpi-card">
          <div class="kpi-label">Cost per GB Month</div>
          <div class="kpi-section">
            <div class="kpi-sublabel">On-Demand:</div>
            <div class="kpi-value">$${summary.current.onDemand.costPerGBMonth.toFixed(4)}</div>
            <div class="kpi-change ${trends.onDemand.costPerGBMonthChange < 0 ? 'positive' : 'negative'}">
              ${trends.onDemand.costPerGBMonthChange >= 0 ? '↑' : '↓'} ${Math.abs(trends.onDemand.costPerGBMonthChange).toFixed(1)}% MoM
            </div>
          </div>
          <div class="kpi-section">
            <div class="kpi-sublabel">Amortized (Actual):</div>
            <div class="kpi-value">$${summary.current.amortized.costPerGBMonth.toFixed(4)}</div>
            <div class="kpi-change ${trends.amortized.costPerGBMonthChange < 0 ? 'positive' : 'negative'}">
              ${trends.amortized.costPerGBMonthChange >= 0 ? '↑' : '↓'} ${Math.abs(trends.amortized.costPerGBMonthChange).toFixed(1)}% MoM
            </div>
          </div>
          <div class="kpi-impact">RI/SP Savings: ${((1 - summary.current.amortized.costPerGBMonth / summary.current.onDemand.costPerGBMonth) * 100).toFixed(1)}%</div>
        </div>

        <div class="kpi-card">
          <div class="kpi-label">Cost per Resource</div>
          <div class="kpi-section">
            <div class="kpi-sublabel">On-Demand:</div>
            <div class="kpi-value">$${summary.current.onDemand.costPerResource.toFixed(2)}</div>
            <div class="kpi-change">Resources: ${summary.current.resources.resourceCount.toFixed(0)}</div>
          </div>
          <div class="kpi-section">
            <div class="kpi-sublabel">Amortized (Actual):</div>
            <div class="kpi-value">$${summary.current.amortized.costPerResource.toFixed(2)}</div>
            <div class="kpi-change">vCPU Hours: ${(summary.current.resources.vcpuHours / 1000).toFixed(1)}K</div>
          </div>
          <div class="kpi-impact">RI/SP Savings: ${((1 - summary.current.amortized.costPerResource / summary.current.onDemand.costPerResource) * 100).toFixed(1)}%</div>
        </div>
      </div>

      <!-- KPIs by Account -->
      <div class="table-container">
        <h2>KPIs by Account (Top 5)</h2>
        <table>
          <thead>
            <tr>
              <th>Account</th>
              <th>Cost/vCPU Hr (On-Demand)</th>
              <th>Cost/vCPU Hr (Actual)</th>
              <th>RI/SP Savings</th>
              <th>Trend</th>
            </tr>
          </thead>
          <tbody>
            ${byAccount.map(([account, data]) => `
              <tr>
                <td><strong>${account}</strong></td>
                <td>$${data.current.onDemand.costPerVCPUHour.toFixed(4)}</td>
                <td>$${data.current.amortized.costPerVCPUHour.toFixed(4)}</td>
                <td><span class="badge ${data.current.savings.percent > 0 ? 'low' : 'high'}">
                  ${data.current.savings.percent.toFixed(1)}%
                </span></td>
                <td><span class="${data.trend.efficiencyChange < 0 ? 'positive' : 'negative'}">
                  ${data.trend.efficiencyChange >= 0 ? '↑' : '↓'} ${Math.abs(data.trend.efficiencyChange).toFixed(1)}%
                </span></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>

      <!-- KPIs by Service -->
      <div class="table-container">
        <h2>KPIs by Service (Top 5)</h2>
        <table>
          <thead>
            <tr>
              <th>Service</th>
              <th>Cost/vCPU Hr (On-Demand)</th>
              <th>Cost/vCPU Hr (Actual)</th>
              <th>Cost/GB Month (On-Demand)</th>
              <th>RI/SP Savings</th>
            </tr>
          </thead>
          <tbody>
            ${byService.map(([service, data]) => `
              <tr>
                <td><strong>${service}</strong></td>
                <td>$${data.current.onDemand.costPerVCPUHour > 0 ? data.current.onDemand.costPerVCPUHour.toFixed(4) : 'N/A'}</td>
                <td>$${data.current.amortized.costPerVCPUHour > 0 ? data.current.amortized.costPerVCPUHour.toFixed(4) : 'N/A'}</td>
                <td>$${data.current.onDemand.costPerGBMonth > 0 ? data.current.onDemand.costPerGBMonth.toFixed(4) : 'N/A'}</td>
                <td><span class="badge ${data.current.savings.percent > 0 ? 'low' : 'high'}">
                  ${data.current.savings.percent.toFixed(1)}%
                </span></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>

      <!-- Instance Type Analysis -->
      <div class="table-container">
        <h2>Instance Type Efficiency (Top 10)</h2>
        <table>
          <thead>
            <tr>
              <th>Instance Type</th>
              <th>Cost/Hr (On-Demand)</th>
              <th>Cost/Hr (Actual)</th>
              <th>Usage Hours</th>
              <th>RI/SP Savings</th>
            </tr>
          </thead>
          <tbody>
            ${byInstanceType.map(([type, data]) => {
              const riSpSavings = data.current.savings.percent;
              return `
              <tr>
                <td><strong>${type}</strong></td>
                <td>$${data.current.onDemand.costPerUsageHour.toFixed(4)}</td>
                <td>$${data.current.amortized.costPerUsageHour.toFixed(4)}</td>
                <td>${(data.current.resources.usageHours / 1000).toFixed(1)}K</td>
                <td><span class="badge ${riSpSavings > 10 ? 'low' : riSpSavings > 0 ? 'medium' : 'high'}">
                  ${riSpSavings.toFixed(1)}% ${riSpSavings === 0 ? '⚠️' : '✅'}
                </span></td>
              </tr>
            `}).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  generateHTML() {
    const metrics = this.calculateMetrics();
    const topAccounts = Object.entries(this.aggregateByAccount(this.data.currentMonth.results))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    
    const topAnomalies = this.data.anomalies.slice(0, 10);
    const topRightsizing = this.data.rightsizing.slice(0, 15);
    
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Cloud Cost Executive Dashboard - ${new Date().toLocaleDateString()}</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); min-height: 100vh; padding: 20px; }
        .dashboard { max-width: 1600px; margin: 0 auto; }
        .header { background: white; padding: 30px; border-radius: 20px; margin-bottom: 20px; box-shadow: 0 10px 40px rgba(0,0,0,0.2); }
        .header h1 { color: #2c3e50; font-size: 2.5em; margin-bottom: 10px; }
        .header .subtitle { color: #7f8c8d; font-size: 1.2em; }
        .nav-tabs { display: flex; gap: 10px; margin-bottom: 20px; flex-wrap: wrap; }
        .nav-tab { background: white; border: none; padding: 15px 30px; border-radius: 10px; cursor: pointer; font-size: 1em; font-weight: 600; transition: all 0.3s; box-shadow: 0 4px 15px rgba(0,0,0,0.1); }
        .nav-tab:hover { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(0,0,0,0.15); }
        .nav-tab.active { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; }
        .page { display: none; }
        .page.active { display: block; }
        .kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px; margin-bottom: 30px; }
        .kpi-card { background: white; padding: 25px; border-radius: 15px; box-shadow: 0 4px 15px rgba(0,0,0,0.1); position: relative; overflow: hidden; }
        .kpi-card::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 5px; background: linear-gradient(90deg, #667eea 0%, #764ba2 100%); }
        .kpi-card.positive::before { background: linear-gradient(90deg, #11998e 0%, #38ef7d 100%); }
        .kpi-card.negative::before { background: linear-gradient(90deg, #eb3349 0%, #f45c43 100%); }
        .kpi-card.warning::before { background: linear-gradient(90deg, #f2994a 0%, #f2c94c 100%); }
        .kpi-label { color: #7f8c8d; font-size: 0.9em; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 10px; }
        .kpi-value { font-size: 2.5em; font-weight: bold; color: #2c3e50; margin-bottom: 5px; }
        .kpi-change { font-size: 0.9em; }
        .kpi-change.positive { color: #27ae60; }
        .kpi-change.negative { color: #e74c3c; }
        .chart-container { background: white; padding: 30px; border-radius: 15px; box-shadow: 0 4px 15px rgba(0,0,0,0.1); margin-bottom: 20px; }
        .chart-container h2 { color: #2c3e50; margin-bottom: 20px; font-size: 1.5em; }
        .chart-wrapper { position: relative; height: 400px; }
        .grid-2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(500px, 1fr)); gap: 20px; margin-bottom: 20px; }
        .table-container { background: white; padding: 30px; border-radius: 15px; box-shadow: 0 4px 15px rgba(0,0,0,0.1); overflow-x: auto; }
        table { width: 100%; border-collapse: collapse; }
        th { background: #f8f9fa; padding: 15px; text-align: left; font-weight: 600; color: #2c3e50; border-bottom: 2px solid #e9ecef; }
        td { padding: 15px; border-bottom: 1px solid #e9ecef; }
        tr:hover { background: #f8f9fa; }
        .badge { display: inline-block; padding: 5px 12px; border-radius: 20px; font-size: 0.85em; font-weight: 600; }
        .badge.high { background: #fee; color: #c00; }
        .badge.medium { background: #fff3cd; color: #856404; }
        .badge.low { background: #d4edda; color: #155724; }
        .alert { padding: 20px; border-radius: 10px; margin-bottom: 20px; display: flex; align-items: center; gap: 15px; }
        .alert.warning { background: #fff3cd; border-left: 5px solid #ffc107; color: #856404; }
        .alert.danger { background: #f8d7da; border-left: 5px solid #dc3545; color: #721c24; }
        .commitment-hero { background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%); padding: 30px; border-radius: 15px; margin-bottom: 30px; color: white; box-shadow: 0 10px 40px rgba(0,0,0,0.2); }
        .commitment-hero h2 { margin-bottom: 20px; font-size: 1.8em; }
        .commitment-card { background: rgba(255,255,255,0.15); padding: 25px; border-radius: 10px; backdrop-filter: blur(10px); }
        .commitment-savings { display: flex; align-items: baseline; gap: 15px; margin-bottom: 15px; }
        .savings-amount { font-size: 3em; font-weight: bold; }
        .savings-percent { font-size: 2em; opacity: 0.9; }
        .commitment-breakdown { display: flex; align-items: center; gap: 20px; margin: 20px 0; padding: 15px; background: rgba(255,255,255,0.1); border-radius: 8px; }
        .breakdown-item { flex: 1; }
        .breakdown-item .label { display: block; font-size: 0.9em; opacity: 0.8; margin-bottom: 5px; }
        .breakdown-item .value { display: block; font-size: 1.5em; font-weight: bold; }
        .breakdown-arrow { font-size: 2em; opacity: 0.6; }
        .commitment-trend { font-size: 1.1em; margin: 10px 0; opacity: 0.9; }
        .commitment-message { font-size: 1em; opacity: 0.85; font-style: italic; margin-top: 10px; }
        .kpi-section { margin: 10px 0; padding: 10px 0; border-bottom: 1px solid #e9ecef; }
        .kpi-section:last-child { border-bottom: none; }
        .kpi-sublabel { font-size: 0.85em; color: #6c757d; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 5px; }
        .kpi-impact { margin-top: 10px; padding-top: 10px; border-top: 2px solid #e9ecef; font-weight: 600; color: #27ae60; font-size: 0.95em; }
        @media (max-width: 768px) { .grid-2 { grid-template-columns: 1fr; } .kpi-grid { grid-template-columns: 1fr; } .commitment-breakdown { flex-direction: column; } .breakdown-arrow { transform: rotate(90deg); } }
    </style>
</head>
<body>
    <div class="dashboard">
        <div class="header">
            <h1>☁️ Cloud Cost Executive Dashboard</h1>
            <div class="subtitle">Generated: ${new Date().toLocaleString()} | Data: ${this.data.metadata.currentMonth.start} to ${this.data.metadata.currentMonth.end}</div>
        </div>
        
        <div class="nav-tabs">
            <button class="nav-tab active" onclick="showPage('overview')">📊 Overview</button>
            <button class="nav-tab" onclick="showPage('kpis')">📊 KPIs</button>
            <button class="nav-tab" onclick="showPage('optimization')">⚡ Optimization</button>
            <button class="nav-tab" onclick="showPage('anomalies')">🚨 Anomalies</button>
            <button class="nav-tab" onclick="showPage('forecast')">🔮 Forecast</button>
        </div>
        

            <!-- Immediate Action Section -->
            <div class="alert ${metrics.momChange > 15 ? 'danger' : 'warning'}" style="margin-bottom: 30px;">
                <span style="font-size:1.5em">💡</span>
                <div>
                    <strong>Immediate Action Required:</strong>
                    ${metrics.momChange > 15 
                        ? `Month-over-month costs increased by ${metrics.momChange.toFixed(1)}%. Review top spending accounts and investigate anomalies immediately.`
                        : metrics.budgetVariance > 0
                        ? `Projected to exceed annual budget by $${(metrics.budgetVariance / 1000000).toFixed(2)}M. Implement cost optimization recommendations now.`
                        : `Monitor spending trends and review ${this.data.rightsizing.length} optimization opportunities to maintain budget targets.`
                    }
                    <br><strong>Next Steps:</strong> 
                    ${metrics.momChange > 15 
                        ? '1) Check Anomalies tab for unusual spending patterns. 2) Review top 5 accounts for unexpected growth. 3) Validate new resource deployments.'
                        : '1) Review Optimization tab for quick wins. 2) Analyze KPIs tab for efficiency trends. 3) Plan RI/SP purchases for high-usage resources.'
                    }
                </div>
            </div>


        <div id="overview" class="page active">
            <div class="kpi-grid">
                <div class="kpi-card">
                    <div class="kpi-label">Current Month (MTD)</div>
                    <div class="kpi-value">$${(metrics.currentTotal / 1000).toFixed(2)}K</div>
                    <div class="kpi-change ${metrics.momChange > 0 ? 'negative' : 'positive'}">${metrics.momChange > 0 ? '↑' : '↓'} ${Math.abs(metrics.momChange).toFixed(1)}% vs prev month</div>
                </div>
                <div class="kpi-card ${metrics.momChange > 10 ? 'negative' : 'positive'}">
                    <div class="kpi-label">Projected Monthly</div>
                    <div class="kpi-value">$${(metrics.projectedMonthly / 1000000).toFixed(2)}M</div>
                    <div class="kpi-change">Based on ${this.data.metadata.currentMonth.day} days</div>
                </div>
                <div class="kpi-card positive">
                    <div class="kpi-label">YTD Spend</div>
                    <div class="kpi-value">$${(metrics.ytdTotal / 1000000).toFixed(2)}M</div>
                    <div class="kpi-change">${metrics.ytdBudgetPercent.toFixed(1)}% of annual budget</div>
                </div>
                <div class="kpi-card warning">
                    <div class="kpi-label">Optimization Potential</div>
                    <div class="kpi-value">${this.data.rightsizing.length}</div>
                    <div class="kpi-change">Recommendations available</div>
                </div>
            </div>
            
            ${metrics.budgetVariance > 0 ? `<div class="alert danger">
                <span style="font-size:1.5em">🚨</span>
                <div><strong>Budget Alert:</strong> Projected year-end spend of $${(metrics.projectedYearEnd / 1000000).toFixed(2)}M exceeds budget by $${(metrics.budgetVariance / 1000000).toFixed(2)}M. Immediate action required.</div>
            </div>` : ''}
            
            <div class="grid-2">
                <div class="chart-container">
                    <h2>Top 5 Accounts by Spend</h2>
                    <div class="chart-wrapper"><canvas id="accountsChart"></canvas></div>
                </div>
                <div class="table-container">
                    <h2>Account Breakdown</h2>
                    <table>
                        <thead><tr><th>Account</th><th>Spend</th><th>% of Total</th></tr></thead>
                        <tbody>
                            ${topAccounts.map(([name, cost]) => `
                                <tr>
                                    <td>${name}</td>
                                    <td>$${(cost / 1000).toFixed(2)}K</td>
                                    <td>${((cost / metrics.currentTotal) * 100).toFixed(1)}%</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
        
        <div id="kpis" class="page">
            ${this.generateUnitEconomicsPage()}
        </div>
        
        <div id="optimization" class="page">

            <!-- Immediate Action Section -->
            <div class="alert ${this.data.rightsizing.length > 20 ? 'danger' : 'warning'}" style="margin-bottom: 30px;">
                <span style="font-size:1.5em">💡</span>
                <div>
                    <strong>What This Means:</strong>
                    ${this.data.rightsizing.length > 20
                        ? `You have ${this.data.rightsizing.length} rightsizing opportunities. Many resources are over-provisioned or underutilized.`
                        : this.data.rightsizing.length > 0
                        ? `${this.data.rightsizing.length} optimization opportunities identified. Quick wins available.`
                        : `No rightsizing recommendations found. Resources are well-optimized.`
                    }
                    ${topRightsizing[0]?.savingsPercentage > 50 
                        ? ` Top opportunity saves ${topRightsizing[0].savingsPercentage}% - high-impact change.`
                        : ''
                    }
                    <br><strong>Immediate Action:</strong>
                    ${this.data.rightsizing.length > 20
                        ? `URGENT: 1) Start with top 5 recommendations (highest savings %). 2) Validate with application teams. 3) Implement changes in dev/test first. 4) Schedule production changes during maintenance windows. Target: Reduce 50% of recommendations within 30 days.`
                        : this.data.rightsizing.length > 0
                        ? `1) Review top 5 recommendations with resource owners. 2) Verify current utilization patterns (check last 30 days). 3) Implement low-risk changes (dev/test environments) immediately. 4) Plan production changes for next sprint.`
                        : `Continue monitoring. Review this tab monthly for new opportunities as usage patterns change.`
                    }
                </div>
            </div>


            <div class="kpi-grid">
                <div class="kpi-card positive">
                    <div class="kpi-label">Total Recommendations</div>
                    <div class="kpi-value">${this.data.rightsizing.length}</div>
                    <div class="kpi-change">Rightsizing opportunities</div>
                </div>
                <div class="kpi-card">
                    <div class="kpi-label">Top Opportunity</div>
                    <div class="kpi-value">${topRightsizing[0]?.savingsPercentage || 0}%</div>
                    <div class="kpi-change">Potential savings</div>
                </div>
            </div>
            
            <div class="table-container">
                <h2>Top 15 Optimization Opportunities</h2>
                <table>
                    <thead>
                        <tr>
                            <th>Resource</th>
                            <th>Current</th>
                            <th>Recommended</th>
                            <th>Savings %</th>
                            <th>Monthly Savings</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${topRightsizing.map(rec => `
                            <tr>
                                <td>${rec.resourceIdentifier || 'N/A'}</td>
                                <td>${rec.currentInstanceType || 'N/A'}</td>
                                <td>${rec.recommendedInstanceType || 'N/A'}</td>
                                <td><span class="badge ${rec.savingsPercentage > 50 ? 'high' : 'medium'}">${rec.savingsPercentage || 0}%</span></td>
                                <td>$${rec.monthlySavings || 0}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>
        
        <div id="anomalies" class="page">
            <div class="kpi-grid">
                <div class="kpi-card negative">
                    <div class="kpi-label">Total Anomalies (90d)</div>

            <!-- Immediate Action Section -->
            <div class="alert ${this.data.anomalies.length > 10 ? 'danger' : this.data.anomalies.length > 0 ? 'warning' : 'info'}" style="margin-bottom: 30px;">
                <span style="font-size:1.5em">💡</span>
                <div>
                    <strong>What This Means:</strong>
                    ${this.data.anomalies.length > 10
                        ? `${this.data.anomalies.length} cost anomalies detected in the last 90 days. Multiple unusual spending patterns require investigation.`
                        : this.data.anomalies.length > 0
                        ? `${this.data.anomalies.length} anomalies detected. Some spending patterns deviate from normal.`
                        : `No anomalies detected. Spending patterns are consistent and predictable.`
                    }
                    <br><strong>Immediate Action:</strong>
                    ${this.data.anomalies.length > 10
                        ? `URGENT: 1) Review top 5 anomalies by cost impact. 2) Identify root cause (new deployments, data processing jobs, security incidents). 3) Contact resource owners for explanation. 4) Implement alerts for similar patterns. 5) If unauthorized: terminate resources immediately.`
                        : this.data.anomalies.length > 0
                        ? `1) Investigate each anomaly with resource owners. 2) Determine if spending was planned (e.g., load testing, data migration). 3) If unplanned: identify cause and prevent recurrence. 4) Update budgets if new baseline is expected.`
                        : `Continue monitoring. Anomaly detection is working correctly. Review this tab weekly to catch issues early.`
                    }
                </div>
            </div>


                    <div class="kpi-value">${this.data.anomalies.length}</div>
                    <div class="kpi-change">Last 90 days</div>
                </div>
                <div class="kpi-card negative">
                    <div class="kpi-label">High Severity</div>
                    <div class="kpi-value">${topAnomalies.filter(a => a.severity === 'high').length}</div>
                    <div class="kpi-change">Requires action</div>
                </div>
            </div>
            
            <div class="table-container">
                <h2>Top 10 Cost Anomalies</h2>
                <table>
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>Account</th>
                            <th>Service</th>
                            <th>Increase</th>
                            <th>Amount</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${topAnomalies.map(anomaly => `
                            <tr>
                                <td>${anomaly.date || 'N/A'}</td>
                                <td>${anomaly.vendorAccountName || 'N/A'}</td>
                                <td>${anomaly.service || 'N/A'}</td>
                                <td><span class="badge high">+${anomaly.percentageIncrease || 0}%</span></td>
                                <td>$${anomaly.cost || 0}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>
        
        <div id="forecast" class="page">
            <div class="kpi-grid">
                <div class="kpi-card">
                    <div class="kpi-label">Annual Budget</div>
                    <div class="kpi-value">$${(BUDGET_CONFIG.annual / 1000000).toFixed(1)}M</div>
                    <div class="kpi-change">2026 Approved</div>
                </div>
                <div class="kpi-card ${metrics.budgetVariance > 0 ? 'warning' : 'positive'}">
                    <div class="kpi-label">Projected Year-End</div>
                    <div class="kpi-value">$${(metrics.projectedYearEnd / 1000000).toFixed(2)}M</div>
                    <div class="kpi-change ${metrics.budgetVariance > 0 ? 'negative' : 'positive'}">
                        ${metrics.budgetVariance > 0 ? '↑' : '↓'} $${Math.abs(metrics.budgetVariance / 1000000).toFixed(2)}M ${metrics.budgetVariance > 0 ? 'over' : 'under'} budget
                    </div>
                </div>
            </div>
            
            <div class="chart-container">
                <h2>Monthly Trend & Forecast</h2>
                <div class="chart-wrapper"><canvas id="forecastChart"></canvas></div>
            </div>
        </div>
    </div>
    
    <script>
        function showPage(pageId) {
            document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
            document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
            document.getElementById(pageId).classList.add('active');
            event.target.classList.add('active');
        }
        
        const accountData = ${JSON.stringify(topAccounts.map(([name, cost]) => ({ name, cost })))};
        new Chart(document.getElementById('accountsChart'), {
            type: 'bar',
            data: {
                labels: accountData.map(a => a.name),
                datasets: [{
                    label: 'Spend ($K)',
                    data: accountData.map(a => a.cost / 1000),
                    backgroundColor: '${CHART_COLORS.primary}'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } }
            }
        });
        
        new Chart(document.getElementById('forecastChart'), {
            type: 'line',
            data: {
                labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
                datasets: [{
                    label: 'Budget',
                    data: Array(12).fill(${BUDGET_CONFIG.monthly / 1000000}),
                    borderColor: '${CHART_COLORS.success}',
                    borderDash: [5, 5],
                    fill: false
                }, {
                    label: 'Actual/Forecast',
                    data: [${metrics.avgMonthly / 1000000}, ${metrics.avgMonthly / 1000000}, ${metrics.avgMonthly / 1000000}, ${metrics.avgMonthly / 1000000}, ${metrics.previousTotal / 1000000}, ${metrics.projectedMonthly / 1000000}, ${metrics.avgMonthly / 1000000}, ${metrics.avgMonthly / 1000000}, ${metrics.avgMonthly / 1000000}, ${metrics.avgMonthly / 1000000}, ${metrics.avgMonthly / 1000000}, ${metrics.avgMonthly / 1000000}],
                    borderColor: '${CHART_COLORS.danger}',
                    fill: false
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false
            }
        });
    </script>
</body>
</html>`;
  }

  async save() {
    const html = this.generateHTML();
    fs.writeFileSync(OUTPUT_PATH, html);
    console.log(`✅ Dashboard generated: ${OUTPUT_PATH}`);
    return OUTPUT_PATH;
  }

  async open() {
    exec(`open "${OUTPUT_PATH}"`, (error) => {
      if (error) {
        console.error(`Error opening dashboard: ${error.message}`);
      } else {
        console.log('🌐 Dashboard opened in browser');
      }
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
  
  console.log('\n✅ Executive Dashboard generation complete!');
}

export { DashboardGenerator };
