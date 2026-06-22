# Cloudability Executive Dashboard

Automated cloud cost executive dashboard generator using Cloudability MCP Server.

## Features

- 📊 6-page interactive HTML dashboard
- 📈 Real-time cost tracking and forecasting
- 🤖 AI/ML spending analysis
- ⚡ Optimization recommendations by app and maturity
- 🚨 Anomaly detection and tracking
- 📅 Monthly trends and YoY comparisons

## Quick Start

```bash
npm install
npm run generate
```

## Usage with Bob Shell

Use the custom `/executive` command:

```bash
/executive
```

This will automatically:
1. Fetch latest Cloudability data
2. Generate comprehensive executive dashboard
3. Open in your default browser

## Project Structure

```
cloudability-executive-dashboard/
├── src/
│   ├── data-collector.mjs      # Cloudability API data collection
│   ├── dashboard-generator.mjs  # HTML dashboard generation
│   └── config.mjs               # Configuration and constants
├── templates/
│   └── dashboard.html           # Dashboard HTML template
├── output/
│   └── executive_dashboard.html # Generated dashboard
├── .bob/
│   └── skills/
│       └── executive.md         # Bob Shell custom skill
└── package.json
```

## Configuration

Set your Cloudability credentials in environment variables:

```bash
export CLOUDABILITY_OPENTOKEN="your-token"
export CLOUDABILITY_ENVIRONMENT_ID="your-env-id"
```

## Generated Dashboard Sections

1. **Overview** - Current month KPIs and alerts
2. **Monthly Trends** - Historical comparison
3. **Forecast & Budget** - Year-end projections
4. **AI Spending** - AI/ML cost breakdown
5. **Optimization** - Savings opportunities
6. **Anomalies** - Cost spike detection

## License

MIT
