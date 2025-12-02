# DS4200 — Linking Corporate Fundamentals to Market Behavior

This site connects **SEC EDGAR filings** (10-K / 10-Q / 8-K) with **Yahoo Finance** market behavior (price + volume) from **2019–2025**.

## Run locally
Because the site loads CSV files, you need a local server (double-clicking `index.html` may block file loading):

```bash
python -m http.server 8000
```

Open: `http://localhost:8000`

## GitHub Pages
1. Push this repo to GitHub
2. Repo → Settings → Pages
3. Source: Deploy from a branch → `main` → `/ (root)`

## Data files (in `/data`)
- `companies_summary.csv` — one row per company (return/volatility/sector)
- `prices_long.csv` — daily price + volume per company (2019–2025)
- Optional: `filings.csv` — filing markers (ticker,filed_date,form,title,url)

## Interaction types (rubric)
- Hover tooltips
- Dropdown filtering
- Click-to-select (linked views)
- Brush + year slider (time zoom)