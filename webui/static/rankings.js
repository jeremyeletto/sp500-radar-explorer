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
const DEFAULT_TOP_N = 100;

let companies = [];
let activeMetricSet = new Set(SCORE_FIELDS);
let searchTerm = "";
let topLimit = DEFAULT_TOP_N;

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
    const topInput = document.getElementById("topNInput");
    if (topInput) {
      topInput.max = companies.length || DEFAULT_TOP_N;
      const initialValue = Number(topInput.value);
      const sanitized = Number.isFinite(initialValue)
        ? clamp(initialValue, 10, companies.length || DEFAULT_TOP_N)
        : Math.min(DEFAULT_TOP_N, companies.length || DEFAULT_TOP_N);
      topLimit = sanitized;
      topInput.value = sanitized;
    } else {
      topLimit = Math.min(DEFAULT_TOP_N, companies.length || DEFAULT_TOP_N);
    }
    renderRankings();
  } catch (error) {
    console.error(error);
    showError("Unable to load dataset. Please check the CSV path.");
  } finally {
    toggleLoading(false);
  }
}

function initControls() {
  const searchInput = document.getElementById("rankingSearch");
  const topNInput = document.getElementById("topNInput");

  if (searchInput) {
    searchInput.addEventListener("input", (event) => {
      searchTerm = event.target.value.trim().toLowerCase();
      renderRankings();
    });
  }

  if (topNInput) {
    topNInput.addEventListener("input", (event) => {
      const value = Number(event.target.value);
      if (Number.isFinite(value)) {
        topLimit = clamp(value, 10, companies.length || DEFAULT_TOP_N);
      } else {
        topLimit = DEFAULT_TOP_N;
      }
      event.target.value = topLimit;
      renderRankings();
    });
  }
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
  const metricNames = metrics.map((metric) => metric.replace(" Score", ""));

  if (title) {
    title.textContent = `Showing blended rankings across ${metrics.length} metric${
      metrics.length === 1 ? "" : "s"
    }`;
  }
  if (meta) {
    const filteredCount = applyFilters(companies).length;
    const topDisplayed = Math.min(topLimit, filteredCount);
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
  const emptyState = document.getElementById("rankingEmptyState");

  if (!tbody) {
    return;
  }

  tbody.textContent = "";

  if (!metrics.length) {
    if (emptyState) {
      emptyState.hidden = false;
      emptyState.textContent =
        "Select at least one metric to generate blended rankings.";
    }
    if (table) {
      table.hidden = true;
    }
    return;
  }

  const candidates = applyFilters(companies);
  const rankings = candidates
    .map((company) => {
      const metricsData = metrics.map((field) => {
        const raw = Number(company[field]);
        const score = Number.isFinite(raw) ? raw : SCORE_FALLBACK;
        return {
          field,
          score,
          label: field.replace(" Score", ""),
        };
      });
      const totalScore = metricsData.reduce((sum, m) => sum + m.score, 0);
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
    if (table) {
      table.hidden = true;
    }
    return;
  }

  const limited = rankings.slice(
    0,
    Math.min(topLimit, rankings.length || DEFAULT_TOP_N)
  );

  limited.forEach((entry, index) => {
    const { company, metricsData, totalScore, averageScore } = entry;
    const tr = document.createElement("tr");

    const rankCell = document.createElement("td");
    rankCell.className = "ranking-rank";
    rankCell.textContent = (index + 1).toString();
    tr.appendChild(rankCell);

    const symbolCell = document.createElement("td");
    symbolCell.className = "ranking-symbol";
    const link = document.createElement("a");
    link.href = `./index.html?symbol=${encodeURIComponent(company.Symbol)}`;
    link.textContent = company.Symbol;
    link.className = "ranking-symbol__link";
    symbolCell.appendChild(link);

    const nameSpan = document.createElement("span");
    nameSpan.className = "ranking-symbol__name";
    nameSpan.textContent =
      company.Shortname ?? company.Longname ?? "Name unavailable";
    symbolCell.appendChild(nameSpan);
    tr.appendChild(symbolCell);

    const sectorCell = document.createElement("td");
    sectorCell.className = "ranking-sector";
    sectorCell.textContent =
      [company.Sector, company.Industry].filter(Boolean).join(" · ") ||
      "Sector unavailable";
    tr.appendChild(sectorCell);

    const scoreCell = document.createElement("td");
    scoreCell.className = "ranking-score";
    const totalEl = document.createElement("span");
    totalEl.className = "ranking-score__total";
    totalEl.textContent = totalScore.toFixed(1);
    scoreCell.appendChild(totalEl);

    const avgEl = document.createElement("span");
    avgEl.className = "ranking-score__avg";
    avgEl.textContent = `Avg ${averageScore.toFixed(1)}`;
    scoreCell.appendChild(avgEl);
    tr.appendChild(scoreCell);

    const breakdownCell = document.createElement("td");
    breakdownCell.className = "ranking-metrics";
    metricsData.forEach((metric) => {
      const chip = document.createElement("span");
      chip.className = "metric-chip";
      chip.textContent = metric.label;

      const valueSpan = document.createElement("span");
      valueSpan.className = "metric-chip__value";
      valueSpan.textContent = metric.score.toFixed(1);
      chip.appendChild(valueSpan);

      breakdownCell.appendChild(chip);
    });
    tr.appendChild(breakdownCell);

    tbody.appendChild(tr);
  });

  if (emptyState) {
    emptyState.hidden = true;
  }
  if (table) {
    table.hidden = false;
  }
}

function applyFilters(source) {
  if (!searchTerm) {
    return source;
  }
  return source.filter((company) => {
    return (
      company.Symbol.toLowerCase().includes(searchTerm) ||
      (company.Shortname &&
        company.Shortname.toLowerCase().includes(searchTerm)) ||
      (company.Longname &&
        company.Longname.toLowerCase().includes(searchTerm)) ||
      (company.Sector && company.Sector.toLowerCase().includes(searchTerm)) ||
      (company.Industry && company.Industry.toLowerCase().includes(searchTerm))
    );
  });
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

function showError(message) {
  const emptyState = document.getElementById("rankingEmptyState");
  if (emptyState) {
    emptyState.hidden = false;
    emptyState.textContent = message;
  }
}

function toggleLoading(isLoading) {
  document.body.dataset.loading = isLoading ? "true" : "false";
}

