const DATA_URL = "./data/normalised_player_metrics.csv";

const METRICS = [
  {
    key: "player_appearances",
    label: "Appearances",
    defaultWeight: 6,
    color: "#c8102e",
  },
  {
    key: "length_of_service",
    label: "Service",
    defaultWeight: 0,
    color: "#2868a8",
  },
  {
    key: "trophies",
    label: "Trophies",
    defaultWeight: 7,
    color: "#b4842f",
  },
  {
    key: "goal_assists_total",
    label: "Goals + assists",
    defaultWeight: 10,
    color: "#00875a",
  },
  {
    key: "captain_games",
    label: "Captain games",
    defaultWeight: 7,
    color: "#7a4d00",
  },
  {
    key: "consecutive_games",
    label: "Consecutive games",
    defaultWeight: 0,
    color: "#5b6f95",
  },
  {
    key: "starter_ratio",
    label: "Starter ratio",
    defaultWeight: 1.5,
    color: "#7b5837",
  },
];

const state = {
  rows: [],
  weights: defaultWeights(),
  defaultRankByPlayer: new Map(),
};

const elements = {
  weightControls: document.querySelector("#weightControls"),
  weightTotal: document.querySelector("#weightTotal"),
  scoreRows: document.querySelector("#scoreRows"),
  resultMeta: document.querySelector("#resultMeta"),
  summaryStats: document.querySelector("#summaryStats"),
  searchInput: document.querySelector("#searchInput"),
  eraSelect: document.querySelector("#eraSelect"),
  rowLimit: document.querySelector("#rowLimit"),
  resetWeights: document.querySelector("#resetWeights"),
  copyLink: document.querySelector("#copyLink"),
  shareStatus: document.querySelector("#shareStatus"),
};

function defaultWeights() {
  return Object.fromEntries(
    METRICS.map((metric) => [metric.key, metric.defaultWeight]),
  );
}

function number(value) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function round(value, digits = 4) {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        field += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(field);
      field = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") {
        index += 1;
      }
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      continue;
    }

    field += char;
  }

  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }

  const headers = rows
    .shift()
    .map((header) => header.replace(/^\uFEFF/, "").trim());

  return rows
    .filter((cells) => cells.some((cell) => cell.trim() !== ""))
    .map((cells) => {
      const item = {};
      headers.forEach((header, index) => {
        item[header] = cells[index] ?? "";
      });
      return item;
    });
}

function hydrateWeightsFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const raw = params.get("w");

  if (!raw) {
    return;
  }

  const values = raw.split(",").map((value) => Number.parseFloat(value));
  const valid =
    values.length === METRICS.length &&
    values.every((value) => Number.isFinite(value) && value >= 0 && value <= 10);

  if (!valid) {
    return;
  }

  METRICS.forEach((metric, index) => {
    state.weights[metric.key] = values[index];
  });
}

function weightsAreDefault() {
  return METRICS.every(
    (metric) => state.weights[metric.key] === metric.defaultWeight,
  );
}

function updateUrlWeights() {
  const url = new URL(window.location.href);

  if (weightsAreDefault()) {
    url.searchParams.delete("w");
  } else {
    url.searchParams.set(
      "w",
      METRICS.map((metric) => state.weights[metric.key]).join(","),
    );
  }

  window.history.replaceState({}, "", url);
}

function scoreRow(row, weights) {
  const components = {};

  METRICS.forEach((metric) => {
    components[metric.key] = round(
      number(row[`${metric.key}_norm`]) * weights[metric.key],
    );
  });

  const total = round(
    Object.values(components).reduce((sum, value) => sum + value, 0),
  );

  return {
    ...row,
    components,
    totalScore: total,
  };
}

function rankRows(weights) {
  return state.rows
    .map((row) => scoreRow(row, weights))
    .sort((left, right) => {
      if (right.totalScore !== left.totalScore) {
        return right.totalScore - left.totalScore;
      }
      return left.player.localeCompare(right.player);
    })
    .map((row, index) => ({
      ...row,
      rank: index + 1,
    }));
}

