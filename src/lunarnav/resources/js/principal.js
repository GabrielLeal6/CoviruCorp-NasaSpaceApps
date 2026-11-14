const canvas = document.querySelector("#lunar-map");
const context = canvas.getContext("2d");
const mapWrap = document.querySelector(".map-canvas-wrap");
const lunarMapImage = new Image();
const addLocationButton = document.querySelector("#open-location");
const closeLocationButton = document.querySelector("#close-location");
const locationDrawer = document.querySelector("#location-drawer");
const selectLocationOnMapButton = document.querySelector("#select-location-on-map");
const locationPickHelp = document.querySelector("#location-pick-help");
const locationNameInput = document.querySelector("#location-name");
const locationLatitudeInput = document.querySelector("#location-latitude");
const locationLongitudeInput = document.querySelector("#location-longitude");
const locationColorInput = document.querySelector("#location-color");
const openComparisonButton = document.querySelector("#open-comparison");
const closeComparisonButton = document.querySelector("#close-comparison");
const comparisonDrawer = document.querySelector("#comparison-drawer");
const openDeleteButton = document.querySelector("#open-delete");
const closeDeleteButton = document.querySelector("#close-delete");
const deleteDrawer = document.querySelector("#delete-drawer");
const drawerBackdrop = document.querySelector("#drawer-backdrop");
const locationForm = document.querySelector("#location-form");
const comparisonForm = document.querySelector("#comparison-form");
const deleteForm = document.querySelector("#delete-form");
const firstLocationSelect = document.querySelector("#comparison-first");
const secondLocationSelect = document.querySelector("#comparison-second");
const deleteLocationSelect = document.querySelector("#delete-location");
const comparisonHelp = document.querySelector("#comparison-help");
const comparisonResult = document.querySelector("#comparison-result");
const deleteHelp = document.querySelector("#delete-help");
const deleteConfirmation = document.querySelector("#delete-confirmation");
const deleteSummary = document.querySelector("#delete-summary");
const confirmDeleteButton = document.querySelector("#confirm-delete");
const cancelDeleteButton = document.querySelector("#cancel-delete");
const scenarioList = document.querySelector("#scenario-list");
const addScenarioButton = document.querySelector("#add-scenario");
const compareScenariosButton = document.querySelector("#compare-scenarios");
const scenarioStatus = document.querySelector("#scenario-status");
const scenarioResults = document.querySelector("#scenario-results");
const scenarioMetrics = document.querySelector("#scenario-metrics");
const mapStatus = document.querySelector("#map-status");

const storageKey = "lunar-navigator.locations";
const scenarioStorageKey = "lunar-navigator.scenarios";
const lunarRadiusKm = 1737.4;
const minimumZoomLevel = 1;
const maximumZoomLevel = 8;
let pixelsPerDegree = 2.5;
let gridStep = 5 * pixelsPerDegree;
let basePixelsPerDegree = pixelsPerDegree;
let zoomLevel = 1;
const locations = loadLocations();
let originX = 0;
let originY = 0;
let dragStart = null;
let canvasWidth = 0;
let canvasHeight = 0;
let activeDrawer = null;
let activeTrigger = null;
let pendingDeleteId = null;
let selectingLocationOnMap = false;
let dragMoved = false;

lunarMapImage.addEventListener("load", drawMap);
lunarMapImage.addEventListener("error", () => {
  mapStatus.textContent =
    "Não foi possível carregar a imagem lunar. Verifique se lua-global.png está na pasta resources/lua.";
});
lunarMapImage.src = "../lua/lua-global.png";

function isValidLocation(location) {
  return (
    location !== null &&
    typeof location === "object" &&
    typeof location.id === "string" &&
    typeof location.name === "string" &&
    location.name.trim().length > 0 &&
    location.name.length <= 40 &&
    Number.isFinite(location.latitude) &&
    location.latitude >= -90 &&
    location.latitude <= 90 &&
    Number.isFinite(location.longitude) &&
    location.longitude >= -180 &&
    location.longitude <= 180
  );
}

function isValidScenario(scenario) {
  if (scenario === null || typeof scenario !== "object") return false;

  const validDate =
    scenario.date === "" ||
    (/^\d{4}-\d{2}-\d{2}$/.test(scenario.date) &&
      Number.isFinite(new Date(`${scenario.date}T00:00:00`).getTime()) &&
      new Date(`${scenario.date}T00:00:00`).toISOString().slice(0, 10) === scenario.date);
  const validTime =
    scenario.time === "" || /^([01]\d|2[0-3]):[0-5]\d$/.test(scenario.time);

  return (
    Number.isInteger(scenario.id) &&
    scenario.id > 0 &&
    (scenario.locationId === "" || typeof scenario.locationId === "string") &&
    (scenario.delayDays === undefined ||
      (Number.isInteger(scenario.delayDays) &&
        scenario.delayDays >= 0 &&
        scenario.delayDays <= 30)) &&
    validDate &&
    validTime
  );
}

