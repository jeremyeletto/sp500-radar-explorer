const DATA_URL = "./data/Sp500fin2_scored.csv";
const SCORE_FIELDS = [
  "Marketcap Score",
  "Ebitda Score",
  "Revenuegrowth Score",
  "Weight Score",
  "P/B Ratio Score",
  "P/E Ratio Score",
  "Dividend Yield Score",
  "EPS Score",
  "ROE Score",
];
const SCORE_FALLBACK = 50;
const MIN_ACTIVE_METRICS = 1;
const MAX_ROWS = 100;
const SCORE_RAW_META = {
  "Marketcap Score": {
    key: "Marketcap",
    format: formatCurrencyValue,
  },
  "Ebitda Score": {
    key: "Ebitda",
    format: formatCurrencyValue,
  },
  "Revenuegrowth Score": {
    key: "Revenuegrowth",
    format: (value) => formatPercentValue(value),
  },
  "Weight Score": {
    key: "Weight",
    format: formatPercentValue,
  },
  "P/B Ratio Score": {
    key: "P/B Ratio",
    format: (value) => formatNumberValue(value, 2),
  },
  "P/E Ratio Score": {
    key: "P/E Ratio",
    format: (value) => formatNumberValue(value, 2),
  },
  "Dividend Yield Score": {
    key: "Dividend Yield",
    format: (value) => formatPercentValue(value, true),
  },
  "EPS Score": {
    key: "EPS",
    format: (value) => formatNumberValue(value, 2),
  },
  "ROE Score": {
    key: "ROE",
    format: (value) => formatPercentValue(value, true),
  },
};

const formatCurrency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const formatNumber = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
});

const formatPercent = new Intl.NumberFormat("en-US", {
  style: "percent",
  maximumFractionDigits: 2,
});

let companies = [];
let activeMetricSet = new Set(SCORE_FIELDS);

document.addEventListener("DOMContentLoaded", () => {
  bootstrap();
});

async function bootstrap() {
  toggleLoading(true);
  try {
    const raw = await d3.csv(DATA_URL, parseRow);
    companies = raw.filter((d) => !!d.Symbol);
    companies.sort((a, b) => d3.ascending(a.Symbol, b.Symbol));
    initMetricControls();
    initControls();
    renderRankings();
  } catch (error) {
    console.error(error);
    showError("Unable to load dataset. Please check the CSV path.");
  } finally {
    toggleLoading(false);
  }
}

function initControls() {
  // No additional controls right now.
}

function initMetricControls() {
  const container = document.getElementById("metricOptions");
  if (!container) {
    return;
  }
  container.textContent = "";

  SCORE_FIELDS.forEach((field) => {
    const label = document.createElement("label");
    label.className = "metric-option";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = field;
    checkbox.checked = activeMetricSet.has(field);
    checkbox.id = `metric-${field.replace(/\s+/g, "-").toLowerCase()}`;

    checkbox.addEventListener("change", (event) => {
      const checked = event.target.checked;
      if (checked) {
        activeMetricSet.add(field);
      } else if (activeMetricSet.size > MIN_ACTIVE_METRICS) {
        activeMetricSet.delete(field);
      } else {
        event.target.checked = true;
        return;
      }
      renderRankings();
    });

    const span = document.createElement("span");
    span.textContent = field.replace(" Score", "");

    label.append(checkbox, span);
    container.appendChild(label);
  });
}

function renderRankings() {
  const metrics = getActiveMetrics();
  updateSummary(metrics);
  renderRankingTable(metrics);
}

function updateSummary(metrics) {
  const title = document.getElementById("rankingSummaryTitle");
  const meta = document.getElementById("rankingSummaryMeta");
  const metricNames = metrics.map(formatMetricLabel);

  if (title) {
    title.textContent = `Showing blended rankings across ${metrics.length} metric${
      metrics.length === 1 ? "" : "s"
    }`;
  }
  if (meta) {
    const filteredCount = companies.length;
    const topDisplayed = Math.min(MAX_ROWS, filteredCount);
    meta.textContent = metrics.length
      ? `Showing top ${topDisplayed.toLocaleString()} of ${filteredCount.toLocaleString()} companies · Metrics: ${
          metricNames.length ? metricNames.join(", ") : "None"
        }`
      : "Select at least one metric to compute rankings.";
  }
}

