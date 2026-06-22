# Unit Economics Dashboard - Design Mockup

## 📊 New Dashboard Tab: "Unit Economics"

This will be added as a new tab alongside Overview, Optimization, Anomalies, and Forecast.

---

## Layout Structure

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Navigation Tabs                                                         │
│  [Overview] [Unit Economics] [Optimization] [Anomalies] [Forecast]     │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│  HERO SECTION: Commitment Impact (Prominent Display)                    │
│                                                                          │
│  💰 RI/SP Savings This Month                                            │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │  $45.2K saved (18.5%)                                            │  │
│  │  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │  │
│  │  Unblended: $244.5K  →  Amortized: $199.3K                      │  │
│  │  Trend: ↑ $3.2K vs last month                                   │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│  KPI CARDS: Key Unit Economics Metrics                                  │
│                                                                          │
│  ┌──────────────┬──────────────┬──────────────┬──────────────┐         │
│  │ Cost/vCPU Hr │ Cost/Usage Hr│ Cost/GB Month│ Cost/Resource│         │
│  │              │              │              │              │         │
│  │ Unblended:   │ Unblended:   │ Unblended:   │ Unblended:   │         │
│  │ $0.0425      │ $0.0312      │ $0.0089      │ $12.45       │         │
│  │ ↓ 3.2% MoM   │ ↑ 1.5% MoM   │ → 0.2% MoM   │ ↓ 5.1% MoM   │         │
│  │              │              │              │              │         │
│  │ Amortized:   │ Amortized:   │ Amortized:   │ Amortized:   │         │
│  │ $0.0348      │ $0.0255      │ $0.0073      │ $10.18       │         │
│  │ ↓ 4.1% MoM   │ ↑ 0.8% MoM   │ ↓ 0.5% MoM   │ ↓ 6.2% MoM   │         │
│  │              │              │              │              │         │
│  │ RI/SP Impact:│ RI/SP Impact:│ RI/SP Impact:│ RI/SP Impact:│         │
│  │ -18.1%       │ -18.3%       │ -18.0%       │ -18.2%       │         │
│  └──────────────┴──────────────┴──────────────┴──────────────┘         │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│  CHART 1: Unit Cost Trends (12-Month View)                              │
│                                                                          │
│  Cost per vCPU Hour Over Time                                           │
│  $0.050 ┤                                                               │
│         │     ╱╲                                                        │
│  $0.045 │    ╱  ╲___                                                    │
│         │   ╱       ╲___                                                │
│  $0.040 │  ╱            ╲___                                            │
│         │ ╱                 ╲___                                        │
│  $0.035 │╱                      ╲___                                    │
│         └─────────────────────────────────────────────────────────────  │
│          J  F  M  A  M  J  J  A  S  O  N  D                            │
│                                                                          │
│  Legend: ━━━ Unblended  ━ ━ Amortized  ┄┄┄ Target ($0.038)            │
│                                                                          │
│  Annotations:                                                            │
│  • March: New workload launch (spike)                                   │
│  • June: Optimization implemented (drop)                                │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│  SECTION: Unit Economics by Account (Top 5)                             │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │ Account Name          │ Cost/vCPU Hr │ Cost/Usage Hr │ Trend       │ │
│  ├────────────────────────────────────────────────────────────────────┤ │
│  │ Production-AWS-East   │              │               │             │ │
│  │   Unblended:          │ $0.0445      │ $0.0325       │ ↓ 2.1%     │ │
│  │   Amortized:          │ $0.0365      │ $0.0266       │ ↓ 3.5%     │ │
│  │   RI/SP Savings:      │ -18.0%       │ -18.2%        │             │ │
│  ├────────────────────────────────────────────────────────────────────┤ │
│  │ Production-AWS-West   │              │               │             │ │
│  │   Unblended:          │ $0.0412      │ $0.0298       │ ↑ 1.8%     │ │
│  │   Amortized:          │ $0.0338      │ $0.0244       │ ↑ 0.5%     │ │
│  │   RI/SP Savings:      │ -18.0%       │ -18.1%        │             │ │
│  ├────────────────────────────────────────────────────────────────────┤ │
│  │ Development-AWS       │              │               │             │ │
│  │   Unblended:          │ $0.0389      │ $0.0285       │ → 0.3%     │ │
│  │   Amortized:          │ $0.0389      │ $0.0285       │ → 0.3%     │ │
│  │   RI/SP Savings:      │ 0.0%         │ 0.0%          │ ⚠️ No RIs  │ │
│  └────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│  SECTION: Unit Economics by Service (Top 5)                             │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │ Service Name    │ Cost/vCPU Hr │ Cost/GB Month │ Efficiency       │ │
│  ├────────────────────────────────────────────────────────────────────┤ │
│  │ EC2             │              │               │                  │ │
│  │   Unblended:    │ $0.0425      │ N/A           │ ↓ 3.2% (Good)   │ │
│  │   Amortized:    │ $0.0348      │ N/A           │ ↓ 4.1% (Good)   │ │
│  ├────────────────────────────────────────────────────────────────────┤ │
│  │ RDS             │              │               │                  │ │
│  │   Unblended:    │ $0.0512      │ N/A           │ ↑ 2.5% (Bad)    │ │
│  │   Amortized:    │ $0.0419      │ N/A           │ ↑ 1.2% (Bad)    │ │
│  ├────────────────────────────────────────────────────────────────────┤ │
│  │ S3              │              │               │                  │ │
│  │   Unblended:    │ N/A          │ $0.0089       │ → 0.1% (Stable) │ │
│  │   Amortized:    │ N/A          │ $0.0089       │ → 0.1% (Stable) │ │
│  └────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│  CHART 2: Commitment Impact Visualization                               │
│                                                                          │
│  Monthly Savings from RI/SP Commitments                                 │
│                                                                          │
│  $50K ┤                                                                 │
│       │     ┌─────┐                                                     │
│  $40K │     │█████│ ┌─────┐                                            │
│       │     │█████│ │█████│ ┌─────┐                                    │
│  $30K │ ┌───┤█████│ │█████│ │█████│                                    │
│       │ │███│█████│ │█████│ │█████│                                    │
│  $20K │ │███│█████│ │█████│ │█████│                                    │
│       │ │███│█████│ │█████│ │█████│                                    │
│  $10K │ │███│█████│ │█████│ │█████│                                    │
│       └─┴───┴─────┴─┴─────┴─┴─────┴─────────────────────────────────  │
│         Mar   Apr     May     Jun                                       │
│                                                                          │
│  Trend: Savings increasing by $3.2K/month (7.6%)                       │
│  Action: Consider additional RI/SP purchases for 25% more savings      │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│  ALERT SECTION: Efficiency Opportunities                                │
│                                                                          │
│  ⚠️  3 Accounts with Degrading Efficiency                               │
│                                                                          │
│  1. Development-AWS: Cost/vCPU increased 12.5% MoM                      │
│     → Action: No RI/SP coverage - consider commitments                  │
│     → Potential Savings: $8.5K/month                                    │
│                                                                          │
│  2. Production-Azure: Cost/Usage Hr increased 8.2% MoM                  │
│     → Action: Investigate resource utilization                          │
│     → Potential Savings: $5.2K/month                                    │
│                                                                          │
│  3. Staging-GCP: Cost/GB Month increased 15.1% MoM                      │
│     → Action: Review storage tier optimization                          │
│     → Potential Savings: $3.1K/month                                    │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│  SECTION: Instance Type Efficiency Analysis                             │
│                                                                          │
│  Top 10 Instance Types by Cost                                          │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │ Instance Type │ Cost/Hr (Unbl) │ Cost/Hr (Amort) │ RI/SP Impact   │ │
│  ├────────────────────────────────────────────────────────────────────┤ │
│  │ m5.2xlarge    │ $0.384         │ $0.314          │ -18.2% ✅      │ │
│  │ r5.xlarge     │ $0.252         │ $0.206          │ -18.3% ✅      │ │
│  │ t3.medium     │ $0.0416        │ $0.0416         │ 0.0% ⚠️       │ │
│  │ c5.large      │ $0.085         │ $0.070          │ -17.6% ✅      │ │
│  │ m5.xlarge     │ $0.192         │ $0.157          │ -18.2% ✅      │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│  💡 Insight: t3.medium has no RI/SP coverage - $2.3K/month opportunity  │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Key Features of This Design:

### 1. **Dual Metric Display** (Unblended + Amortized)
- Every metric shows BOTH unblended (actual) and amortized (with RI/SP)
- Clear visual distinction between the two
- RI/SP impact percentage prominently displayed

### 2. **Commitment Impact Hero Section**
- Large, prominent display of RI/SP savings
- Shows dollar amount and percentage
- Trend comparison vs previous month
- Visual progress bar

### 3. **Color Coding**
- 🟢 Green: Efficiency improving (costs decreasing)
- 🔴 Red: Efficiency degrading (costs increasing)
- 🟡 Yellow: Stable or minor changes
- ⚠️ Warning: No RI/SP coverage (opportunity)

### 4. **Actionable Insights**
- Alert section highlights efficiency degradation
- Specific recommendations with $ impact
- Identifies accounts without RI/SP coverage

### 5. **Trend Analysis**
- 12-month historical view
- Annotations for major events
- Target lines for goals
- MoM comparison for all metrics

### 6. **Multi-Level Breakdown**
- Summary (overall)
- By Account (top 5)
- By Service (top 5)
- By Instance Type (top 10)

---

## Technical Implementation Notes:

### Chart.js Visualizations:
1. **Line Chart**: Unit cost trends over time (dual lines for unblended/amortized)
2. **Bar Chart**: Monthly RI/SP savings
3. **Sparklines**: Mini trend indicators in KPI cards

### Interactive Features:
- Click KPI cards to drill down
- Hover over charts for detailed tooltips
- Click account/service names to see full breakdown
- Export data to CSV

### Mobile Responsive:
- KPI cards stack vertically on mobile
- Charts resize appropriately
- Tables scroll horizontally if needed

---

## Data Requirements:

All data comes from the new `UnitEconomicsCalculator`:
- `calculateSummary()` → Hero section + KPI cards
- `calculateByAccount()` → Account breakdown table
- `calculateByService()` → Service breakdown table
- `calculateByInstanceType()` → Instance type analysis
- `calculateTrends()` → Trend charts
- `calculateCommitmentImpact()` → RI/SP savings section
- `getEfficiencyOpportunities()` → Alert section

---

## Next Steps:

1. Implement this design in `dashboard-generator.mjs`
2. Add Chart.js configurations for new visualizations
3. Style with CSS matching existing dashboard theme
4. Test with real Cloudability data
5. Iterate based on feedback

**Ready to implement this design?**
