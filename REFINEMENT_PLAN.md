# Executive Dashboard Refinement Plan

**Date:** June 22, 2026  
**Scope:** Full refactor + Phase 2 features  
**Goal:** Transform from raw data display → executive decision engine that POPS

---

## Critical Issues (Fix Immediately)

### 1. 🔴 Security: Exposed API Token
Your opentoken (`01e4ab1c...`) is committed in `src/config.mjs` in a **public repo**. It's live and accessible.

**Action:**
- Rotate the token in Cloudability immediately
- Remove from git history (`git filter-branch` or BFG Repo-Cleaner)
- Switch to `.env` file with `dotenv` (or pure env vars)
- Add `src/config.mjs.example` as template

### 2. 🔴 Chart.js Never Loads
The dashboard references Chart.js but never includes the CDN `<script>` tag. All charts are broken — canvases render empty.

### 3. 🔴 Anomalies Call Broken
`collectAnomalies()` passes `limit: 100` but never passes `viewId` — a required parameter for `cldy_anomalies_list`. This call fails silently.

### 4. 🔴 CI/CD Workflow Can't Run
GitHub Actions workflow references a local MCP server path that doesn't exist in CI. The workflow has never successfully generated a dashboard.

---

## The Vision: What "POP" Means for Executives

Based on extensive research into how C-suite consumes dashboards:

**The 8-Second Rule:** Executives spend ~8 seconds on a dashboard. In those 8 seconds, they must answer:
1. Are we on track? (budget status — single traffic light)
2. Is it getting better or worse? (directional trend)
3. Do I need to act? (exceptions requiring attention)

**What separates this from native Cloudability:**
- Cloudability shows data. We show **verdicts**.
- Cloudability shows costs. We show **cost efficiency relative to business value**.
- Cloudability has 100+ reports. We have **one page that answers the 5 questions the CFO asks**.
- Cloudability is a tool for practitioners. This is a **decision document for leaders**.

---

## Architecture Overhaul

### Current State
```
Config → Data Collector → MCP → Cloudability API
              ↓
         Raw JSON
              ↓
     Unit Economics Calculator
              ↓
     Dashboard Generator (monolithic 500-line HTML template string)
              ↓
     Static HTML file
```

### Target State
```
.env → Config (validated) → Data Collector (with error handling + retry + caching)
                                    ↓
                            [Local JSON Cache]
                                    ↓
                      ┌─────────────┼─────────────┐
                      ↓             ↓             ↓
              Unit Economics   Forecast      Commitment
              Calculator       Engine        Analyzer
                      └─────────────┼─────────────┘
                                    ↓
                        Dashboard Generator
                    (template partials per section)
                                    ↓
                    Executive HTML (dark theme, Chart.js, responsive)
```

---

## Design System

### Color Palette (Dark Theme — professional, charts pop)
```css
--bg:        #0f172a    /* Deep navy background */
--surface:   #1e293b    /* Card surfaces */
--border:    #334155    /* Subtle borders */
--text:      #e2e8f0    /* Primary text */
--muted:     #94a3b8    /* Secondary text */
--accent:    #6366f1    /* Indigo — primary data */
--positive:  #4ade80    /* Green — savings, improvements */
--negative:  #f87171    /* Red — overspend, degradation */
--warning:   #fbbf24    /* Amber — attention needed */
```

### Typography
- Font: Inter (tabular numbers for financial data alignment)
- KPI values: 2.5rem, weight 800
- Labels: 0.75rem, uppercase, letter-spacing 1.5px
- Body: 0.9rem

### KPI Card Anatomy
```
┌──────────────────────────────────┐
│  COST PER vCPU HOUR              │  ← Label (muted, uppercase)
│                                  │
│  $0.0348                         │  ← Primary value (huge, bold)
│  ▼ 3.2% vs last month           │  ← Delta (green = improving)
│                                  │
│  ═══════════════════════         │  ← Sparkline (12-month trend)
│                                  │
│  On-Demand: $0.0425 │ Save: 18% │  ← Context row
└──────────────────────────────────┘
```

### Layout (Z-pattern, no scroll on primary view)
```
┌────────────────────────────────────────────────────────────┐
│ ☁️ Cloud Cost Executive Summary  │  June 2026  │  🟢 ON TRACK  │
├────────────────────────────────────────────────────────────┤
│ [MTD Spend] [Projected] [ESR] [Budget Status] [Savings]    │  ← 5 KPI cards
├────────────────────────────────────────────────────────────┤
│                                                            │
│  12-Month Cost Trend (area chart with budget reference)    │  ← Main viz
│                                                            │
├──────────────────────────┬─────────────────────────────────┤
│  Top 5 Cost Drivers      │  ⚡ Actions Required             │  ← Split bottom
│  (waterfall/bar)         │  • Savings opportunity #1       │
│                          │  • Anomaly alert                │
│                          │  • Expiring commitments         │
└──────────────────────────┴─────────────────────────────────┘
```

