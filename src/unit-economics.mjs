#!/usr/bin/env node

/**
 * Unit Economics Calculator
 * Calculates technical unit economics from Cloudability data
 * Supports both unblended (actual) and amortized (with RI/SP) costs
 */

export class UnitEconomicsCalculator {
  constructor(currentMonthResources, previousMonthResources, rightsizingData = []) {
    this.currentMonthResources = currentMonthResources;
    this.previousMonthResources = previousMonthResources;
    this.rightsizingData = rightsizingData;
    this._summaryCache = null;
  }

  /**
   * Calculate all unit economics metrics
   * Returns both unblended and amortized versions
   */
  calculateAll() {
    return {
      summary: this.calculateSummary(),
      byAccount: this.calculateByAccount(),
      byService: this.calculateByService(),
      byInstanceType: this.calculateByInstanceType(),
      trends: this.calculateTrends(),
      commitmentImpact: this.calculateCommitmentImpact(),
      esr: this.calculateESR(),
      waste: this.calculateWaste()
    };
  }

  /**
   * Calculate high-level summary metrics (memoized)
   */
  calculateSummary() {
    if (this._summaryCache) return this._summaryCache;

    const current = this.aggregateMetrics(this.currentMonthResources.results);
    const previous = this.aggregateMetrics(this.previousMonthResources.results);

    this._summaryCache = {
      current: {
        onDemand: {
          totalCost: current.public_on_demand_cost,
          costPerVCPUHour: this.safeDivide(current.public_on_demand_cost, current.vcpu_hours),
          costPerUsageHour: this.safeDivide(current.public_on_demand_cost, current.usage_hours),
          costPerGBMonth: this.safeDivide(current.public_on_demand_cost, current.gb_months),
          costPerGBHour: current.byte_hours > 0 ? this.safeDivide(current.public_on_demand_cost, current.byte_hours) : null,
          costPerGBTransferred: current.bytes_transferred > 0 ? this.safeDivide(current.public_on_demand_cost, current.bytes_transferred) : null,
          costPerResource: this.safeDivide(current.public_on_demand_cost, current.resource_identifier_count)
        },
        amortized: {
          totalCost: current.total_amortized_cost,
          costPerVCPUHour: this.safeDivide(current.total_amortized_cost, current.vcpu_hours),
          costPerUsageHour: this.safeDivide(current.total_amortized_cost, current.usage_hours),
          costPerGBMonth: this.safeDivide(current.total_amortized_cost, current.gb_months),
          costPerGBHour: current.byte_hours > 0 ? this.safeDivide(current.total_amortized_cost, current.byte_hours) : null,
          costPerGBTransferred: current.bytes_transferred > 0 ? this.safeDivide(current.total_amortized_cost, current.bytes_transferred) : null,
          costPerResource: this.safeDivide(current.total_amortized_cost, current.resource_identifier_count)
        },
        resources: {
          vcpuHours: current.vcpu_hours,
          usageHours: current.usage_hours,
          gbMonths: current.gb_months,
          gbHours: current.byte_hours,
          gbTransferred: current.bytes_transferred,
          resourceCount: current.resource_identifier_count
        }
      },
      previous: {
        onDemand: {
          totalCost: previous.public_on_demand_cost,
          costPerVCPUHour: this.safeDivide(previous.public_on_demand_cost, previous.vcpu_hours),
          costPerUsageHour: this.safeDivide(previous.public_on_demand_cost, previous.usage_hours),
          costPerGBMonth: this.safeDivide(previous.public_on_demand_cost, previous.gb_months),
          costPerGBHour: previous.byte_hours > 0 ? this.safeDivide(previous.public_on_demand_cost, previous.byte_hours) : null,
          costPerGBTransferred: previous.bytes_transferred > 0 ? this.safeDivide(previous.public_on_demand_cost, previous.bytes_transferred) : null,
          costPerResource: this.safeDivide(previous.public_on_demand_cost, previous.resource_identifier_count)
        },
        amortized: {
          totalCost: previous.total_amortized_cost,
          costPerVCPUHour: this.safeDivide(previous.total_amortized_cost, previous.vcpu_hours),
          costPerUsageHour: this.safeDivide(previous.total_amortized_cost, previous.usage_hours),
          costPerGBMonth: this.safeDivide(previous.total_amortized_cost, previous.gb_months),
          costPerGBHour: previous.byte_hours > 0 ? this.safeDivide(previous.total_amortized_cost, previous.byte_hours) : null,
          costPerGBTransferred: previous.bytes_transferred > 0 ? this.safeDivide(previous.total_amortized_cost, previous.bytes_transferred) : null,
          costPerResource: this.safeDivide(previous.total_amortized_cost, previous.resource_identifier_count)
        },
        resources: {
          vcpuHours: previous.vcpu_hours,
          usageHours: previous.usage_hours,
          gbMonths: previous.gb_months,
          gbHours: previous.byte_hours,
          gbTransferred: previous.bytes_transferred,
          resourceCount: previous.resource_identifier_count
        }
      }
    };

    return this._summaryCache;
  }