function normalizeSelenographicCoordinates(latitude, longitude) {
  let normalizedLatitude = latitude;
  let normalizedLongitude = longitude;
  const reflectedAcrossPole =
    normalizedLatitude > 90 || normalizedLatitude < -90;

  if (normalizedLatitude > 90) {
    normalizedLatitude = 180 - normalizedLatitude;
    normalizedLongitude += 180;
  } else if (normalizedLatitude < -90) {
    normalizedLatitude = -180 - normalizedLatitude;
    normalizedLongitude += 180;
  }

  if (reflectedAcrossPole) {
    normalizedLongitude =
      ((normalizedLongitude + 180) % 360 + 360) % 360 - 180;
  }
  return { latitude: normalizedLatitude, longitude: normalizedLongitude };
}

function loadScenarioState() {
  try {
    const savedState = localStorage.getItem(scenarioStorageKey);
    if (savedState === null) return null;

    const parsedState = JSON.parse(savedState);
    if (
      parsedState === null ||
      typeof parsedState !== "object" ||
      !Array.isArray(parsedState.scenarios) ||
      parsedState.scenarios.length > 4 ||
      !parsedState.scenarios.every(isValidScenario) ||
      new Set(parsedState.scenarios.map((scenario) => scenario.id)).size !==
        parsedState.scenarios.length ||
      typeof parsedState.resultsVisible !== "boolean"
    ) {
      throw new TypeError("Os dados salvos dos cenários têm um formato inválido.");
    }

    return parsedState;
  } catch (error) {
    console.error("Não foi possível carregar os cenários salvos.", error);
    mapStatus.textContent =
      "Não foi possível carregar os cenários salvos neste navegador.";
    return null;
  }
}

const savedScenarioState = loadScenarioState();
const scenarios = savedScenarioState?.scenarios ?? [
  { id: 1, locationId: "", date: "", time: "", delayDays: 0 },
  { id: 2, locationId: "", date: "", time: "", delayDays: 0 },
];
scenarios.forEach((scenario) => {
  scenario.delayDays ??= 0;
});
let scenarioSequence = scenarios.reduce(
  (highestId, scenario) => Math.max(highestId, scenario.id),
  0,
);
let scenarioResultsVisible = savedScenarioState?.resultsVisible ?? false;

function saveScenarioState() {
  try {
    localStorage.setItem(
      scenarioStorageKey,
      JSON.stringify({ scenarios, resultsVisible: scenarioResultsVisible }),
    );
    return true;
  } catch (error) {
    console.error("Não foi possível salvar os cenários neste navegador.", error);
    mapStatus.textContent =
      "As alterações dos cenários não foram salvas; tente novamente neste navegador.";
    return false;
  }
}

