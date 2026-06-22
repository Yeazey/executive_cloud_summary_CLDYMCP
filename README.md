# Cloudability Executive Dashboard

A comprehensive cloud cost analytics dashboard that provides executives with actionable insights into cloud spending, efficiency metrics, and optimization opportunities.

## 🎯 Features

### 📊 KPIs Dashboard
- **Correct RI/SP Savings Calculations**: Shows On-Demand cost vs Amortized cost with accurate savings percentages
- **Technical Unit Economics**: Cost per vCPU hour, usage hour, GB month, and resource
- **Efficiency Trends**: Month-over-month comparisons with improvement indicators
- **Account/Service/Instance Breakdown**: Detailed cost analysis by dimension

### 💡 Immediate Action Insights
Every dashboard page includes context-aware recommendations:
- **What the data means** - Executive-friendly explanations
- **Why it matters** - Business impact analysis
- **What to do next** - Specific, actionable steps with timelines

### 📈 Additional Tabs
- **Overview**: High-level spending summary with budget alerts
- **Optimization**: Rightsizing recommendations with savings potential
- **Anomalies**: Unusual spending pattern detection
- **Forecast**: Projected spending trends

## 🚀 Quick Start

### Prerequisites
- Node.js v18+ (tested with v24.17.0)
- Cloudability API access with valid token
- Cloudability MCP Server installed

### Installation

1. **Clone the repository**
```bash
git clone https://github.com/Yeazey/executive_cloud_summary_CLDYMCP.git
cd executive_cloud_summary_CLDYMCP
```

2. **Install dependencies**
```bash
npm install
```

3. **Configure Cloudability credentials**

Create or update `src/config.mjs`:
```javascript
export const CLOUDABILITY_CONFIG = {
  AUTH_METHOD: 'opentoken',
  OPENTOKEN: process.env.CLOUDABILITY_OPENTOKEN || 'your-token-here',
  ENVIRONMENT_ID: process.env.CLOUDABILITY_ENVIRONMENT_ID || 'your-env-id',
  REGION: 'us',
  MCP_SERVER_PATH: process.env.CLOUDABILITY_MCP_PATH || '/path/to/cldy-mcp-server-main'
};
```

**Recommended**: Use environment variables instead of hardcoding:
```bash
export CLOUDABILITY_OPENTOKEN="your-token-here"
export CLOUDABILITY_ENVIRONMENT_ID="your-environment-id"
export CLOUDABILITY_MCP_PATH="/path/to/cldy-mcp-server-main"
```

4. **Generate the dashboard**
```bash
npm run generate
```

The dashboard will automatically open in your browser at:
`output/executive_dashboard.html`

## 📁 Project Structure

```
cloudability-executive-dashboard/
├── src/
│   ├── config.mjs                 # Configuration (excluded from git)
│   ├── data-collector.mjs         # Cloudability API data collection
│   ├── unit-economics.mjs         # KPI calculations and analysis
│   ├── dashboard-generator.mjs    # HTML dashboard generation
│   └── test-dashboard.sh          # Test script
├── output/
│   └── executive_dashboard.html   # Generated dashboard (gitignored)
├── DASHBOARD_IMPROVEMENT_PLAN.md  # Comprehensive roadmap (1,308 lines)
├── UNIT_ECONOMICS_DASHBOARD_MOCKUP.md  # Design mockup
├── package.json
└── README.md
```

## 🔧 Key Components

### Data Collector (`src/data-collector.mjs`)
Fetches data from Cloudability API:
- Current and previous month costs
- 12 months historical data
- Resource metrics (vCPU, memory, storage, usage)
- Rightsizing recommendations
- Anomaly detection

**Key Metrics Collected:**
- `public_on_demand_cost` - Baseline cost without commitments
- `total_amortized_cost` - Actual cost with RI/SP discounts
- `vcpu_hours`, `usage_hours`, `gb_months` - Resource utilization
- `resource_identifier_count` - Resource inventory

