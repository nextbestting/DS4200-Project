// js/timeseries.js
(() => {
  const fmtDate = d3.utcFormat("%b %d, %Y");
  const fmtNum = d3.format(",.0f");
  const fmtPrice = d3.format("$,.2f");
  const fmtPct = d3.format("+.2%");

  const parseDate = d3.utcParse("%Y-%m-%d");

  window.DS4200_TimeSeries = function DS4200_TimeSeries(opts) {
    const el = typeof opts.el === "string" ? document.querySelector(opts.el) : opts.el;
    const pricesUrl = opts.pricesUrl;
    const filingsUrl = opts.filingsUrl; // optional

    const tooltip = d3.select("#tooltip");
    const yearSlider = d3.select("#yearSlider");
    const yearLabel = d3.select("#yearLabel");
    const showAllBtn = d3.select("#showAll");
    const priceModeSel = d3.select("#priceMode");
    const rangeBadge = d3.select("#rangeBadge");

    let prices = [];
    let filings = [];
    let currentTicker = null;
    let currentSector = null;

    let seriesAll = [];
    let filteredAll = []; // same, but can carry computed fields

    // sizing
    const margin = { top: 18, right: 64, bottom: 118, left: 66 };
    const h = 560;
    const ctxH = 74;
    const ctxGap = 22;

    const svg = d3.select(el).append("svg");
    const g = svg.append("g");
    const gMain = g.append("g");
    const gCtx = g.append("g");

    // scales
    const x = d3.scaleUtc();
    const yPrice = d3.scaleLinear();
    const yVol = d3.scaleLinear();
    const xCtx = d3.scaleUtc();
    const yCtx = d3.scaleLinear();

    // axis groups
    const xAxisG = gMain.append("g").attr("class", "xAxis");
    const yAxisG = gMain.append("g").attr("class", "yAxis");
    const yRightG = gMain.append("g").attr("class", "yAxisRight");

    // labels
    const title = gMain.append("text")
      .attr("id", "tsTitle")
      .attr("fill", "currentColor")
      .style("font-size", 12)
      .style("font-weight", 800)
      .attr("x", 0).attr("y", -6)
      .text("Select a company to view the timeline");

    const xLab = gMain.append("text")
      .attr("fill", "currentColor")
      .style("font-size", 12)
      .attr("text-anchor", "middle");

    const yLab = gMain.append("text")
      .attr("fill", "currentColor")
      .style("font-size", 12)
      .attr("text-anchor", "middle");

    const yRightLab = gMain.append("text")
      .attr("fill", "currentColor")
      .style("font-size", 12)
      .attr("text-anchor", "middle");

    // paths
    const volAreaPath = gMain.append("path")
      .attr("fill", "rgba(255,255,255,.10)");

    const pricePath = gMain.append("path")
      .attr("fill", "none")
      .attr("stroke", "rgba(255,255,255,.92)")
      .attr("stroke-width", 2);

    const maPath = gMain.append("path")
      .attr("fill", "none")
      .attr("stroke", "rgba(139,92,246,.92)")
      .attr("stroke-width", 1.6)
      .attr("stroke-dasharray", "4,3")
      .attr("opacity", 0.95);

    const filingsG = gMain.append("g").attr("class", "filings");

    // hover
    const focusG = gMain.append("g").style("display", "none");
    focusG.append("line")
      .attr("y1", 0).attr("y2", 1)
      .attr("stroke", "rgba(255,255,255,.18)")
      .attr("stroke-width", 1);

    focusG.append("circle")
      .attr("r", 4.2)
      .attr("fill", "white")
      .attr("stroke", "rgba(0,0,0,.35)");

    const overlay = gMain.append("rect")
      .attr("fill", "transparent")
      .style("cursor", "crosshair");

    // context
    const ctxPath = gCtx.append("path")
      .attr("fill", "none")
      .attr("stroke", "rgba(255,255,255,.50)")
      .attr("stroke-width", 1.35);

    const xCtxAxisG = gCtx.append("g").attr("class", "xAxisCtx");

    const brushG = gCtx.append("g").attr("class", "brush");
    const brush = d3.brushX().on("brush end", brushed);

    // line generators (updated on render due to scale refs)
    let priceLine, maLine, volArea, ctxLine;

    function computeSeries(series, mode) {
      // mode: raw or norm
      const s = series.map(d => ({ ...d }));
      const base = s.length ? s[0].close : 1;
      for (const d of s) {
        d.dispPrice = (mode === "norm" && base) ? (d.close / base * 100) : d.close;
        d.dispMA = (d.ma20 == null) ? null : ((mode === "norm" && base) ? (d.ma20 / base * 100) : d.ma20);
      }
      return { s, base };
    }

    function tryLoadFilings() {
      if (!filingsUrl) return Promise.resolve([]);
      return d3.csv(filingsUrl, d => ({
        ticker: String(d.ticker).trim(),
        filed_date: parseDate(d.filed_date),
        form: String(d.form).trim(),
        title: d.title ? String(d.title) : null,
        url: d.url ? String(d.url) : null
      })).catch(() => []);
    }

    function setDomains(series, w, innerW, innerH, ctxTop) {
      const extentX = d3.extent(series, d => d.date);

      xCtx.domain(extentX).range([0, innerW]);
      yCtx.domain(d3.extent(series, d => d.dispPrice)).nice().range([ctxH, 0]);

      x.domain(extentX).range([0, innerW]);
      yPrice.domain(d3.extent(series, d => d.dispPrice)).nice().range([innerH, 0]);
      yVol.domain([0, d3.max(series, d => d.volume) || 1]).nice().range([innerH, innerH * 0.62]);
    }

    function renderAxes(innerW, innerH) {
      xAxisG.attr("transform", `translate(0,${innerH})`).call(d3.axisBottom(x).ticks(6));
      yAxisG.call(d3.axisLeft(yPrice).ticks(6));
      yRightG.attr("transform", `translate(${innerW},0)`)
        .call(d3.axisRight(yVol).ticks(5).tickFormat(d3.format(".2s")));

      xCtxAxisG.attr("transform", `translate(0,${ctxH})`).call(d3.axisBottom(xCtx).ticks(6));
    }

    function renderPaths(series) {
      volAreaPath.datum(series).attr("d", volArea);
      pricePath.datum(series).attr("d", priceLine);
      maPath.datum(series).attr("d", maLine);
      ctxPath.datum(series).attr("d", ctxLine);
    }

    function updateBadges(domain) {
      if (!domain) {
        rangeBadge.html(`Range: <b>Full</b>`);
        return;
      }
      rangeBadge.html(`Range: <b>${fmtDate(domain[0])}</b> → <b>${fmtDate(domain[1])}</b>`);
    }

    function renderFilings(innerH) {
      filingsG.selectAll("*").remove();
      if (!currentTicker || !filings.length) return;

      const formColor = d3.scaleOrdinal()
        .domain(["10-K", "10-Q", "8-K"])
        .range(["rgba(245,158,11,.95)", "rgba(34,197,94,.95)", "rgba(239,68,68,.95)"]);

      const domain = x.domain();
      const inRange = filings.filter(f => f.ticker === currentTicker && f.filed_date && f.filed_date >= domain[0] && f.filed_date <= domain[1]);

      const gF = filingsG.selectAll("g.filing")
        .data(inRange, d => `${d.form}-${d.filed_date.toISOString()}`)
        .join("g")
        .attr("class", "filing")
        .attr("transform", d => `translate(${x(d.filed_date)},0)`)
        .style("cursor", d => d.url ? "pointer" : "default");

      gF.append("line")
        .attr("y1", 0).attr("y2", innerH)
        .attr("stroke", d => formColor(d.form))
        .attr("stroke-width", 1)
        .attr("opacity", 0.22);

      gF.append("circle")
        .attr("cy", 10)
        .attr("r", 4)
        .attr("fill", d => formColor(d.form))
        .attr("stroke", "rgba(255,255,255,.55)");

      gF.on("mousemove", (event, d) => {
        tooltip
          .style("opacity", 1)
          .html(`
            <div style="font-weight:800;margin-bottom:4px">${d.form} filing</div>
            <div><span style="color:#a7b1c6">Date:</span> ${fmtDate(d.filed_date)}</div>
            ${d.title ? `<div><span style="color:#a7b1c6">Title:</span> ${d.title}</div>` : ""}
            ${d.url ? `<div style="margin-top:6px;color:#a7b1c6">Click to open SEC link</div>` : ""}
          `)
          .style("left", `${event.pageX + 14}px`)
          .style("top", `${event.pageY + 14}px`);
      }).on("mouseleave", () => tooltip.style("opacity", 0))
        .on("click", (event, d) => {
          if (d.url) window.open(d.url, "_blank", "noopener,noreferrer");
        });
    }

    function brushed({ selection }) {
      if (!selection || !filteredAll.length) return;

      const [a, b] = selection.map(xCtx.invert);
      x.domain([a, b]);

      // rescale y domains to visible region for readability
      const vis = filteredAll.filter(d => d.date >= a && d.date <= b);
      if (vis.length) {
        yPrice.domain(d3.extent(vis, d => d.dispPrice)).nice();
        yVol.domain([0, d3.max(vis, d => d.volume) || 1]).nice();
      }

      renderAxes(currentInnerW, currentInnerH);
      renderPaths(filteredAll);
      renderFilings(currentInnerH);
      updateBadges(x.domain());
    }

    let currentInnerW = 0, currentInnerH = 0;

    function attachHover(innerH) {
      const bisect = d3.bisector(d => d.date).center;

      overlay
        .on("mouseenter", () => focusG.style("display", null))
        .on("mouseleave", () => {
          focusG.style("display", "none");
          tooltip.style("opacity", 0);
        })
        .on("mousemove", function (event) {
          if (!filteredAll.length) return;
          const [mx] = d3.pointer(event, this);
          const dt = x.invert(mx);
          const i = bisect(filteredAll, dt);
          const d = filteredAll[i];
          if (!d) return;

          focusG.select("line")
            .attr("transform", `translate(${x(d.date)},0)`)
            .attr("y2", innerH);

          focusG.select("circle")
            .attr("cx", x(d.date))
            .attr("cy", yPrice(d.dispPrice));

          tooltip
            .style("opacity", 1)
            .html(`
              <div style="font-weight:800;margin-bottom:4px">${currentTicker ?? ""}</div>
              <div><span style="color:#a7b1c6">Date:</span> ${fmtDate(d.date)}</div>
              <div><span style="color:#a7b1c6">Price:</span> ${priceModeSel.property("value") === "norm" ? d3.format(",.2f")(d.dispPrice) + " (index)" : fmtPrice(d.close)}</div>
              <div><span style="color:#a7b1c6">Volume:</span> ${fmtNum(d.volume)}</div>
              ${d.ret != null ? `<div><span style="color:#a7b1c6">Return:</span> ${fmtPct(d.ret)}</div>` : ""}
            `)
            .style("left", `${event.pageX + 14}px`)
            .style("top", `${event.pageY + 14}px`);
        });
    }

    function setYearWindow(year) {
      if (!filteredAll.length) return;

      const start = d3.utcParse("%Y-%m-%d")(`${year}-01-01`);
      const end = d3.utcParse("%Y-%m-%d")(`${year}-12-31`);

      const [d0, d1] = xCtx.domain();
      const a = start < d0 ? d0 : start;
      const b = end > d1 ? d1 : end;

      brushG.call(brush.move, [xCtx(a), xCtx(b)]);
    }

    function render() {
      const w = Math.max(680, Math.min(1040, el.clientWidth || 920));
      const innerW = w - margin.left - margin.right;
      const innerH = h - margin.top - margin.bottom;

      currentInnerW = innerW;
      currentInnerH = innerH;

      svg.attr("viewBox", `0 0 ${w} ${h}`);
      g.attr("transform", `translate(${margin.left},${margin.top})`);

      const ctxTop = innerH + ctxGap;
      gCtx.attr("transform", `translate(0,${ctxTop})`);

      // position labels
      xLab.attr("x", innerW / 2).attr("y", innerH + 44).text("Date");
      yLab.attr("transform", `translate(${-52},${innerH / 2}) rotate(-90)`).text(priceModeSel.property("value") === "norm" ? "Price Index (start=100)" : "Price (Adj Close)");
      yRightLab
        .attr("transform", `translate(${innerW + 52},${innerH / 2}) rotate(90)`)
        .text("Volume");

      // overlay sizing
      overlay.attr("width", innerW).attr("height", innerH);

      // update generators
      priceLine = d3.line().x(d => x(d.date)).y(d => yPrice(d.dispPrice));
      maLine = d3.line()
        .defined(d => d.dispMA != null)
        .x(d => x(d.date))
        .y(d => yPrice(d.dispMA));

      volArea = d3.area().x(d => x(d.date)).y0(innerH).y1(d => yVol(d.volume));
      ctxLine = d3.line().x(d => xCtx(d.date)).y(d => yCtx(d.dispPrice));

      // nothing selected? stop here
      if (!currentTicker) return;

      setDomains(filteredAll, w, innerW, innerH, ctxTop);
      renderAxes(innerW, innerH);
      renderPaths(filteredAll);

      brushG.call(brush.extent([[0, 0], [innerW, ctxH]]));
      brushG.call(brush);

      // default brush = full range if not already set
      brushG.call(brush.move, xCtx.range());

      attachHover(innerH);
      renderFilings(innerH);
      updateBadges(null);
    }

    function updateForTicker(ticker) {
      currentTicker = ticker;

      el.innerHTML = "";
      el.appendChild(svg.node());

      if (!ticker) {
        title.text("Select a company to view the timeline");
        currentSector = null;
        seriesAll = [];
        filteredAll = [];
        return;
      }

      title.text(`${ticker} — Price + Volume (2019–2025)`);

      seriesAll = prices
        .filter(d => d.ticker === ticker)
        .sort((a, b) => a.date - b.date);

      // compute returns + ma20 if not present
      for (let i = 0; i < seriesAll.length; i++) {
        const prev = seriesAll[i - 1];
        const cur = seriesAll[i];
        cur.ret = (prev && prev.close) ? (cur.close / prev.close - 1) : null;
      }
      // moving average (simple)
      const window = 20;
      for (let i = 0; i < seriesAll.length; i++) {
        const start = Math.max(0, i - window + 1);
        const slice = seriesAll.slice(start, i + 1);
        const avg = d3.mean(slice, d => d.close);
        seriesAll[i].ma20 = avg ?? null;
      }

      const mode = priceModeSel.property("value");
      filteredAll = computeSeries(seriesAll, mode).s;

      // update slider bounds (ensure 2019–2025 but robust)
      const years = d3.extent(filteredAll, d => d.date.getUTCFullYear());
      if (years[0] != null && years[1] != null) {
        yearSlider.attr("min", years[0]).attr("max", years[1]);
      }

      render();
    }

    async function init() {
      const rows = await d3.csv(pricesUrl, d => ({
        date: parseDate(d.date),
        ticker: String(d.ticker ?? d.Ticker).trim(),
        close: +((d.close ?? d.adj_close) ?? d.Close),
        volume: +(d.volume ?? d.Volume),
        sector: d.sector ? String(d.sector) : null,
        ret: d.ret === "" || d.ret == null ? null : +d.ret,
        ma20: d.ma20 === "" || d.ma20 == null ? null : +d.ma20
      }));

      prices = rows.filter(d => d.date && d.ticker && isFinite(d.close) && isFinite(d.volume));

      filings = await tryLoadFilings();

      // wire controls
      yearSlider.on("input", () => {
        const y = +yearSlider.node().value;
        yearLabel.text(y);
        setYearWindow(y);
      });

      showAllBtn.on("click", () => {
        if (!filteredAll.length) return;
        brushG.call(brush.move, xCtx.range());
      });

      priceModeSel.on("change", () => {
        if (!currentTicker) return;
        const mode = priceModeSel.property("value");
        filteredAll = computeSeries(seriesAll, mode).s;
        render();
      });

      // responsive
      const ro = new ResizeObserver(() => {
        if (currentTicker) render();
      });
      ro.observe(el);
    }

    init().catch(err => {
      el.innerHTML = `<div class="err"><b>Timeline failed to load.</b><br/>${String(err)}</div>`;
      console.error(err);
    });

    return { updateForTicker };
  };
})();