function loadLocations() {
  try {
    const savedLocations = localStorage.getItem(storageKey);
    if (savedLocations === null) return [];

    const parsedLocations = JSON.parse(savedLocations);
    if (
      !Array.isArray(parsedLocations) ||
      !parsedLocations.every(
        (location) =>
          location !== null &&
          typeof location === "object" &&
          typeof location.id === "string" &&
          typeof location.name === "string" &&
          location.name.trim().length > 0 &&
          location.name.length <= 40 &&
          Number.isFinite(location.latitude) &&
          location.latitude >= -180 &&
          location.latitude <= 180 &&
          Number.isFinite(location.longitude) &&
          location.longitude >= -180 &&
          location.longitude <= 180 &&
          (location.color === undefined ||
            (typeof location.color === "string" &&
              /^#[0-9a-f]{6}$/i.test(location.color))),
      )
    ) {
      throw new TypeError("Os dados salvos das localizações têm um formato inválido.");
    }

    const normalizedLocations = parsedLocations.map((location) => ({
      ...location,
      ...normalizeSelenographicCoordinates(location.latitude, location.longitude),
      color: location.color ?? "#ffcc70",
    }));
    const needsMigration = normalizedLocations.some(
      (location, index) =>
        location.latitude !== parsedLocations[index].latitude ||
        location.longitude !== parsedLocations[index].longitude ||
        location.color !== parsedLocations[index].color,
    );

    if (needsMigration) {
      try {
        localStorage.setItem(storageKey, JSON.stringify(normalizedLocations));
      } catch (error) {
        console.error("Não foi possível salvar as coordenadas normalizadas.", error);
        mapStatus.textContent =
          "Coordenadas antigas foram ajustadas nesta sessão, mas não puderam ser salvas no navegador.";
      }
    }

    return normalizedLocations;
  } catch (error) {
    console.error("Não foi possível carregar as localizações salvas.", error);
    mapStatus.textContent =
      "Não foi possível carregar os locais salvos neste navegador.";
    return [];
  }
}

function saveLocations() {
  try {
    localStorage.setItem(storageKey, JSON.stringify(locations));
    mapStatus.textContent = "";
    return true;
  } catch (error) {
    console.error("Não foi possível salvar as localizações neste navegador.", error);
    mapStatus.textContent =
      "Localização adicionada somente nesta sessão; não foi possível salvá-la no navegador.";
    return false;
  }
}

function makeLocationId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function formatCoordinate(value) {
  return `${value.toFixed(4)}°`;
}

function updateLocationOptions() {
  for (const select of [
    firstLocationSelect,
    secondLocationSelect,
    deleteLocationSelect,
  ]) {
    const selectedValue = select.value;
    select.replaceChildren(new Option("Selecione uma localização", ""));

    locations.forEach((location) => {
      const option = new Option(
        `${location.name} (${formatCoordinate(location.latitude)}, ${formatCoordinate(location.longitude)})`,
        location.id,
      );
      select.add(option);
    });

    if (locations.some((location) => location.id === selectedValue)) {
      select.value = selectedValue;
    }
  }

  comparisonForm.querySelector("button[type='submit']").disabled =
    locations.length < 2;
  comparisonHelp.textContent =
    locations.length < 2
      ? "Adicione pelo menos duas localizações ao mapa para compará-las."
      : "Escolha dois locais diferentes para ver as coordenadas e a distância aproximada entre eles.";
  deleteForm.querySelector("button[type='submit']").disabled =
    locations.length === 0;
  deleteHelp.textContent =
    locations.length === 0
      ? "Não há localizações salvas para excluir."
      : "Selecione o local que deseja remover.";
  let scenarioChanged = false;
  scenarios.forEach((scenario) => {
    if (!locations.some((location) => location.id === scenario.locationId)) {
      if (scenario.locationId !== "") {
        scenario.locationId = "";
        scenarioChanged = true;
      }
    }
  });
  if (scenarioChanged) {
    scenarioResultsVisible = false;
    saveScenarioState();
  }
  renderScenarioCards();
}

function createScenario() {
  scenarioSequence += 1;
  return {
    id: scenarioSequence,
    locationId: "",
    date: "",
    time: "",
    delayDays: 0,
  };
}

function renderScenarioCards() {
  scenarioList.replaceChildren();

  scenarios.forEach((scenario, index) => {
    const card = document.createElement("article");
    card.className = "scenario-card";

    const header = document.createElement("div");
    header.className = "scenario-card-header";
    const title = document.createElement("h3");
    title.textContent = `Cenário ${index + 1}`;
    const removeButton = document.createElement("button");
    removeButton.className = "scenario-remove-button";
    removeButton.type = "button";
    removeButton.textContent = "Remover";
    removeButton.setAttribute("aria-label", `Remover cenário ${index + 1}`);
    removeButton.addEventListener("click", () => {
      scenarios.splice(index, 1);
      scenarioResultsVisible = false;
      scenarioResults.hidden = true;
      saveScenarioState();
      renderScenarioCards();
    });
    header.append(title, removeButton);

    const fields = document.createElement("div");
    fields.className = "scenario-fields";

    const siteId = `scenario-location-${scenario.id}`;
    const siteLabel = document.createElement("label");
    siteLabel.htmlFor = siteId;
    siteLabel.textContent = "Localização";
    const siteSelect = document.createElement("select");
    siteSelect.id = siteId;
    siteSelect.required = true;
    siteSelect.add(new Option("Selecione uma localização", ""));
    locations.forEach((location) => {
      siteSelect.add(
        new Option(
          `${location.name} (${formatCoordinate(location.latitude)}, ${formatCoordinate(location.longitude)})`,
          location.id,
        ),
      );
    });
    siteSelect.value = scenario.locationId;
    siteSelect.disabled = locations.length === 0;
    siteSelect.addEventListener("change", () => {
      scenario.locationId = siteSelect.value;
      scenarioResultsVisible = false;
      scenarioResults.hidden = true;
      saveScenarioState();
    });

    const dateId = `scenario-date-${scenario.id}`;
    const dateLabel = document.createElement("label");
    dateLabel.htmlFor = dateId;
    dateLabel.textContent = "Data";
    const dateInput = document.createElement("input");
    dateInput.id = dateId;
    dateInput.type = "date";
    dateInput.required = true;
    dateInput.value = scenario.date;
    dateInput.addEventListener("change", () => {
      scenario.date = dateInput.value;
      scenarioResultsVisible = false;
      scenarioResults.hidden = true;
      saveScenarioState();
    });
    dateInput.addEventListener("input", () => {
      scenario.date = dateInput.value;
      scenarioResultsVisible = false;
      scenarioResults.hidden = true;
      saveScenarioState();
    });

    const timeId = `scenario-time-${scenario.id}`;
    const timeLabel = document.createElement("label");
    timeLabel.htmlFor = timeId;
    timeLabel.textContent = "Horário (UTC)";
    const timeInput = document.createElement("input");
    timeInput.id = timeId;
    timeInput.type = "time";
    timeInput.required = true;
    timeInput.value = scenario.time;
    timeInput.addEventListener("change", () => {
      scenario.time = timeInput.value;
      scenarioResultsVisible = false;
      scenarioResults.hidden = true;
      saveScenarioState();
    });
    timeInput.addEventListener("input", () => {
      scenario.time = timeInput.value;
      scenarioResultsVisible = false;
      scenarioResults.hidden = true;
      saveScenarioState();
    });

    const delayId = `scenario-delay-${scenario.id}`;
    const delayHeader = document.createElement("div");
    delayHeader.className = "scenario-delay-header";
    const delayLabel = document.createElement("label");
    delayLabel.htmlFor = delayId;
    delayLabel.textContent = "Margem de atraso do lançamento";
    const delayValue = document.createElement("output");
    delayValue.htmlFor = delayId;
    delayValue.className = "scenario-delay-value";
    const updateDelayValue = () => {
      delayValue.textContent = `${scenario.delayDays} ${scenario.delayDays === 1 ? "dia" : "dias"}`;
    };
    updateDelayValue();
    delayHeader.append(delayLabel, delayValue);

    const delayInput = document.createElement("input");
    delayInput.id = delayId;
    delayInput.type = "range";
    delayInput.min = "0";
    delayInput.max = "30";
    delayInput.step = "1";
    delayInput.value = String(scenario.delayDays);
    delayInput.setAttribute(
      "aria-label",
      `Margem de atraso do lançamento do cenário ${index + 1}, em dias`,
    );
    delayInput.addEventListener("input", () => {
      scenario.delayDays = Number(delayInput.value);
      updateDelayValue();
      scenarioResultsVisible = false;
      scenarioResults.hidden = true;
      saveScenarioState();
    });

    const delayScale = document.createElement("div");
    delayScale.className = "scenario-delay-scale";
    delayScale.setAttribute("aria-hidden", "true");
    delayScale.append(
      document.createElement("span"),
      document.createElement("span"),
    );
    delayScale.firstElementChild.textContent = "0 dias";
    delayScale.lastElementChild.textContent = "30 dias";

    fields.append(
      siteLabel,
      siteSelect,
      dateLabel,
      dateInput,
      timeLabel,
      timeInput,
      delayHeader,
      delayInput,
      delayScale,
    );
    card.append(header, fields);
    scenarioList.append(card);
  });

  addScenarioButton.disabled = scenarios.length >= 4;
  compareScenariosButton.disabled = scenarios.length < 2;
  scenarioStatus.textContent =
    locations.length === 0
      ? "Adicione locais ao mapa para configurar os cenários."
      : scenarios.length < 2
        ? "Configure pelo menos dois cenários para compará-los."
        : "Escolha um local, uma data e um horário para cada cenário.";
}

function renderComparison(first, second) {
  const latitudeDifference = second.latitude - first.latitude;
  const longitudeDifference =
    ((second.longitude - first.longitude + 540) % 360) - 180;
  const firstCoordinates = normalizeSelenographicCoordinates(
    first.latitude,
    first.longitude,
  );
  const secondCoordinates = normalizeSelenographicCoordinates(
    second.latitude,
    second.longitude,
  );
  const firstLatitude = (firstCoordinates.latitude * Math.PI) / 180;
  const secondLatitude = (secondCoordinates.latitude * Math.PI) / 180;
  const latitudeDelta =
    ((secondCoordinates.latitude - firstCoordinates.latitude) * Math.PI) / 180;
  const normalizedLongitudeDifference =
    ((secondCoordinates.longitude - firstCoordinates.longitude + 540) % 360) -
    180;
  const longitudeDelta = (normalizedLongitudeDifference * Math.PI) / 180;
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(firstLatitude) *
      Math.cos(secondLatitude) *
      Math.sin(longitudeDelta / 2) ** 2;
  const centralAngle =
    2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
  const distanceKm = lunarRadiusKm * centralAngle;

  document.querySelector("#result-first").textContent =
    `${first.name}: ${formatCoordinate(first.latitude)} latitude, ${formatCoordinate(first.longitude)} longitude`;
  document.querySelector("#result-second").textContent =
    `${second.name}: ${formatCoordinate(second.latitude)} latitude, ${formatCoordinate(second.longitude)} longitude`;
  document.querySelector("#result-latitude").textContent =
    `${latitudeDifference >= 0 ? "+" : ""}${formatCoordinate(latitudeDifference)}`;
  document.querySelector("#result-longitude").textContent =
    `${longitudeDifference >= 0 ? "+" : ""}${formatCoordinate(longitudeDifference)}`;
  document.querySelector("#result-distance").textContent =
    `${distanceKm.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} km`;
  comparisonResult.hidden = false;
}

function renderScenarioResults() {
  scenarioMetrics.replaceChildren();

  scenarios.forEach((scenario, index) => {
    const location = locations.find(
      (item) => item.id === scenario.locationId,
    );
    if (!location) return;
    const card = document.createElement("article");
    card.className = "scenario-metric-card";

    const title = document.createElement("h4");
    title.textContent = `Cenário ${index + 1}`;
    const details = document.createElement("p");
    details.className = "scenario-metric-location";
    const plannedDate = new Date(`${scenario.date}T${scenario.time}:00Z`);
    plannedDate.setUTCDate(plannedDate.getUTCDate() + scenario.delayDays);
    const baseDateLabel = new Date(
      `${scenario.date}T${scenario.time}:00Z`,
    ).toLocaleString("pt-BR", { timeZone: "UTC" });
    const delayedDateLabel = plannedDate.toLocaleString("pt-BR", {
      timeZone: "UTC",
    });
    details.textContent =
      `${location.name} · Base: ${baseDateLabel} UTC · Atraso: ${scenario.delayDays} dias · Nova data: ${delayedDateLabel} UTC`;

    const metrics = document.createElement("dl");
    metrics.className = "scenario-metric-list";
    [
      "Elevação do Sol",
      "Elevação da Terra",
      "Horas de iluminação",
      "Janelas de comunicação",
    ].forEach((label) => {
      const row = document.createElement("div");
      const term = document.createElement("dt");
      term.textContent = label;
      const value = document.createElement("dd");
      value.textContent = "—";
      row.append(term, value);
      metrics.append(row);
    });

    const status = document.createElement("p");
    status.className = "scenario-data-status";
    status.textContent = "Aguardando conexão com dados de efemérides.";
    card.append(title, details, metrics, status);
    scenarioMetrics.append(card);
  });

  scenarioResults.hidden = false;
}

function drawMap() {
  context.clearRect(0, 0, canvasWidth, canvasHeight);
  context.fillStyle = "#0b1422";
  context.fillRect(0, 0, canvasWidth, canvasHeight);

  if (lunarMapImage.complete && lunarMapImage.naturalWidth > 0) {
    context.drawImage(
      lunarMapImage,
      36,
      46,
      1470,
      735,
      originX - 180 * pixelsPerDegree,
      originY - 90 * pixelsPerDegree,
      360 * pixelsPerDegree,
      180 * pixelsPerDegree,
    );
    context.fillStyle = "rgb(5 12 23 / 18%)";
    context.fillRect(0, 0, canvasWidth, canvasHeight);
  }

  const firstVerticalLine = Math.ceil(-originX / gridStep);
  for (let index = firstVerticalLine; ; index += 1) {
    const x = originX + index * gridStep;
    if (x > canvasWidth) break;

    const majorLine = index % 2 === 0;
    context.beginPath();
    context.strokeStyle = majorLine
      ? "rgb(39 58 84 / 52%)"
      : "rgb(24 40 60 / 42%)";
    context.lineWidth = majorLine ? 1 : 0.7;
    context.moveTo(x, 0);
    context.lineTo(x, canvasHeight);
    context.stroke();
  }

  const firstHorizontalLine = Math.ceil(-originY / gridStep);
  for (let index = firstHorizontalLine; ; index += 1) {
    const y = originY + index * gridStep;
    if (y > canvasHeight) break;

    const majorLine = index % 2 === 0;
    context.beginPath();
    context.strokeStyle = majorLine
      ? "rgb(39 58 84 / 52%)"
      : "rgb(24 40 60 / 42%)";
    context.lineWidth = majorLine ? 1 : 0.7;
    context.moveTo(0, y);
    context.lineTo(canvasWidth, y);
    context.stroke();
  }

  context.font = "12px Segoe UI, Arial, sans-serif";
  context.fillStyle = "#9eafc6";

  if (originY >= 0 && originY <= canvasHeight) {
    context.beginPath();
    context.strokeStyle = "#83a9da";
    context.lineWidth = 1.5;
    context.moveTo(0, originY);
    context.lineTo(canvasWidth, originY);
    context.stroke();

    const start = Math.ceil(-originX / (gridStep * 6));
    for (let index = start; ; index += 1) {
      const x = originX + index * gridStep * 6;
      if (x > canvasWidth) break;
      if (x < 0) continue;
      const longitude = index * 30;
      context.fillText(`${longitude}°`, x + 4, Math.min(originY + 17, canvasHeight - 5));
    }
  }

  if (originX >= 0 && originX <= canvasWidth) {
    context.beginPath();
    context.strokeStyle = "#83a9da";
    context.lineWidth = 1.5;
    context.moveTo(originX, 0);
    context.lineTo(originX, canvasHeight);
    context.stroke();

    const start = Math.ceil(-originY / (gridStep * 6));
    for (let index = start; ; index += 1) {
      const y = originY + index * gridStep * 6;
      if (y > canvasHeight) break;
      if (y < 0) continue;
      const latitude = -index * 30;
      context.fillText(`${latitude}°`, Math.min(originX + 6, canvasWidth - 38), y - 5);
    }
  }

  locations.forEach((location) => {
    const x = originX + location.longitude * pixelsPerDegree;
    const y = originY - location.latitude * pixelsPerDegree;
    if (x < -100 || x > canvasWidth + 100 || y < -30 || y > canvasHeight + 30) return;

    context.beginPath();
    context.arc(x, y, 6, 0, Math.PI * 2);
    context.fillStyle = location.color;
    context.fill();
    context.strokeStyle = "#fff1c8";
    context.lineWidth = 2;
    context.stroke();
    context.fillStyle = "#f5f7fb";
    context.font = "600 12px Segoe UI, Arial, sans-serif";
    context.fillText(location.name, x + 10, y - 9);
  });
}

function resizeCanvas() {
  const bounds = mapWrap.getBoundingClientRect();
  const pixelRatio = window.devicePixelRatio || 1;
  const nextWidth = bounds.width;
  const nextHeight = bounds.height;
  if (canvasWidth === 0 && canvasHeight === 0) {
    originX = nextWidth / 2;
    originY = nextHeight / 2;
  } else {
    originX += (nextWidth - canvasWidth) / 2;
    originY += (nextHeight - canvasHeight) / 2;
  }
  canvasWidth = nextWidth;
  canvasHeight = nextHeight;
  basePixelsPerDegree = Math.min(
    2.5,
    Math.max(1, (canvasHeight - 48) / 180),
    canvasWidth / 360,
  );
  pixelsPerDegree = basePixelsPerDegree * zoomLevel;
  gridStep = 5 * pixelsPerDegree;
  canvas.width = Math.round(canvasWidth * pixelRatio);
  canvas.height = Math.round(canvasHeight * pixelRatio);
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

  drawMap();
}

canvas.addEventListener(
  "wheel",
  (event) => {
    event.preventDefault();
    const bounds = canvas.getBoundingClientRect();
    const pointerX = event.clientX - bounds.left;
    const pointerY = event.clientY - bounds.top;
    const nextZoomLevel = Math.min(
      maximumZoomLevel,
      Math.max(
        minimumZoomLevel,
        zoomLevel * Math.exp(-event.deltaY * 0.001),
      ),
    );

    if (nextZoomLevel === zoomLevel) return;

    const zoomFactor = nextZoomLevel / zoomLevel;
    originX = pointerX - (pointerX - originX) * zoomFactor;
    originY = pointerY - (pointerY - originY) * zoomFactor;
    zoomLevel = nextZoomLevel;
    pixelsPerDegree = basePixelsPerDegree * zoomLevel;
    gridStep = 5 * pixelsPerDegree;
    drawMap();
  },
  { passive: false },
);

canvas.addEventListener("pointerdown", (event) => {
  if (event.button !== 0) return;
  dragMoved = false;
  dragStart = {
    pointerX: event.clientX,
    pointerY: event.clientY,
    originX,
    originY,
  };
  canvas.setPointerCapture(event.pointerId);
});

canvas.addEventListener("pointermove", (event) => {
  if (!dragStart) return;
  if (
    Math.abs(event.clientX - dragStart.pointerX) > 3 ||
    Math.abs(event.clientY - dragStart.pointerY) > 3
  ) {
    dragMoved = true;
  }
  originX = dragStart.originX + event.clientX - dragStart.pointerX;
  originY = dragStart.originY + event.clientY - dragStart.pointerY;
  drawMap();
});

function finishDragging() {
  dragStart = null;
}

canvas.addEventListener("pointerup", finishDragging);
canvas.addEventListener("pointercancel", finishDragging);

function cancelMapSelection() {
  selectingLocationOnMap = false;
  canvas.classList.remove("is-selecting");
  locationPickHelp.textContent =
    "Escolha as coordenadas no mapa ou informe os valores acima.";
}

canvas.addEventListener("click", (event) => {
  if (!selectingLocationOnMap || dragMoved) {
    dragMoved = false;
    return;
  }

  const bounds = canvas.getBoundingClientRect();
  const x = event.clientX - bounds.left;
  const y = event.clientY - bounds.top;
  const mapLeft = originX - 180 * pixelsPerDegree;
  const mapTop = originY - 90 * pixelsPerDegree;
  const mapRight = originX + 180 * pixelsPerDegree;
  const mapBottom = originY + 90 * pixelsPerDegree;

  if (x < mapLeft || x > mapRight || y < mapTop || y > mapBottom) {
    mapStatus.textContent = "Clique dentro da área do mapa lunar para escolher o local.";
    return;
  }

  const latitude = (originY - y) / pixelsPerDegree;
  const longitude = (x - originX) / pixelsPerDegree;
  locationLatitudeInput.value = latitude.toFixed(4);
  locationLongitudeInput.value = longitude.toFixed(4);
  cancelMapSelection();
  mapStatus.textContent =
    `Coordenadas selecionadas: latitude ${latitude.toFixed(4)}°, longitude ${longitude.toFixed(4)}°.`;
  openDrawer(locationDrawer, addLocationButton, locationNameInput);
});

function openDrawer(drawer, trigger, firstInput) {
  cancelMapSelection();
  activeDrawer = drawer;
  activeTrigger = trigger;
  drawer.classList.add("is-open");
  drawer.setAttribute("aria-hidden", "false");
  drawer.inert = false;
  trigger.setAttribute("aria-expanded", "true");
  drawerBackdrop.hidden = false;
  requestAnimationFrame(() => drawerBackdrop.classList.add("is-visible"));
  firstInput.focus();
}

function closeDrawer() {
  if (!activeDrawer) return;

  const drawer = activeDrawer;
  const trigger = activeTrigger;
  drawer.classList.remove("is-open");
  drawer.setAttribute("aria-hidden", "true");
  drawer.inert = true;
  trigger.setAttribute("aria-expanded", "false");
  drawerBackdrop.classList.remove("is-visible");
  window.setTimeout(() => {
    if (!activeDrawer) drawerBackdrop.hidden = true;
  }, 240);
  activeDrawer = null;
  activeTrigger = null;
  trigger.focus();
}

addLocationButton.addEventListener("click", () => {
  locationForm.reset();
  locationColorInput.value = "#ffcc70";
  mapStatus.textContent = "";
  openDrawer(locationDrawer, addLocationButton, locationNameInput);
});
closeLocationButton.addEventListener("click", closeDrawer);
selectLocationOnMapButton.addEventListener("click", () => {
  closeDrawer();
  selectingLocationOnMap = true;
  canvas.classList.add("is-selecting");
  locationPickHelp.textContent =
    "Clique no mapa para escolher as coordenadas. Pressione Esc para cancelar.";
  mapStatus.textContent =
    "Selecione uma posição na superfície lunar clicando no mapa.";
  canvas.focus({ preventScroll: true });
});
openComparisonButton.addEventListener("click", () => {
  updateLocationOptions();
  comparisonResult.hidden = true;
  openDrawer(comparisonDrawer, openComparisonButton, firstLocationSelect);
});
closeComparisonButton.addEventListener("click", closeDrawer);
openDeleteButton.addEventListener("click", () => {
  updateLocationOptions();
  deleteConfirmation.hidden = true;
  pendingDeleteId = null;
  openDrawer(deleteDrawer, openDeleteButton, deleteLocationSelect);
});
closeDeleteButton.addEventListener("click", closeDrawer);
drawerBackdrop.addEventListener("click", closeDrawer);

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && activeDrawer) closeDrawer();
  else if (event.key === "Escape" && selectingLocationOnMap) {
    cancelMapSelection();
    mapStatus.textContent = "Seleção no mapa cancelada.";
    addLocationButton.focus();
  }
});

locationForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!locationForm.reportValidity()) return;

  const formData = new FormData(locationForm);
  const location = {
    id: makeLocationId(),
    name: formData.get("name").trim(),
    latitude: Number(formData.get("latitude")),
    longitude: Number(formData.get("longitude")),
    color: formData.get("color"),
  };
  locations.push(location);
  saveLocations();
  updateLocationOptions();
  drawMap();
  locationForm.reset();
  closeDrawer();
});

comparisonForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!comparisonForm.reportValidity()) return;

  const first = locations.find(
    (location) => location.id === firstLocationSelect.value,
  );
  const second = locations.find(
    (location) => location.id === secondLocationSelect.value,
  );
  if (!first || !second) {
    mapStatus.textContent = "Selecione duas localizações válidas para comparar.";
    return;
  }
  if (first.id === second.id) {
    secondLocationSelect.setCustomValidity(
      "Escolha uma localização diferente da primeira.",
    );
    secondLocationSelect.reportValidity();
    return;
  }

  secondLocationSelect.setCustomValidity("");
  renderComparison(first, second);
});

secondLocationSelect.addEventListener("change", () => {
  secondLocationSelect.setCustomValidity("");
});

addScenarioButton.addEventListener("click", () => {
  if (scenarios.length >= 4) return;
  scenarios.push(createScenario());
  scenarioResultsVisible = false;
  scenarioResults.hidden = true;
  saveScenarioState();
  renderScenarioCards();
  scenarioList.lastElementChild
    ?.querySelector("select")
    .focus();
});