function buildDefaultRanks() {
  state.defaultRankByPlayer = new Map(
    rankRows(defaultWeights()).map((row) => [row.player, row.rank]),
  );
}

function renderWeights() {
  elements.weightControls.innerHTML = METRICS.map((metric) => {
    const value = state.weights[metric.key];
    return `
      <div class="weight-control" style="--metric-color: ${metric.color}">
        <label class="weight-label" for="weight-${metric.key}">
          <span>${escapeHtml(metric.label)}</span>
          <span id="label-${metric.key}">${value}</span>
        </label>
        <div class="weight-inputs">
          <input
            id="weight-${metric.key}"
            type="range"
            min="0"
            max="10"
            step="0.5"
            value="${value}"
            data-weight="${metric.key}"
          >
          <input
            type="number"
            min="0"
            max="10"
            step="0.5"
            value="${value}"
            aria-label="${escapeHtml(metric.label)} weight"
            data-weight-number="${metric.key}"
          >
        </div>
      </div>
    `;
  }).join("");

  updateWeightTotal();
}

function updateWeightControls(key, value) {
  const label = document.querySelector(`#label-${key}`);
  const range = document.querySelector(`[data-weight="${key}"]`);
  const input = document.querySelector(`[data-weight-number="${key}"]`);
  const safeValue = Math.max(0, Math.min(10, number(value)));

  state.weights[key] = safeValue;
  label.textContent = safeValue;
  range.value = safeValue;
  input.value = safeValue;
  updateWeightTotal();
}

function updateWeightTotal() {
  const total = METRICS.reduce(
    (sum, metric) => sum + state.weights[metric.key],
    0,
  );
  elements.weightTotal.textContent = `Total weight: ${round(total, 1)}`;
}

function populateEraFilter() {
  const eras = [...new Set(state.rows.map((row) => row.service_start_decade))]
    .filter(Boolean)
    .sort((left, right) => number(left) - number(right));

  elements.eraSelect.insertAdjacentHTML(
    "beforeend",
    eras
      .map((era) => `<option value="${escapeHtml(era)}">${escapeHtml(era)}s</option>`)
      .join(""),
  );
}

function formatScore(value) {
  return number(value).toFixed(4);
}

function formatInteger(value) {
  return number(value).toLocaleString("en-GB", {
    maximumFractionDigits: 0,
  });
}

function formatPercent(value) {
  return `${round(number(value) * 100, 1).toFixed(1)}%`;
}

function movementLabel(defaultRank, currentRank) {
  const movement = defaultRank - currentRank;

  if (movement > 0) {
    return { label: `+${movement}`, className: "up" };
  }

  if (movement < 0) {
    return { label: String(movement), className: "down" };
  }

  return { label: "0", className: "" };
}

function breakdownMarkup(row) {
  if (row.totalScore <= 0) {
    return '<div class="breakdown" aria-label="No score contribution"></div>';
  }

  const segments = METRICS.map((metric) => {
    const score = row.components[metric.key];
    const width = Math.max((score / row.totalScore) * 100, score > 0 ? 1 : 0);
    return `
      <span
        class="segment"
        style="width: ${width}%; --segment-color: ${metric.color}"
        title="${escapeHtml(metric.label)}: ${formatScore(score)}"
      ></span>
    `;
  }).join("");

  return `<div class="breakdown" aria-label="Score breakdown">${segments}</div>`;
}

function filteredRows(rankedRows) {
  const searchTerm = elements.searchInput.value.trim().toLowerCase();
  const era = elements.eraSelect.value;

  return rankedRows.filter((row) => {
    const matchesSearch = row.player.toLowerCase().includes(searchTerm);
    const matchesEra = !era || row.service_start_decade === era;
    return matchesSearch && matchesEra;
  });
}

