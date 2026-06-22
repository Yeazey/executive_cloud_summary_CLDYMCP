#!/usr/bin/env node
import { CloudabilityDataCollector } from './data-collector.mjs';
import { CHART_COLORS, OUTPUT_PATH, BUDGET_CONFIG, DATE_CONFIG } from './config.mjs';
import fs from 'fs';
import { exec } from 'child_process';

class DashboardGenerator {
  constructor(data) {
    this.data = data;
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
        @media (max-width: 768px) { .grid-2 { grid-template-columns: 1fr; } .kpi-grid { grid-template-columns: 1fr; } }
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
            <button class="nav-tab" onclick="showPage('optimization')">⚡ Optimization</button>
            <button class="nav-tab" onclick="showPage('anomalies')">🚨 Anomalies</button>
            <button class="nav-tab" onclick="showPage('forecast')">🔮 Forecast</button>
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
        
        <div id="optimization" class="page">
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