compareScenariosButton.addEventListener("click", () => {
  if (scenarios.length < 2) {
    scenarioStatus.textContent = "Configure pelo menos dois cenários para compará-los.";
    return;
  }

  for (const [index, scenario] of scenarios.entries()) {
    const missingField =
      !scenario.locationId
        ? "select"
        : !scenario.date
          ? 'input[type="date"]'
          : !scenario.time
            ? 'input[type="time"]'
            : null;
    if (missingField) {
      scenarioStatus.textContent =
        `Preencha a localização, a data e o horário do cenário ${index + 1}.`;
      scenarioList.children[index].querySelector(missingField).focus();
      return;
    }
  }

  renderScenarioResults();
  scenarioResultsVisible = true;
  saveScenarioState();
  scenarioStatus.textContent =
    "Parâmetros selecionados. Métricas aguardam uma fonte de efemérides.";
});

deleteForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!deleteForm.reportValidity()) return;

  const selectedLocation = locations.find(
    (location) => location.id === deleteLocationSelect.value,
  );
  if (!selectedLocation) {
    mapStatus.textContent = "Selecione uma localização válida para excluir.";
    return;
  }

  pendingDeleteId = selectedLocation.id;
  deleteSummary.textContent =
    `${selectedLocation.name} — latitude ${formatCoordinate(selectedLocation.latitude)}, longitude ${formatCoordinate(selectedLocation.longitude)}.`;
  deleteConfirmation.hidden = false;
  confirmDeleteButton.focus();
});