---

## Metrics Overhaul: What to Show

### Tier 1 — Hero KPIs (Top of Dashboard, Always Visible)

| Metric | Formula | Why |
|--------|---------|-----|
| **MTD Spend** | Sum of amortized cost this month | "How much have we spent?" |
| **Projected Month-End** | MTD × (days_in_month / days_elapsed) | "Where are we heading?" |
| **Effective Savings Rate (ESR)** | 1 - (Amortized / On-Demand) | "How efficient are our commitments?" — THE master metric |
| **Budget Variance** | (Projected - Budget) / Budget × 100 | "Are we on track?" |
| **Monthly Savings** | On-Demand - Amortized (total) | "How much are commitments saving us?" |

### Tier 2 — Unit Economics (KPIs Tab)

| Metric | Formula | Benchmark |
|--------|---------|-----------|
| **Cost per vCPU Hour** | Amortized Compute / Total vCPU-Hours | $0.02-0.04 with commitments |
| **Cost per Usage Hour** | Amortized / Usage Hours | Varies by workload |
| **Cost per GB Month** | Storage Amortized / GB-Months | $0.02-0.08 typical |
| **Cost per Resource** | Total Amortized / Resource Count | Context-dependent |
| **Cloud COGS %** | Monthly Cloud / Monthly Revenue × 100 | 4.5% SaaS target |

### Tier 3 — Commitment Health (NEW)

| Metric | Formula | Target |
|--------|---------|--------|
| **Coverage Rate** | Commitment-Covered Spend / Eligible Spend | 70-80% |
| **Utilization Rate** | Used Commitment / Total Committed | 95%+ |
| **Waste from Unused** | Committed - Used | $0 ideal |
| **Days to Expiry** | Nearest commitment expiration | Flag < 60 days |

### Tier 4 — Waste Identification (NEW)

| Category | Detection Signal | Industry Benchmark |
|----------|-----------------|-------------------|
| **Idle Compute** | CPU < 10% for 14+ days | 31% of waste |
| **Oversized Resources** | From rightsizing recommendations | 22% of waste |
| **Orphaned Storage** | Unattached volumes/disks | 14% of waste |
| **Schedule Waste** | Non-prod running 24/7 | Dev runs 168hrs but needs ~50 |

---

## New Capabilities to Add

### 1. Native Cloudability Forecasting
**Currently:** Simple linear projection (MTD ÷ days × total_days)  
**Upgrade:** Use `cldy_forecast_get` MCP tool — Cloudability has ML-based forecasting built in.

### 2. Native Budget Integration
**Currently:** Hardcoded $16.2M in config  
**Upgrade:** Use `list_budgets` / `get_budget` MCP tools to pull actual budgets dynamically.

### 3. Current Period Estimate
**Currently:** Manual calculation  
**Upgrade:** Use `cldy_estimate_get` for Cloudability's own month-end estimate.

### 4. Business Dimensions
**Currently:** account + service + instance_type only  
**Upgrade:** Use `list_business_mappings` to get team/product attribution (if configured in Cloudability).

### 5. Commitment Coverage Analysis
**Currently:** Just shows savings amount  
**Upgrade:** Calculate and display coverage rate, utilization rate, waste, break-even analysis.

### 6. Waste Waterfall
**Currently:** Only rightsizing recommendations  
**Upgrade:** Combine rightsizing + idle detection + schedule analysis into a "Total Waste" waterfall chart showing categories and $ amounts.

---

## Actionable Insights Framework

Every insight follows this structure:

```
┌─────────────────────────────────────────────────────────────┐
│ ⚡ WHAT: "3 EC2 instances idle >14 days in us-east-1"       │
│ 💰 IMPACT: "$2,400/month savings (immediate)"               │
│ 🎯 ACTION: "Terminate i-0abc123, i-0def456, i-0ghi789"     │
│ ⏱️  EFFORT: Low (< 1 hour)                                  │
│ 📋 OWNER: DevOps team                                       │
└─────────────────────────────────────────────────────────────┘
```

**Priority ranking (auto-sorted):**
1. High savings + Low effort = **DO NOW** (🔴)
2. High savings + High effort = **PLAN** (🟡)
3. Low savings + Low effort = **AUTOMATE** (🟢)
4. Low savings + High effort = **SKIP** (⚪)

