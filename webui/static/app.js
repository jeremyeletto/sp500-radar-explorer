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
    format: formatPercentValue,
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
let filteredCompanies = [];
let symbolIndex = new Map();
let activeMetricSet = new Set(SCORE_FIELDS);
let currentSymbol = null;

document.addEventListener("DOMContentLoaded", () => {
  bootstrap();
});

async function bootstrap() {
  toggleLoading(true);
  try {
    const raw = await d3.csv(DATA_URL, parseRow);
    companies = raw.filter((d) => !!d.Symbol);
    companies.sort((a, b) => d3.ascending(a.Symbol, b.Symbol));
    filteredCompanies = companies.slice();
    symbolIndex = new Map(companies.map((d) => [d.Symbol, d]));
    initControls();
    initMetricControls();
    filteredCompanies = companies.slice();
    updateTypeaheadOptions(filteredCompanies);
    const querySymbol = getSymbolFromQuery();
    const defaultSymbol = "AAPL";
    let initial =
      (querySymbol && symbolIndex.get(querySymbol)) ||
      symbolIndex.get(defaultSymbol) ||
      filteredCompanies[0] ||
      null;
    if (initial) {
      selectCompany(initial.Symbol);
    } else {
      renderEmptyState();
    }
  } catch (error) {
    console.error(error);
    showError("Unable to load dataset. Please check the CSV path.");
  } finally {
    toggleLoading(false);
  }
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

function initControls() {
  const searchInput = document.getElementById("companySearch");
  if (!searchInput) {
    return;
  }

  searchInput.addEventListener("input", (event) => {
    handleTypeaheadInput(event.target.value);
  });

  searchInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      commitSearch(event.target.value);
    } else if (event.key === "Escape") {
      event.preventDefault();
      searchInput.value = "";
      filteredCompanies = companies.slice();
      updateTypeaheadOptions(filteredCompanies);
    }
  });

  searchInput.addEventListener("change", (event) => {
    commitSearch(event.target.value);
  });
}

function handleTypeaheadInput(rawValue) {
  const query = rawValue.trim().toLowerCase();
  filteredCompanies =
    query.length === 0
      ? companies.slice()
      : companies.filter((company) => matchesQuery(company, query));
  updateTypeaheadOptions(filteredCompanies);
}

function matchesQuery(company, query) {
  return (
    company.Symbol.toLowerCase().includes(query) ||
    (company.Shortname && company.Shortname.toLowerCase().includes(query)) ||
    (company.Longname && company.Longname.toLowerCase().includes(query))
  );
}

function updateTypeaheadOptions(source = companies) {
  const datalist = document.getElementById("companyOptions");
  if (!datalist) {
    return;
  }
  datalist.textContent = "";

  const list = source.length ? source : companies;
  list.slice(0, 50).forEach((company) => {
    const option = document.createElement("option");
    option.value = company.Symbol;
    option.textContent = buildTypeaheadLabel(company);
    datalist.appendChild(option);
  });
}

function buildTypeaheadLabel(company) {
  const name = company.Shortname ?? company.Longname ?? "";
  return name ? `${company.Symbol} — ${name}` : company.Symbol;
}

function commitSearch(rawValue) {
  const trimmed = rawValue.trim();
  if (!trimmed) {
    filteredCompanies = companies.slice();
    updateTypeaheadOptions(filteredCompanies);
    if (companies.length) {
      selectCompany(companies[0].Symbol);
    }
    return;
  }

  const upper = trimmed.toUpperCase();
  const directMatch = symbolIndex.get(upper);
  if (directMatch) {
    selectCompany(directMatch.Symbol);
    return;
  }

  const lower = trimmed.toLowerCase();
  const nameMatch = companies.find((company) => {
    return (
      (company.Shortname &&
        company.Shortname.toLowerCase() === lower) ||
      (company.Longname && company.Longname.toLowerCase() === lower)
    );
  });
  if (nameMatch) {
    selectCompany(nameMatch.Symbol);
    return;
  }

  if (filteredCompanies.length) {
    selectCompany(filteredCompanies[0].Symbol);
    return;
  }

  renderEmptyState(
    `No companies match "${trimmed}". Adjust your search or clear the query.`
  );
}