  /**
   * Calculate unit economics by account
   */
  calculateByAccount() {
    const currentByAccount = this.groupBy(this.currentMonthResources.results, 'vendor_account_name');
    const previousByAccount = this.groupBy(this.previousMonthResources.results, 'vendor_account_name');

    const accounts = {};

    for (const [account, records] of Object.entries(currentByAccount)) {
      const current = this.aggregateMetrics(records);
      const previous = this.aggregateMetrics(previousByAccount[account] || []);

      accounts[account] = {
        current: {
          onDemand: {
            totalCost: current.public_on_demand_cost,
            costPerVCPUHour: this.safeDivide(current.public_on_demand_cost, current.vcpu_hours),
            costPerUsageHour: this.safeDivide(current.public_on_demand_cost, current.usage_hours)
          },
          amortized: {
            totalCost: current.total_amortized_cost,
            costPerVCPUHour: this.safeDivide(current.total_amortized_cost, current.vcpu_hours),
            costPerUsageHour: this.safeDivide(current.total_amortized_cost, current.usage_hours)
          },
          savings: {
            amount: current.public_on_demand_cost - current.total_amortized_cost,
            percent: this.safeDivide(current.public_on_demand_cost - current.total_amortized_cost, current.public_on_demand_cost) * 100
          }
        },
        previous: {
          onDemand: {
            totalCost: previous.public_on_demand_cost,
            costPerVCPUHour: this.safeDivide(previous.public_on_demand_cost, previous.vcpu_hours),
            costPerUsageHour: this.safeDivide(previous.public_on_demand_cost, previous.usage_hours)
          },
          amortized: {
            totalCost: previous.total_amortized_cost,
            costPerVCPUHour: this.safeDivide(previous.total_amortized_cost, previous.vcpu_hours),
            costPerUsageHour: this.safeDivide(previous.total_amortized_cost, previous.usage_hours)
          }
        },
        trend: {
          onDemandCostChange: this.calculatePercentChange(previous.public_on_demand_cost, current.public_on_demand_cost),
          amortizedCostChange: this.calculatePercentChange(previous.total_amortized_cost, current.total_amortized_cost),
          efficiencyChange: this.calculatePercentChange(
            this.safeDivide(previous.public_on_demand_cost, previous.vcpu_hours),
            this.safeDivide(current.public_on_demand_cost, current.vcpu_hours)
          )
        }
      };
    }

    return accounts;
  }

  /**
   * Calculate unit economics by service
   */
  calculateByService() {
    const currentByService = this.groupBy(this.currentMonthResources.results, 'service_name');
    const previousByService = this.groupBy(this.previousMonthResources.results, 'service_name');

    const services = {};

    for (const [service, records] of Object.entries(currentByService)) {
      const current = this.aggregateMetrics(records);
      const previous = this.aggregateMetrics(previousByService[service] || []);

      services[service] = {
        current: {
          onDemand: {
            totalCost: current.public_on_demand_cost,
            costPerVCPUHour: this.safeDivide(current.public_on_demand_cost, current.vcpu_hours),
            costPerUsageHour: this.safeDivide(current.public_on_demand_cost, current.usage_hours),
            costPerGBMonth: this.safeDivide(current.public_on_demand_cost, current.gb_months)
          },
          amortized: {
            totalCost: current.total_amortized_cost,
            costPerVCPUHour: this.safeDivide(current.total_amortized_cost, current.vcpu_hours),
            costPerUsageHour: this.safeDivide(current.total_amortized_cost, current.usage_hours),
            costPerGBMonth: this.safeDivide(current.total_amortized_cost, current.gb_months)
          },
          savings: {
            amount: current.public_on_demand_cost - current.total_amortized_cost,
            percent: this.safeDivide(current.public_on_demand_cost - current.total_amortized_cost, current.public_on_demand_cost) * 100
          }
        },
        previous: {
          onDemand: {
            totalCost: previous.public_on_demand_cost,
            costPerVCPUHour: this.safeDivide(previous.public_on_demand_cost, previous.vcpu_hours),
            costPerUsageHour: this.safeDivide(previous.public_on_demand_cost, previous.usage_hours)
          },
          amortized: {
            totalCost: previous.total_amortized_cost,
            costPerVCPUHour: this.safeDivide(previous.total_amortized_cost, previous.vcpu_hours),
            costPerUsageHour: this.safeDivide(previous.total_amortized_cost, previous.usage_hours)
          }
        }
      };
    }

    return services;
  }