**What we show that Cloudability doesn't:**
- Aggregated savings opportunity in one number ("$47K/month available")
- Effort-ranked prioritization (not just dollar-sorted)
- Natural language explanations ("Your ESR of 18% is at the 65th percentile — the top quartile achieves 23%+")
- Trend verdicts ("Efficiency improving" vs "Efficiency degrading — investigate")
- Cross-metric insights ("Cost per vCPU up 5% but total spend flat → fewer, more expensive instances")

---

## Implementation Plan

### Phase A: Foundation Fix (Do First — ~2 hours)

1. **Security cleanup** — rotate token, switch to .env, add config validation
2. **Add Chart.js CDN** to HTML head
3. **Fix anomalies call** — add viewId parameter (or remove if unavailable)
4. **Add error handling** — try/catch in data collector with graceful degradation
5. **Fix paths** — relative output path, env-based MCP server path
6. **Add dotenv** — `npm install dotenv`

### Phase B: Visual Refactor (Core — ~4 hours)

1. **Dark theme** with the design system above
2. **Proper KPI cards** with sparklines, deltas, context
3. **Working Chart.js visualizations:**
   - 12-month cost trend (area chart with budget reference line)
   - Cost composition (horizontal stacked bar by service)
   - ESR trend (line chart showing savings rate over time)
   - Waste breakdown (doughnut or waterfall)
4. **Traffic light status** in header (🟢🟡🔴 based on budget variance thresholds)
5. **Responsive CSS Grid** layout
6. **Print/light mode** via `@media print`

### Phase C: New Data Sources (~3 hours)

1. **Integrate `cldy_forecast_get`** for ML-based projections
2. **Integrate `list_budgets`** to replace hardcoded budget
3. **Integrate `cldy_estimate_get`** for current period estimate
4. **Add commitment coverage calculation** from existing data (On-Demand vs Amortized ratio by service shows coverage)
5. **Calculate waste categories** from rightsizing data + utilization patterns

### Phase D: Actionable Intelligence Layer (~3 hours)

1. **Insight engine** — rules-based system that generates prioritized recommendations:
   - ESR < 20%? → "Purchase commitments for top 5 instance types"
   - Cost per vCPU trending up? → "Investigate utilization in [account]"
   - Anomaly detected? → "Review [service] in [account] — $X unexpected"
   - Commitments expiring? → "Renew [X] commitments within 60 days"
2. **Natural language summaries** at the top of each section
3. **Benchmarking context** — show where you stand vs industry:
   - ESR percentile (median is 0%, 75th is 23%, 90th is 40%)
   - Waste % vs industry average (29%)
4. **Executive "TL;DR" section** — 3-sentence summary of the entire dashboard state

### Phase E: Polish & Deploy (~2 hours)

1. **Fix CI/CD** — update actions to v4, add MCP server install step
2. **GitHub Pages deployment** — auto-publish on generation
3. **PDF export button** in dashboard (window.print() with print styles)
4. **Data freshness indicator** — "Data as of: June 22, 2026 8:00 AM"
5. **Tab persistence** — remember last viewed tab in localStorage
6. **Loading skeleton** — visible while charts render

---

## ESR Deep Dive (The Star Metric)

This is the single most powerful metric for your dashboard. Here's why:

**Formula:**
```
ESR = 1 - (Total Amortized Cost / Total On-Demand Equivalent Cost)
```

**What it tells executives in one number:**
- ESR of 0% = "We're paying full price for everything"
- ESR of 18% = "Our commitments save us 18 cents on every dollar"
- ESR of 40% = "We're world-class at commitment management"

**Benchmarks (ProsperOps data, thousands of AWS orgs):**
- 50th percentile: 0% (half of orgs use zero commitments!)
- 75th percentile: 23%
- 90th percentile: ~40%
- 98th percentile: 46%

**Your current ESR (from README):** ~18.5% — that puts you around the 70th percentile. Above average but significant room for improvement.

**Dashboard presentation:**
```
┌──────────────────────────────────────────────────┐
│  EFFECTIVE SAVINGS RATE                          │
│                                                  │
│  18.5%                                          │
│  ████████████████████░░░░░░░░░░░░  (target: 30%) │
│                                                  │
│  You're at the 70th percentile.                  │
│  Reaching 30% would save an additional $15K/mo.  │
│  Coverage: 62% │ Utilization: 94%                │
└──────────────────────────────────────────────────┘
```

---

## Cost Per vCPU: The Right Way

**FinOps Foundation official formula:**
```
Effective Avg Cost per vCPU = (Amortized Cost + Unused Commitment Cost) / Total vCPU-Hours
```

**What you're doing now:** `total_amortized_cost / vcpu_hours` — close but missing unused commitment allocation.