function selectCompany(symbol) {
  if (typeof symbol === "string") {
    symbol = symbol.toUpperCase();
  }
  if (!symbolIndex.has(symbol)) {
    updateUrlSymbol(null);
    renderEmptyState("Select a company to view its radar chart.");
    return;
  }

  const company = symbolIndex.get(symbol);
  const searchInput = document.getElementById("companySearch");
  if (searchInput && searchInput.value !== symbol) {
    searchInput.value = symbol;
  }
  filteredCompanies = companies.slice();
  updateTypeaheadOptions(filteredCompanies);

  currentSymbol = symbol;
  updateUrlSymbol(symbol);
  const activeFields = getActiveMetrics();
  updateCompanyDetails(company);
  renderRadarChart(document.getElementById("mainChart"), company, {
    levels: 5,
    maxValue: 100,
    labelFormat: (label) => label.replace(" Score", ""),
    fields: activeFields,
  });
  renderSimilarCompanies(company, activeFields);
}

function updateCompanyDetails(company) {
  const title = document.getElementById("companyTitle");
  const subtitle = document.getElementById("companySubtitle");
  const details = document.getElementById("companyDetails");

  title.textContent = `${company.Symbol} — ${company.Shortname ?? "N/A"}`;
  subtitle.textContent = [company.Sector, company.Industry]
    .filter(Boolean)
    .join(" · ");

  details.textContent = "";

  const entries = [
    ["Exchange", company.Exchange],
    ["Current Price", safeCurrency(company.Currentprice)],
    ["Market Cap", safeCurrency(company.Marketcap)],
    ["Weight", safePercent(company.Weight)],
    ["P/B Ratio", safeNumber(company["P/B Ratio"], 2)],
    ["P/E Ratio", safeNumber(company["P/E Ratio"], 2)],
    ["Dividend Yield", safePercent(company["Dividend Yield"])],
    ["ROE", safePercent(company.ROE)],
  ];

  entries.forEach(([label, value]) => {
    if (!value) {
      return;
    }
    const dt = document.createElement("dt");
    dt.textContent = label;
    const dd = document.createElement("dd");
    dd.textContent = value;
    details.append(dt, dd);
  });
}

function renderRadarChart(container, company, config = {}) {
  container.textContent = "";

  const tooltip = getTooltip();
  const width = container.clientWidth || 400;
  const height = container.clientHeight || width;
  const margin = Math.min(width, height) * 0.08;
  const radius = Math.min(width, height) / 2 - margin;
  const levels = config.levels ?? 5;
  const maxValue = config.maxValue ?? 100;
  const labelFormat =
    config.labelFormat ?? ((label) => label.replace(" Score", ""));
  const fields = config.fields ?? SCORE_FIELDS;
  if (!fields.length) {
    container.appendChild(
      createEmptyState("Select at least one metric to render the chart.")
    );
    return;
  }

  const svg = d3
    .select(container)
    .append("svg")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("preserveAspectRatio", "xMidYMid meet");

  const g = svg
    .append("g")
    .attr("transform", `translate(${width / 2}, ${height / 2})`);

  const angleSlice = (Math.PI * 2) / fields.length;
  const scale = d3.scaleLinear().domain([0, maxValue]).range([0, radius]);

  // Draw circular grid
  d3.range(levels)
    .map((level) => ((level + 1) / levels) * radius)
    .forEach((r) => {
      g.append("circle").attr("r", r).attr("class", "radar-grid");
    });

  // Axis lines and labels
  fields.forEach((field, i) => {
    const angle = angleSlice * i - Math.PI / 2;
    const lineX = Math.cos(angle) * radius;
    const lineY = Math.sin(angle) * radius;

    g.append("line")
      .attr("x1", 0)
      .attr("y1", 0)
      .attr("x2", lineX)
      .attr("y2", lineY)
      .attr("class", "radar-grid");

    const labelOffset = 12;
    const labelX = Math.cos(angle) * (radius + labelOffset);
    const labelY = Math.sin(angle) * (radius + labelOffset);

    g.append("text")
      .attr("class", "radar-axis-label")
      .attr("x", labelX)
      .attr("y", labelY)
      .attr("dy", "0.35em")
      .attr("text-anchor", getTextAnchor(angle))
      .text(labelFormat(field));
  });

  const radarLine = d3
    .lineRadial()
    .radius((d) => d.radius)
    .angle((_, i) => i * angleSlice)
    .curve(d3.curveLinearClosed);

  const radarPoints = fields.map((field) => {
    const rawValue = Number(company[field]);
    const value = Number.isFinite(rawValue) ? rawValue : SCORE_FALLBACK;
    const meta = SCORE_RAW_META[field];
    const rawMetricValue =
      meta && company.hasOwnProperty(meta.key) ? company[meta.key] : null;
    const hasRaw = Number.isFinite(rawMetricValue);
    const formattedRaw =
      hasRaw && meta
        ? meta.format(rawMetricValue)
        : null;
    return {
      radius: scale(value),
      value,
      label: labelFormat(field),
      rawValue: rawMetricValue,
      raw: formattedRaw,
      hasRaw,
    };
  });

  g.append("path")
    .datum(radarPoints)
    .attr("class", "radar-path")
    .attr("d", radarLine);

  g.selectAll(".radar-point")
    .data(radarPoints)
    .enter()
    .append("circle")
    .attr("class", "radar-point")
    .attr("r", 4)
    .attr("cx", (d, i) => Math.cos(angleSlice * i - Math.PI / 2) * d.radius)
    .attr("cy", (d, i) => Math.sin(angleSlice * i - Math.PI / 2) * d.radius)
    .on("mouseenter", (event, d) => {
      const lines = buildTooltipLines(d);
      showTooltip(tooltip, lines, event.pageX, event.pageY);
    })
    .on("mousemove", (event) => {
      positionTooltip(tooltip, event.pageX, event.pageY);
    })
    .on("mouseleave", () => {
      hideTooltip(tooltip);
    });
}