  /**
   * Calculate unit economics by instance type
   */
  calculateByInstanceType() {
    const currentByType = this.groupBy(this.currentMonthResources.results, 'instance_type');
    const previousByType = this.groupBy(this.previousMonthResources.results, 'instance_type');

    const instanceTypes = {};

    for (const [type, records] of Object.entries(currentByType)) {
      if (!type || type === 'null' || type === 'undefined') continue;

      const current = this.aggregateMetrics(records);
      const previous = this.aggregateMetrics(previousByType[type] || []);

      instanceTypes[type] = {
        current: {
          onDemand: {
            totalCost: current.public_on_demand_cost,
            costPerUsageHour: this.safeDivide(current.public_on_demand_cost, current.usage_hours),
            costPerVCPUHour: this.safeDivide(current.public_on_demand_cost, current.vcpu_hours)
          },
          amortized: {
            totalCost: current.total_amortized_cost,
            costPerUsageHour: this.safeDivide(current.total_amortized_cost, current.usage_hours),
            costPerVCPUHour: this.safeDivide(current.total_amortized_cost, current.vcpu_hours)
          },
          savings: {
            amount: current.public_on_demand_cost - current.total_amortized_cost,
            percent: this.safeDivide(current.public_on_demand_cost - current.total_amortized_cost, current.public_on_demand_cost) * 100
          },
          resources: {
            usageHours: current.usage_hours,
            vcpuHours: current.vcpu_hours,
            resourceCount: current.resource_identifier_count
          }
        },
        previous: {
          onDemand: {
            totalCost: previous.public_on_demand_cost,
            costPerUsageHour: this.safeDivide(previous.public_on_demand_cost, previous.usage_hours)
          },
          amortized: {
            totalCost: previous.total_amortized_cost,
            costPerUsageHour: this.safeDivide(previous.total_amortized_cost, previous.usage_hours)
          }
        }
      };
    }

    return instanceTypes;
  }

  /**
   * Calculate trends and changes (uses memoized summary)
   */
  calculateTrends() {
    const summary = this.calculateSummary();
    const current = summary.current;
    const previous = summary.previous;

    return {
      onDemand: {
        costPerVCPUHourChange: this.calculatePercentChange(
          previous.onDemand.costPerVCPUHour,
          current.onDemand.costPerVCPUHour
        ),
        costPerUsageHourChange: this.calculatePercentChange(
          previous.onDemand.costPerUsageHour,
          current.onDemand.costPerUsageHour
        ),
        costPerGBMonthChange: this.calculatePercentChange(
          previous.onDemand.costPerGBMonth,
          current.onDemand.costPerGBMonth
        ),
        totalCostChange: this.calculatePercentChange(
          previous.onDemand.totalCost,
          current.onDemand.totalCost
        )
      },
      amortized: {
        costPerVCPUHourChange: this.calculatePercentChange(
          previous.amortized.costPerVCPUHour,
          current.amortized.costPerVCPUHour
        ),
        costPerUsageHourChange: this.calculatePercentChange(
          previous.amortized.costPerUsageHour,
          current.amortized.costPerUsageHour
        ),
        costPerGBMonthChange: this.calculatePercentChange(
          previous.amortized.costPerGBMonth,
          current.amortized.costPerGBMonth
        ),
        totalCostChange: this.calculatePercentChange(
          previous.amortized.totalCost,
          current.amortized.totalCost
        )
      },
      efficiency: {
        improving: current.onDemand.costPerVCPUHour < previous.onDemand.costPerVCPUHour,
        degrading: current.onDemand.costPerVCPUHour > previous.onDemand.costPerVCPUHour
      }
    };
  }