**What to add:**
1. Show BOTH on-demand and amortized (you already do this ✅)
2. Add trendline showing 12-month trajectory
3. Add benchmark ranges: "$0.02-0.04 with commitments is typical"
4. Flag instance families where cost/vCPU is abnormally high
5. Break out by environment (prod vs dev) — prod should be lower (more commitments)

**Key insight to surface:** If cost/vCPU is rising while total spend is flat, it means fewer instances running at higher cost each — likely rightsizing opportunities going unaddressed, or commitment waste.

---

## What Makes This BETTER Than Cloudability Native

| Cloudability Native | Your Dashboard |
|--------------------|----------------|
| Shows cost data in tables/charts | Shows **verdicts** ("You're 70th percentile for savings") |
| Requires navigation across 10+ screens | **One page** answers the 5 executive questions |
| Shows current state only | Shows **trajectory** (improving/degrading) with context |
| No effort-ranked recommendations | **Prioritized by ROI** (savings × probability ÷ effort) |
| Separate tools for different analyses | **Unified view** combining cost + efficiency + waste + forecast |
| Designed for practitioners | **Designed for CFO/CTO** (8-second comprehension) |
| Shows all data equally | **Exception-based** (only surfaces what needs attention) |
| No benchmarking | **Industry context** (percentile rankings, "good" thresholds) |
| Static thresholds | **Dynamic thresholds** based on your own history |

---

## Specific Chart.js Configurations

### 1. Cost Trend (Main Visualization)
- **Type:** Line with area fill (gradient from accent to transparent)
- **Lines:** Amortized (solid), On-Demand (dashed), Budget (red reference line)
- **X-axis:** Last 12 months
- **Y-axis:** Dollar values with K/M formatting
- **Interaction:** Hover shows all three values + savings %

### 2. ESR Trend
- **Type:** Line chart
- **Fill:** Gradient below line (green tint)
- **Reference lines:** 23% (75th percentile), 40% (90th percentile)
- **Annotation:** "You are here" marker at current month

### 3. Cost Composition
- **Type:** Horizontal stacked bar (easier to read service names)
- **Categories:** Top 5 services + "Other"
- **Comparison:** Current month vs previous month (grouped)

### 4. Waste Breakdown
- **Type:** Doughnut chart with center text showing total waste $
- **Segments:** Idle, Oversized, Orphaned, Schedule, Other
- **Colors:** Red spectrum (darker = larger waste)

### 5. Sparklines (in KPI cards)
- **Type:** Line, no axes, no labels, no legend
- **Data:** Last 12 monthly data points
- **Size:** 120px × 40px
- **Color:** Match the card's sentiment (green if improving, red if degrading)

---

## File Changes Summary

| File | Action |
|------|--------|
| `src/config.mjs` | Replace with env-var-only version + validation |
| `src/config.mjs.example` | NEW — template for developers |
| `.env.example` | NEW — env var template |
| `src/data-collector.mjs` | Add error handling, retry, new MCP tools, caching |
| `src/unit-economics.mjs` | Fix bugs, add ESR calculation, add waste analysis |
| `src/dashboard-generator.mjs` | Complete rewrite — dark theme, Chart.js, partials |
| `src/insight-engine.mjs` | NEW — generates prioritized actionable recommendations |
| `src/commitment-analyzer.mjs` | NEW — coverage, utilization, break-even analysis |
| `.github/workflows/generate.yml` | Fix: update actions, add MCP setup, add Pages deploy |
| `package.json` | Add dotenv, add engines, fix license, add scripts |
| `.gitignore` | Fix config tracking, add comprehensive patterns |
| `test-dashboard.sh` | Add real validation, timing, config check |

---

## Success Criteria

When we're done, the dashboard should:

1. ✅ Load in a browser with zero errors (charts render, data displays)
2. ✅ Answer "are we on track?" in under 3 seconds (traffic light + budget variance)
3. ✅ Show ESR with percentile benchmark context
4. ✅ Show cost per vCPU trending over 12 months with benchmark ranges
5. ✅ Surface the top 3 savings opportunities ranked by ROI
6. ✅ Look professional on a dark theme (CFO presentation ready)
7. ✅ Work on iPad/tablet (responsive grid)
8. ✅ Generate without errors from CI/CD
9. ✅ Use native Cloudability forecasting instead of linear projection
10. ✅ Pull budget dynamically instead of hardcoding

---

## Ready to Execute?

I recommend we start with **Phase A (Foundation Fix)** immediately since it fixes broken things, then move straight into **Phase B (Visual Refactor)** which is where the "POP" comes from. Phases C-E layer on the intelligence.

Want me to start implementing?