function renderSimilarCompanies(company, fields) {
  const container = document.getElementById("similarCompanies");
  container.textContent = "";

  const similar = findSimilarCompanies(company, fields, 5);
  if (!similar.length) {
    container.appendChild(
      createEmptyState("No similar companies found for this selection.")
    );
    return;
  }

  similar.forEach(({ peer, distance }) => {
    const card = document.createElement("article");
    card.className = "similar-card";
    card.tabIndex = 0;
    card.dataset.symbol = peer.Symbol;

    const heading = document.createElement("h4");
    heading.textContent = `${peer.Symbol} — ${peer.Shortname ?? "N/A"}`;
    card.appendChild(heading);

    const meta = document.createElement("p");
    meta.textContent = `${peer.Sector ?? "Unknown sector"} · ${
      peer.Industry ?? "Unknown industry"
    }`;
    card.appendChild(meta);

    const chartContainer = document.createElement("div");
    chartContainer.className = "radar-chart";
    card.appendChild(chartContainer);

    const distanceInfo = document.createElement("p");
    distanceInfo.textContent = `Similarity distance: ${distance.toFixed(
      2
    )} (lower is more similar)`;
    distanceInfo.className = "mono";
    card.appendChild(distanceInfo);

    container.appendChild(card);

    renderRadarChart(chartContainer, peer, {
      levels: 4,
      maxValue: 100,
      labelFormat: (label) => label.replace(" Score", ""),
      fields,
    });

    const activate = () => selectCompany(peer.Symbol);
    card.addEventListener("click", activate);
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        activate();
      }
    });
  });
}

function findSimilarCompanies(target, fields, count = 5) {
  const targetVector = fields.map((field) => {
    const value = Number(target[field]);
    return Number.isFinite(value) ? value : SCORE_FALLBACK;
  });
  return companies
    .filter((candidate) => candidate.Symbol !== target.Symbol)
    .map((candidate) => {
      const candidateVector = fields.map(
        (field) => {
          const value = Number(candidate[field]);
          return Number.isFinite(value) ? value : SCORE_FALLBACK;
        }
      );
      const distance = euclideanDistance(targetVector, candidateVector);
      return { peer: candidate, distance };
    })
    .sort((a, b) => a.distance - b.distance)
    .slice(0, count);
}

function euclideanDistance(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i += 1) {
    const delta = (a[i] ?? 0) - (b[i] ?? 0);
    sum += delta * delta;
  }
  return Math.sqrt(sum);
}

function getTextAnchor(angle) {
  const cosine = Math.cos(angle);
  if (Math.abs(cosine) < 0.3) {
    return "middle";
  }
  return cosine > 0 ? "start" : "end";
}

function safeCurrency(value) {
  if (!Number.isFinite(value) || value < 0) {
    return null;
  }
  return formatCurrency.format(value);
}