  /**
   * Calculate the impact of RI/SP commitments
   */
  calculateCommitmentImpact() {
    const current = this.aggregateMetrics(this.currentMonthResources.results);
    const previous = this.aggregateMetrics(this.previousMonthResources.results);

    const currentSavings = current.public_on_demand_cost - current.total_amortized_cost;
    const previousSavings = previous.public_on_demand_cost - previous.total_amortized_cost;

    const currentSavingsPercent = this.safeDivide(currentSavings, current.public_on_demand_cost) * 100;
    const previousSavingsPercent = this.safeDivide(previousSavings, previous.public_on_demand_cost) * 100;

    return {
      current: {
        onDemandCost: current.public_on_demand_cost,
        amortizedCost: current.total_amortized_cost,
        savings: currentSavings,
        savingsPercent: currentSavingsPercent
      },
      previous: {
        onDemandCost: previous.public_on_demand_cost,
        amortizedCost: previous.total_amortized_cost,
        savings: previousSavings,
        savingsPercent: previousSavingsPercent
      },
      trend: {
        savingsChange: currentSavings - previousSavings,
        savingsPercentChange: currentSavingsPercent - previousSavingsPercent
      },
      message: currentSavings > 0 
        ? `RI/SP commitments are saving $${(currentSavings / 1000).toFixed(1)}K/month (${currentSavingsPercent.toFixed(1)}%)`
        : 'No RI/SP savings detected - consider commitment purchases'
    };
  }

  /**
   * Calculate Effective Savings Rate (ESR)
   * ESR = 1 - (amortized / onDemand) expressed as percentage
   */
  calculateESR() {
    const current = this.aggregateMetrics(this.currentMonthResources.results);
    const previous = this.aggregateMetrics(this.previousMonthResources.results);

    const currentRate = current.public_on_demand_cost > 0
      ? (1 - (current.total_amortized_cost / current.public_on_demand_cost)) * 100
      : 0;
    const previousRate = previous.public_on_demand_cost > 0
      ? (1 - (previous.total_amortized_cost / previous.public_on_demand_cost)) * 100
      : 0;

    const delta = currentRate - previousRate;
    let direction;
    if (delta > 1) direction = 'improving';
    else if (delta < -1) direction = 'degrading';
    else direction = 'stable';

    const percentile = this._esrPercentile(currentRate);
    const target75thRate = 23;
    let targetSavings = 0;
    if (currentRate < target75thRate && current.public_on_demand_cost > 0) {
      targetSavings = (target75thRate - currentRate) / 100 * current.public_on_demand_cost;
    }

    return {
      current: {
        rate: currentRate,
        onDemandTotal: current.public_on_demand_cost,
        amortizedTotal: current.total_amortized_cost,
        savings: current.public_on_demand_cost - current.total_amortized_cost
      },
      previous: {
        rate: previousRate,
        onDemandTotal: previous.public_on_demand_cost,
        amortizedTotal: previous.total_amortized_cost,
        savings: previous.public_on_demand_cost - previous.total_amortized_cost
      },
      trend: { direction, delta },
      percentile,
      targetSavings
    };
  }

  /**
   * Calculate waste estimates from available data
   */
  calculateWaste() {
    const current = this.aggregateMetrics(this.currentMonthResources.results);

    // Rightsizing waste
    const rightsizingAmount = this.rightsizingData.reduce(
      (sum, r) => sum + parseFloat(r.potentialSavings || r.costSavings || 0), 0
    );
    const rightsizingCount = this.rightsizingData.length;

    // Low utilization: instances where cost/vCPU > 2x account average
    const currentByAccount = this.groupBy(this.currentMonthResources.results, 'vendor_account_name');
    let lowUtilAmount = 0;
    let lowUtilCount = 0;

    for (const records of Object.values(currentByAccount)) {
      const agg = this.aggregateMetrics(records);
      const avgCostPerVCPU = this.safeDivide(agg.public_on_demand_cost, agg.vcpu_hours);
      if (avgCostPerVCPU === 0) continue;

      for (const record of records) {
        const cost = parseFloat(record.public_on_demand_cost || 0);
        const vcpu = parseFloat(record.vcpu_hours || 0);
        if (vcpu === 0) continue;
        const recordCostPerVCPU = cost / vcpu;
        if (recordCostPerVCPU > avgCostPerVCPU * 2) {
          lowUtilAmount += cost - (avgCostPerVCPU * vcpu);
          lowUtilCount++;
        }
      }
    }

    // Commitment waste: if ESR is below expected, estimate unused commitment $
    const esr = this.calculateESR();
    let commitmentWaste = 0;
    if (esr.current.rate < 23 && current.total_amortized_cost > 0) {
      // Expected savings at 75th percentile minus actual savings
      const expectedSavings = current.public_on_demand_cost * 0.23;
      const actualSavings = current.public_on_demand_cost - current.total_amortized_cost;
      if (actualSavings < expectedSavings && actualSavings > 0) {
        commitmentWaste = expectedSavings - actualSavings;
      }
    }

    const total = rightsizingAmount + lowUtilAmount + commitmentWaste;
    const totalCost = current.public_on_demand_cost || 1;

    return {
      total,
      categories: [
        {
          name: 'Rightsizing',
          amount: rightsizingAmount,
          count: rightsizingCount,
          percent: this.safeDivide(rightsizingAmount, total) * 100
        },
        {
          name: 'Low Utilization',
          amount: lowUtilAmount,
          count: lowUtilCount,
          percent: this.safeDivide(lowUtilAmount, total) * 100
        },
        {
          name: 'Commitment Waste',
          amount: commitmentWaste,
          percent: this.safeDivide(commitmentWaste, total) * 100
        }
      ],
      industryComparison: {
        yourPercent: this.safeDivide(total, totalCost) * 100,
        industryAvg: 29
      }
    };
  }

