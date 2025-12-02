// js/app.js
(() => {
  const selectionBadge = document.getElementById("selectionBadge");

  let dashboard = null;
  let timeline = null;

  function setBadge(ticker) {
    selectionBadge.innerHTML = `Selected: <b>${ticker ?? "None"}</b>`;
  }

  window.addEventListener("DOMContentLoaded", () => {
    // create charts
    timeline = window.DS4200_TimeSeries({
      el: "#timeseries",
      pricesUrl: "data/prices_long.csv",
      filingsUrl: "data/filings.csv" // optional; if missing, it's ignored
    });

    dashboard = window.DS4200_Dashboard({
      el: "#dashboard",
      dataUrl: "data/companies_summary.csv",
      onSelect: (ticker) => {
        setBadge(ticker);
        timeline.updateForTicker(ticker);
        // keep dropdown synced on click selection
        const companySelect = document.getElementById("companySelect");
        if (companySelect && ticker) companySelect.value = ticker;
      }
    });

    // auto-select a default company (first option) for a stronger first impression
    setTimeout(() => {
      const companySelect = document.getElementById("companySelect");
      if (!companySelect) return;
      const first = Array.from(companySelect.options).find(o => o.value && o.value !== "All Companies");
      if (first) {
        companySelect.value = first.value;
        setBadge(first.value);
        timeline.updateForTicker(first.value);
      }
    }, 600);
  });
})();