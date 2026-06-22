#!/usr/bin/env node
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { CLOUDABILITY_CONFIG, DATE_CONFIG } from './config.mjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

export class CloudabilityDataCollector {
  constructor() {
    this.client = null;
    this.transport = null;
    this.viewId = null;
  }

  async connect() {
    this.transport = new StdioClientTransport({
      command: 'node',
      args: [path.join(CLOUDABILITY_CONFIG.MCP_SERVER_PATH, 'dist/index.js')],
      env: {
        ...process.env,
        CLOUDABILITY_AUTH_METHOD: CLOUDABILITY_CONFIG.AUTH_METHOD,
        CLOUDABILITY_OPENTOKEN: CLOUDABILITY_CONFIG.OPENTOKEN,
        CLOUDABILITY_ENVIRONMENT_ID: CLOUDABILITY_CONFIG.ENVIRONMENT_ID,
        CLOUDABILITY_REGION: CLOUDABILITY_CONFIG.REGION
      }
    });

    this.client = new Client({ name: 'executive-dashboard-collector', version: '2.0.0' }, { capabilities: {} });
    await this.client.connect(this.transport);
    console.log('✅ Connected to Cloudability MCP Server');
  }

  async callToolSafe(name, args, fallback = null) {
    try {
      const result = await this.client.callTool({ name, arguments: args });
      const text = result?.content?.[0]?.text;
      if (!text) return fallback;
      return JSON.parse(text);
    } catch (err) {
      console.warn(`⚠️  ${name} failed: ${err.message}`);
      return fallback;
    }
  }

  async getDefaultViewId() {
    if (this.viewId) return this.viewId;
    const views = await this.callToolSafe('list_views', { limit: 10 }, []);
    if (Array.isArray(views) && views.length > 0) {
      this.viewId = String(views[0].id || views[0].viewId || '0');
    } else if (views?.result && Array.isArray(views.result)) {
      this.viewId = String(views.result[0]?.id || '0');
    } else {
      this.viewId = '0';
    }
    console.log(`📋 Using viewId: ${this.viewId}`);
    return this.viewId;
  }

  async collectCurrentMonth() {
    const dates = DATE_CONFIG.getCurrentMonth();
    console.log(`📊 Collecting current month data (${dates.start} to ${dates.end})...`);
    return await this.callToolSafe('cldy_cost_report_run', {
      dimensions: ['vendor_account_name', 'category3'],
      metrics: ['unblended_cost', 'total_amortized_cost', 'public_on_demand_cost'],
      start_date: dates.start, end_date: dates.end,
      sort_by: 'unblended_cost', order: 'DESC', limit: 100
    }, { results: [] });
  }

  async collectCurrentMonthWithResources() {
    const dates = DATE_CONFIG.getCurrentMonth();
    console.log(`📊 Collecting current month resource metrics...`);
    return await this.callToolSafe('cldy_cost_report_run', {
      dimensions: ['vendor_account_name', 'service_name', 'instance_type'],
      metrics: ['total_amortized_cost', 'public_on_demand_cost', 'vcpu_hours', 'usage_hours', 'gb_months', 'resource_identifier_count'],
      start_date: dates.start, end_date: dates.end,
      sort_by: 'total_amortized_cost', order: 'DESC', limit: 500
    }, { results: [] });
  }

  async collectPreviousMonth() {
    const dates = DATE_CONFIG.getPreviousMonth();
    console.log(`📊 Collecting previous month data (${dates.start} to ${dates.end})...`);
    return await this.callToolSafe('cldy_cost_report_run', {
      dimensions: ['vendor_account_name', 'category3'],
      metrics: ['unblended_cost', 'total_amortized_cost', 'public_on_demand_cost'],
      start_date: dates.start, end_date: dates.end,
      sort_by: 'unblended_cost', order: 'DESC', limit: 100
    }, { results: [] });
  }

  async collectPreviousMonthWithResources() {
    const dates = DATE_CONFIG.getPreviousMonth();
    console.log(`📊 Collecting previous month resource metrics...`);
    return await this.callToolSafe('cldy_cost_report_run', {
      dimensions: ['vendor_account_name', 'service_name', 'instance_type'],
      metrics: ['total_amortized_cost', 'public_on_demand_cost', 'vcpu_hours', 'usage_hours', 'gb_months', 'resource_identifier_count'],
      start_date: dates.start, end_date: dates.end,
      sort_by: 'total_amortized_cost', order: 'DESC', limit: 500
    }, { results: [] });
  }

  async collectYearToDate() {
    const dates = DATE_CONFIG.getYearToDate();
    console.log(`📊 Collecting YTD data (${dates.start} to ${dates.end})...`);
    return await this.callToolSafe('cldy_cost_report_run', {
      dimensions: ['month', 'vendor_account_name'],
      metrics: ['unblended_cost'],
      start_date: dates.start, end_date: dates.end,
      sort_by: 'month', order: 'ASC', limit: 200
    }, { results: [] });
  }

  async collectRightsizing() {
    console.log('⚡ Collecting rightsizing recommendations...');
    // Get all rightsizing - paginate if needed
    const all = [];
    let offset = 0;
    const limit = 500;
    while (true) {
      const batch = await this.callToolSafe('cldy_rightsizing_list', {
        limit, offset, sort: '-potentialSavings'
      }, []);
      const items = Array.isArray(batch) ? batch : [];
      all.push(...items);
      if (items.length < limit) break;
      offset += limit;
      console.log(`  ⚡ Fetched ${all.length} rightsizing recommendations...`);
    }
    console.log(`  ⚡ Total: ${all.length} rightsizing recommendations`);
    return all;
  }

