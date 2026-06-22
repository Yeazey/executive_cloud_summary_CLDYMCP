---
name: executive
description: Generate comprehensive Cloudability executive dashboard
---

# Executive Dashboard Generator

Generates a complete executive dashboard for cloud costs using Cloudability data.

## Usage

```
/executive
```

## What it does

1. Collects data from Cloudability MCP server:
   - Current month spend (MTD)
   - Previous month spend
   - Year-to-date trends
   - AI/ML spending breakdown
   - Rightsizing recommendations
   - Cost anomalies (90 days)

2. Generates interactive HTML dashboard with:
   - 6 navigable pages
   - 15+ interactive charts
   - KPI cards with trend indicators
   - Optimization recommendations by app and maturity
   - Anomaly tracking and alerts
   - Year-end forecast projections

3. Opens dashboard in default browser

## Output

Dashboard saved to: `~/cloudability-executive-dashboard/output/executive_dashboard.html`

## Requirements

- Cloudability MCP server configured
- Environment variables set:
  - CLOUDABILITY_OPENTOKEN
  - CLOUDABILITY_ENVIRONMENT_ID
