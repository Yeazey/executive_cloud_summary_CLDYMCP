#!/usr/bin/env node
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { CLOUDABILITY_CONFIG, DATE_CONFIG } from './config.mjs';
import fs from 'fs';
import path from 'path';

export class CloudabilityDataCollector {
  constructor() {
    this.client = null;
    this.transport = null;
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

    this.client = new Client({
      name: 'executive-dashboard-collector',
      version: '1.0.0'
    }, {
      capabilities: {}
    });

    await this.client.connect(this.transport);
    console.log('✅ Connected to Cloudability MCP Server');
  }

  async collectCurrentMonth() {
    const dates = DATE_CONFIG.getCurrentMonth();
    console.log(`📊 Collecting current month data (${dates.start} to ${dates.end})...`);
    
    const result = await this.client.callTool({
      name: 'cldy_cost_report_run',
      arguments: {
        dimensions: ['vendor_account_name', 'category3'],
        metrics: ['unblended_cost', 'total_amortized_cost', 'public_on_demand_cost'],
        start_date: dates.start,
        end_date: dates.end,
        sort_by: 'unblended_cost',
        order: 'DESC',
        limit: 100
      }
    });
    
    return JSON.parse(result.content[0].text);
  }

  async collectCurrentMonthWithResources() {
    const dates = DATE_CONFIG.getCurrentMonth();
    console.log(`📊 Collecting current month resource metrics (${dates.start} to ${dates.end})...`);
    
    const result = await this.client.callTool({
      name: 'cldy_cost_report_run',
      arguments: {
        dimensions: ['vendor_account_name', 'service_name', 'instance_type'],
        metrics: ['total_amortized_cost', 'public_on_demand_cost', 'vcpu_hours', 'usage_hours', 'gb_months', 'resource_identifier_count'],
        start_date: dates.start,
        end_date: dates.end,
        sort_by: 'total_amortized_cost',
        order: 'DESC',
        limit: 500
      }
    });
    
    return JSON.parse(result.content[0].text);
  }

  async collectPreviousMonth() {
    const dates = DATE_CONFIG.getPreviousMonth();
    console.log(`📊 Collecting previous month data (${dates.start} to ${dates.end})...`);
    
    const result = await this.client.callTool({
      name: 'cldy_cost_report_run',
      arguments: {
        dimensions: ['vendor_account_name', 'category3'],
        metrics: ['unblended_cost', 'total_amortized_cost', 'public_on_demand_cost'],
        start_date: dates.start,
        end_date: dates.end,
        sort_by: 'unblended_cost',
        order: 'DESC',
        limit: 100
      }
    });
    
    return JSON.parse(result.content[0].text);
  }

  async collectPreviousMonthWithResources() {
    const dates = DATE_CONFIG.getPreviousMonth();
    console.log(`📊 Collecting previous month resource metrics (${dates.start} to ${dates.end})...`);
    
    const result = await this.client.callTool({
      name: 'cldy_cost_report_run',
      arguments: {
        dimensions: ['vendor_account_name', 'service_name', 'instance_type'],
        metrics: ['total_amortized_cost', 'public_on_demand_cost', 'vcpu_hours', 'usage_hours', 'gb_months', 'resource_identifier_count'],
        start_date: dates.start,
        end_date: dates.end,
        sort_by: 'total_amortized_cost',
        order: 'DESC',
        limit: 500
      }
    });
    
    return JSON.parse(result.content[0].text);
  }

  async collectYearToDate() {
    const dates = DATE_CONFIG.getYearToDate();
    console.log(`📊 Collecting YTD data (${dates.start} to ${dates.end})...`);
    
    const result = await this.client.callTool({
      name: 'cldy_cost_report_run',
      arguments: {
        dimensions: ['month', 'vendor_account_name'],
        metrics: ['unblended_cost'],
        start_date: dates.start,
        end_date: dates.end,
        sort_by: 'month',
        order: 'ASC',
        limit: 200
      }
    });
    
    return JSON.parse(result.content[0].text);
  }

  async collectRightsizing() {
    console.log('⚡ Collecting rightsizing recommendations...');
    
    const result = await this.client.callTool({
      name: 'cldy_rightsizing_list',
      arguments: {
        limit: 500
      }
    });
    
    return JSON.parse(result.content[0].text);
  }

  async collectAnomalies() {
    const dates = DATE_CONFIG.getLast90Days();
    console.log(`🚨 Collecting anomalies (${dates.start} to ${dates.end})...`);
    
    const result = await this.client.callTool({
      name: 'cldy_anomalies_list',
      arguments: {
        start_date: dates.start,
        end_date: dates.end,
        limit: 100
      }
    });
    
    return JSON.parse(result.content[0].text);
  }

  async collectHistoricalMonths(monthsBack = 12) {
    console.log(`📊 Collecting historical data (last ${monthsBack} months)...`);
    const historicalData = [];
    const today = new Date();
    
    for (let i = 0; i < monthsBack; i++) {
      const date = new Date();
      date.setMonth(date.getMonth() - i);
      const year = date.getFullYear();
      const month = date.getMonth() + 1;
      const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
      
      // Calculate end date (use today for current month, last day for past months)
      let endDate;
      if (i === 0) {
        // Current month - use today's date
        endDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      } else {
        // Past months - use last day of month
        const lastDay = new Date(year, month, 0).getDate();
        endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
      }
      
      console.log(`  📅 Fetching ${year}-${String(month).padStart(2, '0')}...`);
      
      const result = await this.client.callTool({
        name: 'cldy_cost_report_run',
        arguments: {
          dimensions: ['vendor_account_name'],
          metrics: ['total_amortized_cost', 'public_on_demand_cost', 'vcpu_hours', 'usage_hours'],
          start_date: startDate,
          end_date: endDate,
          sort_by: 'total_amortized_cost',
          order: 'DESC',
          limit: 100
        }
      });
      
      const monthData = JSON.parse(result.content[0].text);
      historicalData.push({
        month: `${year}-${String(month).padStart(2, '0')}`,
        startDate,
        endDate,
        data: monthData
      });
    }
    
    return historicalData;
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
      anomalies: await this.collectAnomalies()
    };
    
    await this.client.close();
    console.log('✅ Data collection complete');
    
    return data;
  }

  async saveToFile(data, filepath) {
    fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
    console.log(`💾 Data saved to: ${filepath}`);
  }
}

// CLI usage
if (import.meta.url === `file://${process.argv[1]}`) {
  const collector = new CloudabilityDataCollector();
  const data = await collector.collectAll();
  const outputPath = path.join(process.cwd(), 'output', 'dashboard-data.json');
  await collector.saveToFile(data, outputPath);
}