function renderRankingTable(metrics) {
  const table = document.getElementById("rankingTable");
  const tbody = table ? table.querySelector("tbody") : null;
  const thead = table ? table.querySelector("thead") : null;
  const emptyState = document.getElementById("rankingEmptyState");

  if (!tbody || !thead) {
    return;
  }

  const candidates = companies;

  thead.textContent = "";
  const headerRow = document.createElement("tr");
  const baseHeaders = [
    { label: "Rank", className: "col-rank" },
    { label: "Company", className: "col-company" },
    { label: "Sector" },
    { label: "Blended Score" },
  ];

  const metricHeaders = metrics.map((field) => ({
    label: formatMetricLabel(field),
    className: "metric-column",
  }));

  [...baseHeaders, ...metricHeaders].forEach((definition) => {
    const th = document.createElement("th");
    th.textContent = definition.label;
    if (definition.className) {
      th.classList.add(definition.className);
    }
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);

  const baseWidth = 720;
  const metricWidth = 170;
  if (table) {
    table.style.minWidth = `${baseWidth + metrics.length * metricWidth}px`;
  }

  tbody.textContent = "";

  if (!metrics.length) {
    if (emptyState) {
      emptyState.hidden = false;
      emptyState.textContent =
        "Select at least one metric to generate blended rankings.";
    }
    table.hidden = false;
    return;
  }

  const rankings = candidates
    .map((company) => {
      const metricsData = metrics.map((field) => {
        const raw = Number(company[field]);
        const score = Number.isFinite(raw) ? raw : SCORE_FALLBACK;
        const meta = SCORE_RAW_META[field];
        const rawValue =
          meta && company.hasOwnProperty(meta.key) ? company[meta.key] : null;
        const formattedRaw =
          meta && Number.isFinite(rawValue)
            ? meta.format(rawValue)
            : "N/A";
        return {
          score,
          raw: formattedRaw,
        };
      });
      const totalScore = metricsData.reduce((sum, metric) => sum + metric.score, 0);
      const averageScore = metricsData.length
        ? totalScore / metricsData.length
        : 0;
      return {
        company,
        metricsData,
        totalScore,
        averageScore,
      };
    })
    .sort((a, b) => {
      if (b.totalScore === a.totalScore) {
        return d3.ascending(a.company.Symbol, b.company.Symbol);
      }
      return b.totalScore - a.totalScore;
    });

  if (!rankings.length) {
    if (emptyState) {
      emptyState.hidden = false;
      emptyState.textContent =
        "No companies match your search. Try broadening the filters.";
    }
    table.hidden = false;
    return;
  }

  const limited = rankings.slice(0, Math.min(MAX_ROWS, rankings.length || MAX_ROWS));

  limited.forEach((entry, index) => {
    const { company, metricsData, totalScore, averageScore } = entry;
    const tr = document.createElement("tr");

    const rankCell = document.createElement("td");
    rankCell.className = "cell-rank";
    rankCell.textContent = (index + 1).toString();
    tr.appendChild(rankCell);

    const companyCell = document.createElement("td");
    companyCell.className = "cell-company";
    const link = document.createElement("a");
    link.href = `./index.html?symbol=${encodeURIComponent(company.Symbol)}`;
    link.textContent = company.Symbol;
    link.className = "ranking-symbol__link";
    companyCell.appendChild(link);
    const nameSpan = document.createElement("span");
    nameSpan.className = "ranking-symbol__name";
    nameSpan.textContent =
      company.Shortname ?? company.Longname ?? "Name unavailable";
    companyCell.appendChild(nameSpan);
    tr.appendChild(companyCell);

    const sectorCell = document.createElement("td");
    sectorCell.className = "cell-sector";
    sectorCell.textContent =
      [company.Sector, company.Industry].filter(Boolean).join(" · ") ||
      "Sector unavailable";
    tr.appendChild(sectorCell);

    const blendedCell = document.createElement("td");
    blendedCell.className = "cell-score";
    const totalEl = document.createElement("span");
    totalEl.className = "score-total";
    totalEl.textContent = totalScore.toFixed(1);
    blendedCell.appendChild(totalEl);
    const avgEl = document.createElement("span");
    avgEl.className = "score-avg";
    avgEl.textContent = `Avg ${averageScore.toFixed(1)}`;
    blendedCell.appendChild(avgEl);
    tr.appendChild(blendedCell);

    metricsData.forEach((metric) => {
      const metricCell = document.createElement("td");
      metricCell.className = "metric-column";
      const wrapper = document.createElement("div");
      wrapper.className = "metric-cell";

      const scoreLine = document.createElement("span");
      scoreLine.className = "metric-score";
      scoreLine.textContent = metric.score.toFixed(1);
      wrapper.appendChild(scoreLine);

      const rawLine = document.createElement("span");
      rawLine.className = "metric-raw";
      rawLine.textContent = metric.raw;
      wrapper.appendChild(rawLine);

      metricCell.appendChild(wrapper);
      tr.appendChild(metricCell);
    });

    tbody.appendChild(tr);
  });

  if (emptyState) {
    emptyState.hidden = true;
  }
  table.hidden = false;
}

function applyFilters(source) {
  return source;
}

function getActiveMetrics() {
  return Array.from(activeMetricSet);
}

function parseRow(row) {
  const parsed = { ...row };
  [
    "Currentprice",
    "Marketcap",
    "Ebitda",
    "Revenuegrowth",
    "Weight",
    "P/B Ratio",
    "P/E Ratio",
    "Dividend Yield",
    "EPS",
    "ROE",
    ...SCORE_FIELDS,
  ].forEach((key) => {
    if (parsed[key] === undefined) {
      return;
    }
    const value = Number(parsed[key]);
    parsed[key] = Number.isFinite(value) ? value : null;
  });
  return parsed;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function toggleLoading(isLoading) {
  document.body.dataset.loading = isLoading ? "true" : "false";
}

function showError(message) {
  const emptyState = document.getElementById("rankingEmptyState");
  if (emptyState) {
    emptyState.hidden = false;
    emptyState.textContent = message;
  }
}

function formatCurrencyValue(value) {
  if (!Number.isFinite(value)) {
    return "N/A";
  }
  return formatCurrency.format(value);
}

function formatNumberValue(value, fractionDigits = 0) {
  if (!Number.isFinite(value)) {
    return "N/A";
  }
  return value.toFixed(fractionDigits);
}

function formatPercentValue(value, allowHundreds = false) {
  if (!Number.isFinite(value)) {
    return "N/A";
  }
  const normalized =
    allowHundreds && Math.abs(value) > 1 ? value / 100 : value;
  return formatPercent.format(normalized);
}

function formatMetricLabel(field) {
  return field.replace(" Score", "");
}