  /**
   * Helper: Interpolate ESR percentile from benchmarks
   * 0%=50th, 23%=75th, 40%=90th, 46%=98th
   */
  _esrPercentile(rate) {
    const benchmarks = [
      { rate: 0, percentile: 50 },
      { rate: 23, percentile: 75 },
      { rate: 40, percentile: 90 },
      { rate: 46, percentile: 98 }
    ];

    if (rate <= 0) return 50;
    if (rate >= 46) return 98;

    for (let i = 0; i < benchmarks.length - 1; i++) {
      const low = benchmarks[i];
      const high = benchmarks[i + 1];
      if (rate >= low.rate && rate <= high.rate) {
        const t = (rate - low.rate) / (high.rate - low.rate);
        return low.percentile + t * (high.percentile - low.percentile);
      }
    }
    return 50;
  }

  /**
   * Helper: Aggregate metrics from records
   */
  aggregateMetrics(records) {
    return records.reduce((acc, record) => {
      acc.unblended_cost += parseFloat(record.unblended_cost || 0);
      acc.total_amortized_cost += parseFloat(record.total_amortized_cost || 0);
      acc.public_on_demand_cost += parseFloat(record.public_on_demand_cost || 0);
      acc.vcpu_hours += parseFloat(record.vcpu_hours || 0);
      acc.usage_hours += parseFloat(record.usage_hours || 0);
      acc.gb_months += parseFloat(record.gb_months || 0);
      acc.byte_hours += parseFloat(record.byte_hours || 0);
      acc.bytes_transferred += parseFloat(record.bytes_transferred || 0);
      acc.resource_identifier_count += parseFloat(record.resource_identifier_count || 0);
      return acc;
    }, {
      unblended_cost: 0,
      total_amortized_cost: 0,
      public_on_demand_cost: 0,
      vcpu_hours: 0,
      usage_hours: 0,
      gb_months: 0,
      byte_hours: 0,
      bytes_transferred: 0,
      resource_identifier_count: 0
    });
  }

  /**
   * Helper: Group records by field
   */
  groupBy(records, field) {
    return records.reduce((acc, record) => {
      const key = record[field] || 'Unknown';
      if (!acc[key]) acc[key] = [];
      acc[key].push(record);
      return acc;
    }, {});
  }

  /**
   * Helper: Safe division (avoid divide by zero)
   */
  safeDivide(numerator, denominator) {
    if (!denominator || denominator === 0) return 0;
    return numerator / denominator;
  }

  /**
   * Helper: Calculate percent change
   */
  calculatePercentChange(oldValue, newValue) {
    if (!oldValue || oldValue === 0) return 0;
    return ((newValue - oldValue) / oldValue) * 100;
  }

  /**
   * Get top opportunities for efficiency improvement
   */
  getEfficiencyOpportunities() {
    const byAccount = this.calculateByAccount();
    const opportunities = [];

    for (const [account, data] of Object.entries(byAccount)) {
      const currentEfficiency = data.current.onDemand.costPerVCPUHour;
      const previousEfficiency = data.previous.onDemand.costPerVCPUHour;
      
      if (currentEfficiency > previousEfficiency && previousEfficiency > 0) {
        const degradation = ((currentEfficiency - previousEfficiency) / previousEfficiency) * 100;
        opportunities.push({
          account,
          type: 'efficiency_degradation',
          severity: degradation > 20 ? 'high' : degradation > 10 ? 'medium' : 'low',
          currentCostPerVCPU: currentEfficiency,
          previousCostPerVCPU: previousEfficiency,
          degradationPercent: degradation,
          message: `Cost per vCPU increased ${degradation.toFixed(1)}% - investigate resource utilization`
        });
      }
    }

    return opportunities.sort((a, b) => b.degradationPercent - a.degradationPercent);
  }
}

export default UnitEconomicsCalculator;