function limitedRows(rows) {
  const limit = elements.rowLimit.value;
  return limit === "all" ? rows : rows.slice(0, Number.parseInt(limit, 10));
}

function renderSummary(rankedRows) {
  const leader = rankedRows[0];
  const totalWeight = METRICS.reduce(
    (sum, metric) => sum + state.weights[metric.key],
    0,
  );

  elements.summaryStats.innerHTML = `
    <div class="summary-item">
      <strong>${formatInteger(state.rows.length)}</strong>
      <span>players</span>
    </div>
    <div class="summary-item">
      <strong>${escapeHtml(leader.player)}</strong>
      <span>leader</span>
    </div>
    <div class="summary-item">
      <strong>${round(totalWeight, 1)}</strong>
      <span>weight</span>
    </div>
  `;
}

function renderTable() {
  const rankedRows = rankRows(state.weights);
  const matches = filteredRows(rankedRows);
  const visibleRows = limitedRows(matches);

  renderSummary(rankedRows);
  elements.resultMeta.textContent = `${formatInteger(matches.length)} players matched`;

  if (!visibleRows.length) {
    elements.scoreRows.innerHTML = `
      <tr>
        <td colspan="11" class="empty-state">No matching players</td>
      </tr>
    `;
    return;
  }

  elements.scoreRows.innerHTML = visibleRows
    .map((row) => {
      const defaultRank = state.defaultRankByPlayer.get(row.player) ?? row.rank;
      const movement = movementLabel(defaultRank, row.rank);

      return `
        <tr>
          <td class="rank">${row.rank}</td>
          <td class="move ${movement.className}">${movement.label}</td>
          <td class="player-name">${escapeHtml(row.player)}</td>
          <td>${formatScore(row.totalScore)}</td>
          <td>${breakdownMarkup(row)}</td>
          <td>${formatInteger(row.player_appearances)}</td>
          <td>${formatInteger(row.length_of_service)}</td>
          <td>${formatInteger(row.trophies)}</td>
          <td>${formatInteger(row.goal_assists_total)}</td>
          <td>${formatInteger(row.captain_games)}</td>
          <td>${formatPercent(row.starter_ratio)}</td>
        </tr>
      `;
    })
    .join("");
}

function updateDashboard() {
  updateUrlWeights();
  renderTable();
}

async function copyCurrentLink() {
  try {
    await navigator.clipboard.writeText(window.location.href);
    elements.shareStatus.textContent = "Link copied";
  } catch {
    elements.shareStatus.textContent = window.location.href;
  }

  window.setTimeout(() => {
    elements.shareStatus.textContent = "";
  }, 2500);
}

function bindEvents() {
  elements.weightControls.addEventListener("input", (event) => {
    const key =
      event.target.dataset.weight || event.target.dataset.weightNumber || "";

    if (!key) {
      return;
    }

    updateWeightControls(key, event.target.value);
    updateDashboard();
  });

  elements.resetWeights.addEventListener("click", () => {
    state.weights = defaultWeights();
    renderWeights();
    updateDashboard();
  });

  elements.copyLink.addEventListener("click", copyCurrentLink);
  elements.searchInput.addEventListener("input", renderTable);
  elements.eraSelect.addEventListener("change", renderTable);
  elements.rowLimit.addEventListener("change", renderTable);
}

async function init() {
  try {
    hydrateWeightsFromUrl();
    renderWeights();
    bindEvents();

    const response = await fetch(DATA_URL);
    if (!response.ok) {
      throw new Error(`Could not load ${DATA_URL}`);
    }

    const csvText = await response.text();
    state.rows = parseCsv(csvText);
    buildDefaultRanks();
    populateEraFilter();
    renderTable();
  } catch (error) {
    elements.scoreRows.innerHTML = `
      <tr>
        <td colspan="11" class="empty-state">${escapeHtml(error.message)}</td>
      </tr>
    `;
  }
}

init();