### Unit Economics Calculator (`src/unit-economics.mjs`)
Calculates 6 key technical metrics:
1. **Cost per vCPU Hour** - Compute efficiency
2. **Cost per Usage Hour** - Resource utilization efficiency
3. **Cost per GB Month** - Storage cost efficiency
4. **Cost per GB Hour** - Memory cost efficiency
5. **Cost per GB Transferred** - Network cost efficiency
6. **Cost per Resource** - Average resource cost

Each metric calculated for:
- **On-Demand** (what you'd pay without commitments)
- **Amortized** (actual spend with RI/SP discounts)
- **Savings** (On-Demand - Amortized)

### Dashboard Generator (`src/dashboard-generator.mjs`)
Creates interactive HTML dashboard with:
- Responsive design
- Chart.js visualizations
- Tab-based navigation
- Color-coded alerts and badges
- Immediate action sections

## 💰 Understanding RI/SP Savings

### Correct Calculation
```
On-Demand Cost: $244.5K  (what you'd pay without commitments)
         ↓
Amortized Cost: $199.3K  (actual spend with RI/SP)
         ↓
Savings: $45.2K (18.5%)
```

### Why This Matters
- **On-Demand** = Baseline for comparison (public pricing)
- **Amortized** = Your actual cost (with discounts applied)
- **Savings %** = How much RI/SP commitments are saving you

## 📊 Dashboard Pages

### 1. Overview
- Current month spend (MTD)
- Projected monthly spend
- YTD spend vs budget
- Top 5 accounts by spend
- Budget variance alerts

### 2. KPIs
- RI/SP commitment savings hero section
- 4 key metric cards (On-Demand vs Amortized)
- Account-level efficiency breakdown
- Service-level cost analysis
- Instance type optimization opportunities

### 3. Optimization
- Rightsizing recommendations
- Potential monthly savings
- Resource-specific suggestions
- Implementation priority guidance

### 4. Anomalies
- 90-day anomaly detection
- Cost spike identification
- Investigation workflow
- Root cause analysis steps

## 🔐 Security Notes

### Protected Files (Not in Git)
- `src/config.mjs` - Contains API credentials
- `output/` - Generated dashboards may contain sensitive data
- `.env` - Environment variables

### Safe to Share
- All source code in `src/` (except `config.mjs`)
- Documentation files
- Package configuration

## 🛠️ Development

### Running Tests
```bash
./test-dashboard.sh
```

### Regenerating Dashboard
```bash
npm run generate
```

### Modifying Calculations
Edit `src/unit-economics.mjs` to adjust:
- Metric calculations
- Trend analysis
- Efficiency thresholds
- Savings calculations

### Customizing Visualizations
Edit `src/dashboard-generator.mjs` to modify:
- Chart types and colors
- Table layouts
- Alert thresholds
- Action recommendations

## 📈 Roadmap

See `DASHBOARD_IMPROVEMENT_PLAN.md` for comprehensive 16-week implementation plan covering:
- **Phase 1** (Weeks 1-4): Technical Unit Economics ✅ COMPLETE
- **Phase 2** (Weeks 5-8): Waste Identification & Commitment Optimization
- **Phase 3** (Weeks 9-12): Benchmarking & Multi-Persona Views
- **Phase 4** (Weeks 13-16): Business Unit Economics & Advanced Analytics

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'feat: Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

This project is proprietary and confidential.

## 🆘 Support

For issues or questions:
1. Check `DASHBOARD_IMPROVEMENT_PLAN.md` for detailed documentation
2. Review `UNIT_ECONOMICS_DASHBOARD_MOCKUP.md` for design reference
3. Contact the development team

## 🎯 Success Metrics

Dashboard provides answers to key executive questions:
- ✅ "What does it cost per vCPU hour?" - $0.0348 amortized
- ✅ "How much are we saving from RI/SP?" - $45K/month (18.5%)
- ✅ "Is our efficiency improving?" - Yes, cost per vCPU down 3.2% MoM
- ✅ "Which accounts need RI/SP coverage?" - Development-AWS (0% coverage)
- ✅ "What's the impact of our commitments?" - Saving 18% across all resources

---

**Built with ❤️ for cloud cost optimization**