  async collectForecast() {
    const viewId = await this.getDefaultViewId();
    console.log('🔮 Collecting forecast...');
    return await this.callToolSafe('cldy_forecast_get', { view_id: viewId }, null);
  }

  async collectEstimate() {
    const viewId = await this.getDefaultViewId();
    console.log('📐 Collecting current period estimate...');
    return await this.callToolSafe('cldy_estimate_get', { view_id: viewId }, null);
  }

  async collectBudgets() {
    console.log('💰 Collecting budgets...');
    return await this.callToolSafe('list_budgets', { limit: 50 }, []);
  }

  async collectByBusinessDimension(dimensionField) {
    const dates = DATE_CONFIG.getCurrentMonth();
    console.log(`📊 Collecting by ${dimensionField}...`);
    return await this.callToolSafe('cldy_cost_report_run', {
      dimensions: [dimensionField],
      metrics: ['total_amortized_cost', 'public_on_demand_cost', 'vcpu_hours', 'usage_hours', 'gb_months', 'resource_identifier_count'],
      start_date: dates.start, end_date: dates.end,
      sort_by: 'total_amortized_cost', order: 'DESC', limit: 50
    }, { results: [] });
  }

  async collectAISpend() {
    const dates = DATE_CONFIG.getCurrentMonth();
    console.log('🤖 Collecting AI spend data...');
    return await this.callToolSafe('cldy_cost_report_run', {
      dimensions: ['enhanced_service_name', 'usage_type', 'vendor'],
      metrics: ['total_amortized_cost', 'usage_quantity'],
      start_date: dates.start, end_date: dates.end,
      sort_by: 'total_amortized_cost', order: 'DESC', limit: 300
    }, { results: [] });
  }

  async collectAnomalies() {
    const dates = DATE_CONFIG.getLast90Days();
    const viewId = await this.getDefaultViewId();
    console.log(`🚨 Collecting anomalies (${dates.start} to ${dates.end})...`);
    return await this.callToolSafe('cldy_anomalies_list', {
      startDate: dates.start, endDate: dates.end, viewId
    }, []);
  }

  async collectHistoricalMonths(monthsBack = 12) {
    console.log(`📊 Collecting historical data (last ${monthsBack} months)...`);
    const today = new Date();
    const promises = [];

    for (let i = 0; i < monthsBack; i++) {
      const date = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const year = date.getFullYear();
      const month = date.getMonth() + 1;
      const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
      const endDate = i === 0
        ? `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
        : `${year}-${String(month).padStart(2, '0')}-${new Date(year, month, 0).getDate()}`;

      promises.push(
        this.callToolSafe('cldy_cost_report_run', {
          dimensions: ['vendor_account_name'],
          metrics: ['total_amortized_cost', 'public_on_demand_cost', 'vcpu_hours', 'usage_hours'],
          start_date: startDate, end_date: endDate,
          sort_by: 'total_amortized_cost', order: 'DESC', limit: 100
        }, { results: [] }).then(data => ({
          month: `${year}-${String(month).padStart(2, '0')}`, startDate, endDate, data
        }))
      );
    }

    // Run 3 at a time to avoid overwhelming the API
    const results = [];
    for (let i = 0; i < promises.length; i += 3) {
      const batch = promises.slice(i, i + 3);
      const batchResults = await Promise.all(batch);
      results.push(...batchResults);
      console.log(`  📅 Fetched ${Math.min(i + 3, monthsBack)}/${monthsBack} months...`);
    }
    return results;
  }

  async collectAll() {
    await this.connect();

    const data = {
      metadata: {
        generated: new Date().toISOString(),
        currentMonth: DATE_CONFIG.getCurrentMonth(),
        previousMonth: DATE_CONFIG.getPreviousMonth(),
        yearToDate: DATE_CONFIG.getYearToDate()
      },
      currentMonth: await this.collectCurrentMonth(),
      previousMonth: await this.collectPreviousMonth(),
      currentMonthResources: await this.collectCurrentMonthWithResources(),
      previousMonthResources: await this.collectPreviousMonthWithResources(),
      yearToDate: await this.collectYearToDate(),
      historicalMonths: await this.collectHistoricalMonths(12),
      rightsizing: await this.collectRightsizing(),
      anomalies: await this.collectAnomalies(),
      forecast: await this.collectForecast(),
      estimate: await this.collectEstimate(),
      budgets: await this.collectBudgets(),
      byProduct: await this.collectByBusinessDimension('category4'),
      byApplication: await this.collectByBusinessDimension('category3'),
      byBusinessUnit: await this.collectByBusinessDimension('category5'),
      byTeam: await this.collectByBusinessDimension('category2'),
      aiSpend: await this.collectAISpend()
    };

    await this.client.close();
    console.log('✅ Data collection complete');
    return data;
  }

  async saveToFile(data, filepath) {
    const dir = path.dirname(filepath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
    console.log(`💾 Data saved to: ${filepath}`);
  }
}

// CLI usage
if (import.meta.url === `file://${process.argv[1]}`) {
  const collector = new CloudabilityDataCollector();
  const data = await collector.collectAll();
  const outputPath = path.join(ROOT, 'output', 'dashboard-data.json');
  await collector.saveToFile(data, outputPath);
}