function safeNumber(value, fractionDigits = 0) {
  if (!Number.isFinite(value)) {
    return null;
  }
  return value.toFixed(fractionDigits);
}

function safePercent(value) {
  if (!Number.isFinite(value)) {
    return null;
  }
  return formatPercent.format(value);
}

function renderEmptyState(message = "No data available.") {
  const mainChart = document.getElementById("mainChart");
  mainChart.textContent = "";
  mainChart.appendChild(createEmptyState(message));

  const similar = document.getElementById("similarCompanies");
  similar.textContent = "";
  similar.appendChild(
    createEmptyState("Select a company to populate similar companies.")
  );
}

function createEmptyState(message) {
  const div = document.createElement("div");
  div.className = "empty-state";
  div.textContent = message;
  return div;
}

function showError(message) {
  renderEmptyState(message);
}

function toggleLoading(isLoading) {
  document.body.dataset.loading = isLoading ? "true" : "false";
}

let tooltipInstance = null;

function getTooltip() {
  if (tooltipInstance) {
    return tooltipInstance;
  }
  const tooltip = document.createElement("div");
  tooltip.className = "radar-tooltip";
  document.body.appendChild(tooltip);
  tooltipInstance = tooltip;
  return tooltip;
}

function showTooltip(tooltip, lines, pageX, pageY) {
  tooltip.textContent = "";
  lines.forEach((line, index) => {
    tooltip.append(document.createTextNode(line));
    if (index < lines.length - 1) {
      tooltip.append(document.createElement("br"));
    }
  });
  tooltip.dataset.visible = "true";
  positionTooltip(tooltip, pageX, pageY);
}

function positionTooltip(tooltip, pageX, pageY) {
  const offset = 12;
  tooltip.style.left = `${pageX}px`;
  tooltip.style.top = `${pageY - offset}px`;
}

function hideTooltip(tooltip) {
  tooltip.dataset.visible = "false";
}

function getSymbolFromQuery() {
  try {
    const params = new URLSearchParams(window.location.search);
    const symbol = params.get("symbol");
    return symbol ? symbol.toUpperCase() : null;
  } catch (error) {
    return null;
  }
}

function updateUrlSymbol(symbol) {
  try {
    const url = new URL(window.location);
    if (symbol) {
      url.searchParams.set("symbol", symbol);
    } else {
      url.searchParams.delete("symbol");
    }
    window.history.replaceState({}, "", url);
  } catch (error) {
    // Ignore history errors (e.g., unsupported environments)
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
        // Ensure at least the minimum metrics remain selected
        event.target.checked = true;
        return;
      }
      refreshVisualisations();
    });

    const span = document.createElement("span");
    span.textContent = field.replace(" Score", "");

    label.append(checkbox, span);
    container.appendChild(label);
  });
}

function getActiveMetrics() {
  return Array.from(activeMetricSet);
}

function refreshVisualisations() {
  if (currentSymbol && symbolIndex.has(currentSymbol)) {
    selectCompany(currentSymbol);
  } else if (filteredCompanies.length) {
    selectCompany(filteredCompanies[0].Symbol);
  } else if (companies.length) {
    filteredCompanies = companies.slice();
    updateTypeaheadOptions(filteredCompanies);
    selectCompany(companies[0].Symbol);
  }
}

function formatCurrencyValue(value) {
  if (!Number.isFinite(value)) {
    return null;
  }
  return formatCurrency.format(value);
}

function formatNumberValue(value, fractionDigits = 0) {
  if (!Number.isFinite(value)) {
    return null;
  }
  return value.toFixed(fractionDigits);
}

function formatPercentValue(value, allowHundreds = false) {
  if (!Number.isFinite(value)) {
    return null;
  }
  const normalized =
    allowHundreds && Math.abs(value) > 1 ? value / 100 : value;
  return formatPercent.format(normalized);
}

function buildTooltipLines(point) {
  const scoreLine = `${point.label}: ${point.value.toFixed(1)}`;
  if (point.hasRaw) {
    const rawText =
      point.raw ??
      (Number.isFinite(point.rawValue)
        ? formatNumberValue(point.rawValue, 2)
        : "Unavailable");
    return [scoreLine, `Raw: ${rawText}`];
  }
  return [
    scoreLine,
    `Raw: Unavailable (defaulted to ${SCORE_FALLBACK})`,
  ];
}