confirmDeleteButton.addEventListener("click", () => {
  const locationIndex = locations.findIndex(
    (location) => location.id === pendingDeleteId,
  );
  if (locationIndex === -1) {
    mapStatus.textContent =
      "A localização selecionada não foi encontrada. Atualize a lista e tente novamente.";
    deleteConfirmation.hidden = true;
    pendingDeleteId = null;
    return;
  }

  const [deletedLocation] = locations.splice(locationIndex, 1);
  const saved = saveLocations();
  updateLocationOptions();
  drawMap();
  comparisonResult.hidden = true;
  deleteForm.reset();
  deleteConfirmation.hidden = true;
  pendingDeleteId = null;
  mapStatus.textContent = saved
    ? `Localização "${deletedLocation.name}" excluída.`
    : `Localização "${deletedLocation.name}" removida desta sessão, mas não foi possível salvar a alteração.`;
  closeDrawer();
});

cancelDeleteButton.addEventListener("click", () => {
  pendingDeleteId = null;
  deleteConfirmation.hidden = true;
  deleteLocationSelect.focus();
});

new ResizeObserver(resizeCanvas).observe(mapWrap);
updateLocationOptions();
if (
  scenarioResultsVisible &&
  scenarios.length >= 2 &&
  scenarios.every(
    (scenario) =>
      scenario.locationId &&
      scenario.date &&
      scenario.time &&
      locations.some((location) => location.id === scenario.locationId),
  )
) {
  renderScenarioResults();
} else {
  scenarioResultsVisible = false;
  scenarioResults.hidden = true;
}
drawMap();
