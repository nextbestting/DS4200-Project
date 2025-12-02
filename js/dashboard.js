// js/dashboard.js
(() => {
  const fmtPct = d3.format("+.2%");
  const fmtNum = d3.format(",.0f");
  const fmt3 = d3.format(".3f");

  function annualizedReturn(muDaily) {
    if (muDaily == null || !isFinite(muDaily)) return null;
    return Math.pow(1 + muDaily, 252) - 1;
  }
  function annualizedVol(sdDaily) {
    if (sdDaily == null || !isFinite(sdDaily)) return null;
    return sdDaily * Math.sqrt(252);
  }

  function niceSectorName(s) {
    if (!s) return "Unknown";
    // normalize a few common variants
    const x = String(s).trim();
    if (x.toLowerCase() === "finance") return "Financials";
    return x;
  }

  window.DS4200_Dashboard = function DS4200_Dashboard(opts) {
    const el = typeof opts.el === "string" ? document.querySelector(opts.el) : opts.el;
    const dataUrl = opts.dataUrl;
    const onSelect = opts.onSelect;

    const tooltip = d3.select("#tooltip");
    const sectorFilter = d3.select("#sectorFilter");
    const companySelect = d3.select("#companySelect");
    const resetBtn = d3.select("#resetSelection");

    let raw = [];
    let selectedTicker = null;

    // Responsive sizing
    const margin = { top: 18, right: 16, bottom: 56, left: 66 };
    const height = 520;

    const svg = d3.select(el).append("svg");
    const g = svg.append("g");

    const gGrid = g.append("g").attr("class", "grid");
    const gDots = g.append("g").attr("class", "dots");
    const gAxes = g.append("g").attr("class", "axes");

    const x = d3.scaleLinear();
    const y = d3.scaleLinear();
    const r = d3.scaleSqrt().range([5, 16]);
    const color = d3.scaleOrdinal().range(d3.schemeTableau10);

    const xAxisG = gAxes.append("g").attr("class", "xAxis");
    const yAxisG = gAxes.append("g").attr("class", "yAxis");

    const xLabel = g.append("text")
      .attr("fill", "currentColor")
      .attr("text-anchor", "middle")
      .style("font-size", 12);

    const yLabel = g.append("text")
      .attr("fill", "currentColor")
      .attr("text-anchor", "middle")
      .style("font-size", 12);

    const legendG = svg.append("g").attr("class", "legend");

    function showTooltip(event, d) {
      const muA = annualizedReturn(d.avg_return);
      const volA = annualizedVol(d.volatility);

      tooltip
        .style("opacity", 1)
        .html(`
          <div style="font-weight:800;margin-bottom:4px">${d.ticker}</div>
          <div><span style="color:#a7b1c6">Sector:</span> ${d.sector}</div>
          <div><span style="color:#a7b1c6">Avg daily return:</span> ${fmtPct(d.avg_return)}</div>
          <div><span style="color:#a7b1c6">Daily volatility:</span> ${fmtPct(d.volatility)}</div>
          <hr style="border:none;border-top:1px solid rgba(255,255,255,.1);margin:8px 0">
          <div><span style="color:#a7b1c6">Annualized return (approx):</span> ${muA == null ? "—" : fmtPct(muA)}</div>
          <div><span style="color:#a7b1c6">Annualized volatility (approx):</span> ${volA == null ? "—" : fmtPct(volA)}</div>
          <div><span style="color:#a7b1c6">Avg volume:</span> ${d.avg_volume == null ? "—" : fmtNum(d.avg_volume)}</div>
          <div><span style="color:#a7b1c6">Days:</span> ${d.n_days == null ? "—" : fmtNum(d.n_days)}</div>
          <div style="margin-top:6px;color:#a7b1c6">Click to select and update timeline ↘</div>
        `);

      tooltip
        .style("left", `${event.pageX + 14}px`)
        .style("top", `${event.pageY + 14}px`);
    }
    function hideTooltip() {
      tooltip.style("opacity", 0);
    }

    function updateDropdowns(data) {
      const sectors = Array.from(new Set(raw.map(d => d.sector))).sort(d3.ascending);

      sectorFilter
        .selectAll("option")
        .data(["All", ...sectors])
        .join("option")
        .attr("value", d => d)
        .text(d => d);

      const tickers = data.map(d => d.ticker).sort(d3.ascending);
      companySelect
        .selectAll("option")
        .data(["All Companies", ...tickers])
        .join("option")
        .attr("value", d => d)
        .text(d => d);
    }

    function getFiltered() {
      const sector = sectorFilter.property("value");
      const ticker = companySelect.property("value");

      let out = raw;
      if (sector && sector !== "All") out = out.filter(d => d.sector === sector);

      // keep company dropdown synced to sector filter
      const tickers = out.map(d => d.ticker).sort(d3.ascending);
      companySelect
        .selectAll("option")
        .data(["All Companies", ...tickers])
        .join("option")
        .attr("value", d => d)
        .text(d => d);

      if (ticker && ticker !== "All Companies") out = out.filter(d => d.ticker === ticker);
      return out;
    }

    function renderLegend(sectors) {
      const pad = 10;
      const itemW = 130;
      legendG.selectAll("*").remove();

      const items = legendG.selectAll("g.item")
        .data(sectors, d => d)
        .join("g")
        .attr("class", "item")
        .attr("transform", (d, i) => `translate(${i * itemW},0)`);

      items.append("circle")
        .attr("r", 5)
        .attr("cx", 6)
        .attr("cy", 10)
        .attr("fill", d => color(d));

      items.append("text")
        .attr("x", 18)
        .attr("y", 14)
        .attr("fill", "currentColor")
        .style("font-size", 11)
        .text(d => d);

      // position legend under chart
      const w = el.clientWidth || 900;
      legendG.attr("transform", `translate(${Math.min(24, w * 0.03)},${height - 12})`);
    }

    function render(data) {
      const w = Math.max(660, Math.min(1000, el.clientWidth || 900));
      const innerW = w - margin.left - margin.right;
      const innerH = height - margin.top - margin.bottom;

      svg.attr("viewBox", `0 0 ${w} ${height}`);
      g.attr("transform", `translate(${margin.left},${margin.top})`);

      x.range([0, innerW]);
      y.range([innerH, 0]);

      x.domain(d3.extent(data, d => d.volatility)).nice();
      y.domain(d3.extent(data, d => d.avg_return)).nice();
      r.domain(d3.extent(raw, d => d.avg_volume || 0));

      // grid
      gGrid.selectAll("*").remove();
      gGrid.append("g")
        .call(d3.axisLeft(y).ticks(6).tickSize(-innerW).tickFormat(""))
        .call(g => g.selectAll("line").attr("stroke", "rgba(255,255,255,0.07)"))
        .call(g => g.select(".domain").remove());

      xAxisG.attr("transform", `translate(0,${innerH})`).call(d3.axisBottom(x).ticks(6).tickFormat(d3.format(".2%")));
      yAxisG.call(d3.axisLeft(y).ticks(6).tickFormat(d3.format(".2%")));

      xLabel.attr("x", innerW / 2).attr("y", innerH + 44).text("Volatility (Std Dev of Daily Return)");
      yLabel
        .attr("transform", `translate(${-52},${innerH / 2}) rotate(-90)`)
        .text("Average Daily Return");

      // dots join
      const dots = gDots.selectAll("circle.dot")
        .data(data, d => d.ticker);

      dots.join(
        enter => enter.append("circle")
          .attr("class", "dot")
          .attr("cx", d => x(d.volatility))
          .attr("cy", d => y(d.avg_return))
          .attr("r", d => r(d.avg_volume || 0))
          .attr("fill", d => color(d.sector))
          .attr("stroke", "rgba(255,255,255,.18)")
          .attr("stroke-width", 1)
          .attr("opacity", 0.9)
          .style("cursor", "pointer")
          .on("mousemove", showTooltip)
          .on("mouseleave", hideTooltip)
          .on("click", (event, d) => {
            selectedTicker = d.ticker;
            onSelect?.(selectedTicker);
            updateSelectionStyles();
          }),
        update => update
          .transition().duration(350)
          .attr("cx", d => x(d.volatility))
          .attr("cy", d => y(d.avg_return))
          .attr("r", d => r(d.avg_volume || 0))
          .attr("fill", d => color(d.sector)),
        exit => exit.remove()
      );

      updateSelectionStyles();

      // legend
      const sectors = Array.from(new Set(raw.map(d => d.sector))).sort(d3.ascending);
      renderLegend(sectors);
    }

    function updateSelectionStyles() {
      gDots.selectAll("circle.dot")
        .attr("opacity", d => !selectedTicker ? 0.9 : (d.ticker === selectedTicker ? 1 : 0.16))
        .attr("stroke-width", d => d.ticker === selectedTicker ? 2.4 : 1)
        .attr("stroke", d => d.ticker === selectedTicker ? "white" : "rgba(255,255,255,.18)");
    }

    function setSelected(ticker) {
      selectedTicker = ticker;
      updateSelectionStyles();
    }

    async function init() {
      // load csv
      const rows = await d3.csv(dataUrl, d3.autoType);

      raw = rows.map(d => ({
        ticker: String(d.ticker ?? d.Ticker ?? d.symbol ?? d.Symbol).trim(),
        sector: niceSectorName(d.sector),
        avg_return: +d.avg_return,
        volatility: +d.volatility,
        avg_volume: d.avg_volume == null ? null : +d.avg_volume,
        n_days: d.n_days == null ? null : +d.n_days
      })).filter(d => d.ticker && isFinite(d.avg_return) && isFinite(d.volatility));

      // color domain
      const sectors = Array.from(new Set(raw.map(d => d.sector))).sort(d3.ascending);
      color.domain(sectors);

      // dropdowns
      updateDropdowns(raw);

      sectorFilter.on("change", () => {
        selectedTicker = null;
        onSelect?.(null);
        render(getFiltered());
      });

      companySelect.on("change", () => {
        const v = companySelect.property("value");
        if (v && v !== "All Companies") {
          selectedTicker = v;
          onSelect?.(selectedTicker);
        } else {
          selectedTicker = null;
          onSelect?.(null);
        }
        render(getFiltered());
      });

      resetBtn.on("click", () => {
        selectedTicker = null;
        sectorFilter.property("value", "All");
        companySelect.property("value", "All Companies");
        onSelect?.(null);
        render(raw);
      });

      // first render
      el.innerHTML = ""; // remove loading
      el.appendChild(svg.node());
      render(raw);

      // responsive rerenders
      const ro = new ResizeObserver(() => render(getFiltered()));
      ro.observe(el);
    }

    init().catch(err => {
      el.innerHTML = `<div class="err"><b>Dashboard failed to load.</b><br/>${String(err)}</div>`;
      console.error(err);
    });

    return { setSelected };
  };
})();