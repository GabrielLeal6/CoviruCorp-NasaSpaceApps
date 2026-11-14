import { requestApi } from "./api.js";
import {
  createLunarGlobe,
  LUNAR_TEXTURE_CROP,
} from "./lunar-globe.js";

const canvas = document.querySelector("#lunar-map");
const context = canvas.getContext("2d");
const globeCanvas = document.querySelector("#lunar-globe");
const globeStatus = document.querySelector("#globe-status");
const show2dMapButton = document.querySelector("#show-2d-map");
const show3dGlobeButton = document.querySelector("#show-3d-globe");
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
const globeReadyMessage =
  "Global LOLA DEM (~7.58 km per source pixel) sampled on a 0.5° mesh; vertical relief exaggerated 8x. Drag to rotate and scroll to zoom.";
const presetSites = [
  {
    id: "site_01",
    siteId: "site_01",
    name: "Connecting Ridge (Candidate)",
    latitude: -89.53,
    longitude: -150.05,
    color: "#ffcc70",
  },
  {
    id: "site_02",
    siteId: "site_02",
    name: "Peak Near Shackleton (Candidate)",
    latitude: -88.81,
    longitude: 123.76,
    color: "#70ccff",
  },
  {
    id: "site_03",
    siteId: "site_03",
    name: "Malapert Massif (Candidate)",
    latitude: -86,
    longitude: 0,
    color: "#a6ffcb",
  },
];
const siteThreePreset = presetSites[2];
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
let lunarGlobe = null;

lunarMapImage.addEventListener("load", drawMap);
lunarMapImage.addEventListener("error", () => {
  mapStatus.textContent =
    "Could not load the lunar map image. Check that moon-global.png is in the resources/moon folder.";
});
lunarMapImage.src = "../moon/moon-global.png";

function isValidLocation(location) {
  return (
    location !== null &&
    typeof location === "object" &&
    typeof location.id === "string" &&
    typeof location.name === "string" &&
    location.name.trim().length > 0 &&
    location.name.length <= 40 &&
    (location.siteId === undefined || typeof location.siteId === "string") &&
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

function isValidScenarioResult(result) {
  const metrics = result?.metrics;
  return (
    result !== null &&
    typeof result === "object" &&
    typeof result.id === "string" &&
    result.site !== null &&
    typeof result.site === "object" &&
    Number.isFinite(result.site.lat) &&
    Number.isFinite(result.site.lon) &&
    metrics !== null &&
    typeof metrics === "object" &&
    Number.isFinite(metrics.sun_illumination_pct) &&
    Number.isFinite(metrics.earth_visibility_pct) &&
    Number.isFinite(metrics.longest_dark_h) &&
    Number.isFinite(metrics.longest_no_earth_h) &&
    Array.isArray(metrics.sun_windows) &&
    metrics.sun_windows.every(
      (window) =>
        window !== null &&
        typeof window === "object" &&
        Number.isFinite(window.hours),
    ) &&
    Array.isArray(metrics.earth_windows) &&
    metrics.earth_windows.every(
      (window) =>
        window !== null &&
        typeof window === "object" &&
        Number.isFinite(window.hours),
    ) &&
    Array.isArray(result.warnings) &&
    result.warnings.every((warning) => typeof warning === "string")
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
      typeof parsedState.resultsVisible !== "boolean" ||
      (parsedState.results !== undefined &&
        parsedState.results !== null &&
        (!Array.isArray(parsedState.results) ||
          !parsedState.results.every(isValidScenarioResult)))
    ) {
      throw new TypeError("The saved scenario data has an invalid format.");
    }

    return parsedState;
  } catch (error) {
    console.error("Could not load saved scenarios.", error);
    mapStatus.textContent =
      "Could not load saved scenarios in this browser.";
    return null;
  }
}

const savedScenarioState = loadScenarioState();
const scenarios = savedScenarioState?.scenarios ?? [
  { id: 1, locationId: presetSites[0].id, date: "", time: "", delayDays: 0 },
  { id: 2, locationId: presetSites[1].id, date: "", time: "", delayDays: 0 },
  { id: 3, locationId: siteThreePreset.id, date: "", time: "", delayDays: 0 },
];
let scenarioListMigrated = false;
while (scenarios.length < 3) {
  const nextId = scenarios.reduce(
    (highestId, scenario) => Math.max(highestId, scenario.id),
    0,
  ) + 1;
  scenarios.push({
    id: nextId,
    locationId: siteThreePreset.id,
    date: "",
    time: "",
    delayDays: 0,
  });
  scenarioListMigrated = true;
}
scenarios.forEach((scenario) => {
  scenario.delayDays ??= 0;
});
let scenarioSequence = scenarios.reduce(
  (highestId, scenario) => Math.max(highestId, scenario.id),
  0,
);
let scenarioResultsVisible = savedScenarioState?.resultsVisible ?? false;
let scenarioResultsData = savedScenarioState?.results ?? null;
if (scenarioListMigrated) {
  scenarioResultsVisible = false;
  scenarioResultsData = null;
}

function saveScenarioState() {
  try {
    localStorage.setItem(
      scenarioStorageKey,
      JSON.stringify({
        scenarios,
        resultsVisible: scenarioResultsVisible,
        results: scenarioResultsData,
      }),
    );
    return true;
  } catch (error) {
    console.error("Could not save scenarios in this browser.", error);
    mapStatus.textContent =
      "Scenario changes were not saved; try again in this browser.";
    return false;
  }
}

function invalidateScenarioResults() {
  scenarioResultsVisible = false;
  scenarioResultsData = null;
  scenarioResults.hidden = true;
}

function loadLocations() {
  try {
    const savedLocations = localStorage.getItem(storageKey);
    if (savedLocations === null) return presetSites.map((site) => ({ ...site }));

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
          (location.siteId === undefined || typeof location.siteId === "string") &&
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
      throw new TypeError("The saved location data has an invalid format.");
    }

    const normalizedLocations = parsedLocations.map((location) => ({
      ...location,
      ...normalizeSelenographicCoordinates(location.latitude, location.longitude),
      color: location.color ?? "#ffcc70",
    }));
    for (const preset of presetSites) {
      const presetIndex = normalizedLocations.findIndex(
        (location) =>
          location.id === preset.id || location.siteId === preset.siteId,
      );
      if (presetIndex === -1) {
        normalizedLocations.push({ ...preset });
        continue;
      }

      const existingPreset = normalizedLocations[presetIndex];
      normalizedLocations[presetIndex] = {
        ...existingPreset,
        ...preset,
        id: existingPreset.id,
        color: existingPreset.color ?? preset.color,
      };
    }

    const needsMigration =
      normalizedLocations.length !== parsedLocations.length ||
      normalizedLocations.some(
        (location, index) =>
          index >= parsedLocations.length ||
          location.latitude !== parsedLocations[index].latitude ||
          location.longitude !== parsedLocations[index].longitude ||
          location.color !== parsedLocations[index].color ||
          location.siteId !== parsedLocations[index].siteId,
      );

    if (needsMigration) {
      try {
        localStorage.setItem(storageKey, JSON.stringify(normalizedLocations));
      } catch (error) {
        console.error("Could not save location presets or normalized coordinates.", error);
        mapStatus.textContent =
          "Location presets or older coordinates were adjusted for this session but could not be saved in the browser.";
      }
    }

    return normalizedLocations;
  } catch (error) {
    console.error("Could not load saved locations.", error);
    mapStatus.textContent =
      "Could not load saved locations in this browser.";
    return presetSites.map((site) => ({ ...site }));
  }
}

function saveLocations() {
  try {
    localStorage.setItem(storageKey, JSON.stringify(locations));
    mapStatus.textContent = "";
    return true;
  } catch (error) {
    console.error("Could not save locations in this browser.", error);
    mapStatus.textContent =
      "Location added for this session only; it could not be saved in the browser.";
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
    select.replaceChildren(new Option("Select a location", ""));

    const availableLocations =
      select === deleteLocationSelect
        ? locations.filter((location) => !location.siteId)
        : locations;
    availableLocations.forEach((location) => {
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
      ? "Add at least two locations to the map to compare them."
      : "Choose two different locations to see their coordinates and approximate distance.";
  const deletableLocations = locations.filter((location) => !location.siteId);
  deleteForm.querySelector("button[type='submit']").disabled =
    deletableLocations.length === 0;
  deleteHelp.textContent =
    deletableLocations.length === 0
      ? "There are no user-added locations to delete."
      : "Select a user-added location to remove.";
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
    invalidateScenarioResults();
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
    title.textContent = `Scenario ${index + 1}`;
    const removeButton = document.createElement("button");
    removeButton.className = "scenario-remove-button";
    removeButton.type = "button";
    removeButton.textContent = "Remove";
    removeButton.setAttribute("aria-label", `Remove scenario ${index + 1}`);
    removeButton.addEventListener("click", () => {
      scenarios.splice(index, 1);
      invalidateScenarioResults();
      saveScenarioState();
      renderScenarioCards();
    });
    header.append(title, removeButton);

    const fields = document.createElement("div");
    fields.className = "scenario-fields";

    const siteId = `scenario-location-${scenario.id}`;
    const siteLabel = document.createElement("label");
    siteLabel.htmlFor = siteId;
    siteLabel.textContent = "Location";
    const siteSelect = document.createElement("select");
    siteSelect.id = siteId;
    siteSelect.required = true;
    siteSelect.add(new Option("Select a location", ""));
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
      invalidateScenarioResults();
      saveScenarioState();
    });

    const dateId = `scenario-date-${scenario.id}`;
    const dateLabel = document.createElement("label");
    dateLabel.htmlFor = dateId;
    dateLabel.textContent = "Date";
    const dateInput = document.createElement("input");
    dateInput.id = dateId;
    dateInput.type = "date";
    dateInput.required = true;
    dateInput.value = scenario.date;
    dateInput.addEventListener("change", () => {
      scenario.date = dateInput.value;
      invalidateScenarioResults();
      saveScenarioState();
    });
    dateInput.addEventListener("input", () => {
      scenario.date = dateInput.value;
      invalidateScenarioResults();
      saveScenarioState();
    });

    const timeId = `scenario-time-${scenario.id}`;
    const timeLabel = document.createElement("label");
    timeLabel.htmlFor = timeId;
    timeLabel.textContent = "Time (UTC)";
    const timeInput = document.createElement("input");
    timeInput.id = timeId;
    timeInput.type = "time";
    timeInput.required = true;
    timeInput.value = scenario.time;
    timeInput.addEventListener("change", () => {
      scenario.time = timeInput.value;
      invalidateScenarioResults();
      saveScenarioState();
    });
    timeInput.addEventListener("input", () => {
      scenario.time = timeInput.value;
      invalidateScenarioResults();
      saveScenarioState();
    });

    const delayId = `scenario-delay-${scenario.id}`;
    const delayHeader = document.createElement("div");
    delayHeader.className = "scenario-delay-header";
    const delayLabel = document.createElement("label");
    delayLabel.htmlFor = delayId;
    delayLabel.textContent = "Launch delay (days)";
    const delayValue = document.createElement("output");
    delayValue.htmlFor = delayId;
    delayValue.className = "scenario-delay-value";
    const updateDelayValue = () => {
      delayValue.textContent = `${scenario.delayDays} ${scenario.delayDays === 1 ? "day" : "days"}`;
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
      `Launch delay for scenario ${index + 1}, in days`,
    );
    delayInput.addEventListener("input", () => {
      scenario.delayDays = Number(delayInput.value);
      updateDelayValue();
      invalidateScenarioResults();
      saveScenarioState();
    });

    const delayScale = document.createElement("div");
    delayScale.className = "scenario-delay-scale";
    delayScale.setAttribute("aria-hidden", "true");
    delayScale.append(
      document.createElement("span"),
      document.createElement("span"),
    );
    delayScale.firstElementChild.textContent = "0 days";
    delayScale.lastElementChild.textContent = "30 days";

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
      ? "Add locations to the map to configure scenarios."
      : scenarios.length < 2
        ? "Configure at least two scenarios to compare them."
        : "Choose a location, date, and time for each scenario.";
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
    `${distanceKm.toLocaleString("en-US", { maximumFractionDigits: 2 })} km`;
  comparisonResult.hidden = false;
}

function formatWindowSummary(windows) {
  const totalHours = windows.reduce((total, window) => total + window.hours, 0);
  return `${windows.length} (${totalHours.toFixed(1)} h total)`;
}

function renderScenarioResults(results = scenarioResultsData) {
  if (
    !Array.isArray(results) ||
    results.length !== scenarios.length ||
    !results.every(isValidScenarioResult)
  ) {
    throw new TypeError("The API returned an invalid scenario comparison response.");
  }

  const resultsById = new Map(results.map((result) => [result.id, result]));
  if (scenarios.some((scenario) => !resultsById.has(String(scenario.id)))) {
    throw new TypeError("The API response does not match the requested scenarios.");
  }

  scenarioMetrics.replaceChildren();

  scenarios.forEach((scenario, index) => {
    const location = locations.find(
      (item) => item.id === scenario.locationId,
    );
    const result = resultsById.get(String(scenario.id));
    if (!location || !result) {
      throw new TypeError("A scenario result could not be matched to its location.");
    }

    const card = document.createElement("article");
    card.className = "scenario-metric-card";

    const title = document.createElement("h4");
    title.textContent = `Scenario ${index + 1}`;
    const details = document.createElement("p");
    details.className = "scenario-metric-location";
    const plannedDate = new Date(`${scenario.date}T${scenario.time}:00Z`);
    plannedDate.setUTCDate(plannedDate.getUTCDate() + scenario.delayDays);
    const baseDateLabel = new Date(
      `${scenario.date}T${scenario.time}:00Z`,
    ).toLocaleString("en-US", { timeZone: "UTC" });
    const delayedDateLabel = plannedDate.toLocaleString("en-US", {
      timeZone: "UTC",
    });
    details.textContent =
      `${location.name} · Base: ${baseDateLabel} UTC · Delay: ${scenario.delayDays} days · New date: ${delayedDateLabel} UTC`;

    const metrics = document.createElement("dl");
    metrics.className = "scenario-metric-list";
    [
      ["Sun illumination", `${result.metrics.sun_illumination_pct.toFixed(1)}%`],
      ["Earth visibility", `${result.metrics.earth_visibility_pct.toFixed(1)}%`],
      ["Sun windows", formatWindowSummary(result.metrics.sun_windows)],
      ["Communication windows", formatWindowSummary(result.metrics.earth_windows)],
      ["Longest dark period", `${result.metrics.longest_dark_h.toFixed(1)} h`],
      ["Longest communication blackout", `${result.metrics.longest_no_earth_h.toFixed(1)} h`],
    ].forEach(([label, metricValue]) => {
      const row = document.createElement("div");
      const term = document.createElement("dt");
      term.textContent = label;
      const value = document.createElement("dd");
      value.textContent = metricValue;
      row.append(term, value);
      metrics.append(row);
    });

    const status = document.createElement("p");
    status.className = "scenario-data-status";
    status.textContent =
      result.warnings.length > 0
        ? `Mock API result. ${result.warnings.join(" ")}`
        : "Mock API result.";
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
      LUNAR_TEXTURE_CROP.x,
      LUNAR_TEXTURE_CROP.y,
      LUNAR_TEXTURE_CROP.width,
      LUNAR_TEXTURE_CROP.height,
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

function setMapView(view) {
  const is3d = view === "3d";
  canvas.hidden = is3d;
  globeCanvas.hidden = !is3d;
  globeStatus.hidden = !is3d;
  show2dMapButton.classList.toggle("is-active", !is3d);
  show2dMapButton.setAttribute("aria-pressed", String(!is3d));
  show3dGlobeButton.classList.toggle("is-active", is3d);
  show3dGlobeButton.setAttribute("aria-pressed", String(is3d));
}

show2dMapButton.addEventListener("click", () => {
  setMapView("2d");
});

show3dGlobeButton.addEventListener("click", async () => {
  setMapView("3d");
  globeStatus.textContent = lunarGlobe
    ? globeReadyMessage
    : "Loading the global LOLA elevation model and aligned lunar map texture...";

  if (lunarGlobe) {
    lunarGlobe.setLocations(locations);
    return;
  }

  show3dGlobeButton.disabled = true;
  try {
    lunarGlobe = await createLunarGlobe(globeCanvas);
    lunarGlobe.setLocations(locations);
    globeStatus.textContent = globeReadyMessage;
  } catch (error) {
    console.error("Could not load the 3D lunar terrain.", error);
    setMapView("2d");
    mapStatus.textContent =
      `Could not load the 3D lunar terrain: ${error instanceof Error ? error.message : String(error)}`;
  } finally {
    show3dGlobeButton.disabled = false;
  }
});

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
  originY = dragStart.originY - (event.clientY - dragStart.pointerY);
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
  globeCanvas.classList.remove("is-selecting");
  locationPickHelp.textContent =
    "Choose coordinates on the map or enter the values above.";
}

function usePickedCoordinates(latitude, longitude) {
  locationLatitudeInput.value = latitude.toFixed(4);
  locationLongitudeInput.value = longitude.toFixed(4);
  cancelMapSelection();
  mapStatus.textContent =
    `Coordinates selected: latitude ${latitude.toFixed(4)}°, longitude ${longitude.toFixed(4)}°.`;
  openDrawer(locationDrawer, addLocationButton, locationNameInput);
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
    mapStatus.textContent = "Click inside the lunar map area to choose a location.";
    return;
  }

  const latitude = (originY - y) / pixelsPerDegree;
  const longitude = (x - originX) / pixelsPerDegree;
  usePickedCoordinates(latitude, longitude);
});

globeCanvas.addEventListener("click", (event) => {
  if (!selectingLocationOnMap) return;
  if (!lunarGlobe) {
    mapStatus.textContent = "Wait for the 3D terrain to finish loading, then select a point.";
    return;
  }

  const coordinates = lunarGlobe.pickCoordinates(event.clientX, event.clientY);
  if (coordinates === undefined) return;
  if (coordinates === null) {
    mapStatus.textContent = "Click on the visible lunar surface to choose a location.";
    return;
  }

  usePickedCoordinates(coordinates.latitude, coordinates.longitude);
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
  const selectionCanvas = globeCanvas.hidden ? canvas : globeCanvas;
  selectionCanvas.classList.add("is-selecting");
  locationPickHelp.textContent =
    "Click the map to choose coordinates. Press Esc to cancel.";
  mapStatus.textContent =
    "Select a position on the lunar surface by clicking the map.";
  selectionCanvas.focus({ preventScroll: true });
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
    mapStatus.textContent = "Map selection canceled.";
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
  lunarGlobe?.setLocations(locations);
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
    mapStatus.textContent = "Select two valid locations to compare.";
    return;
  }
  if (first.id === second.id) {
    secondLocationSelect.setCustomValidity(
      "Choose a location different from the first one.",
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
  invalidateScenarioResults();
  saveScenarioState();
  renderScenarioCards();
  scenarioList.lastElementChild
    ?.querySelector("select")
    .focus();
});

function buildScenarioComparisonRequest() {
  return scenarios.map((scenario) => {
    const location = locations.find(
      (item) => item.id === scenario.locationId,
    );
    if (!location) {
      throw new Error(`Location for scenario ${scenario.id} was not found.`);
    }

    const startDate = new Date(`${scenario.date}T${scenario.time}:00Z`);
    if (!Number.isFinite(startDate.getTime())) {
      throw new Error(`Date or time for scenario ${scenario.id} is invalid.`);
    }
    startDate.setUTCDate(startDate.getUTCDate() + scenario.delayDays);

    return {
      id: String(scenario.id),
      site: location.siteId
        ? { site_id: location.siteId }
        : { lat: location.latitude, lon: location.longitude },
      start_utc: startDate.toISOString(),
    };
  });
}

function getStoredScenarioResults(results) {
  return results.map((result) => ({
    id: result.id,
    site: {
      lat: result.site.lat,
      lon: result.site.lon,
    },
    metrics: {
      sun_illumination_pct: result.metrics.sun_illumination_pct,
      earth_visibility_pct: result.metrics.earth_visibility_pct,
      longest_dark_h: result.metrics.longest_dark_h,
      longest_no_earth_h: result.metrics.longest_no_earth_h,
      sun_windows: result.metrics.sun_windows.map(({ hours }) => ({ hours })),
      earth_windows: result.metrics.earth_windows.map(({ hours }) => ({ hours })),
    },
    warnings: result.warnings,
  }));
}

compareScenariosButton.addEventListener("click", async () => {
  if (scenarios.length < 2) {
    scenarioStatus.textContent = "Configure at least two scenarios to compare them.";
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
        `Complete the location, date, and time for scenario ${index + 1}.`;
      scenarioList.children[index].querySelector(missingField).focus();
      return;
    }
  }

  const requestState = JSON.stringify({ scenarios, locations });
  invalidateScenarioResults();
  compareScenariosButton.disabled = true;
  addScenarioButton.disabled = true;
  scenarioList.inert = true;
  scenarioStatus.textContent = "Analyzing scenarios with the mock API...";

  try {
    const response = await requestApi("/api/v1/compare", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scenarios: buildScenarioComparisonRequest(),
      }),
    });

    if (requestState !== JSON.stringify({ scenarios, locations })) {
      scenarioStatus.textContent =
        "Scenario inputs changed during analysis. Compare them again.";
      return;
    }

    if (!Array.isArray(response.scenarios)) {
      throw new TypeError("The API returned an invalid scenario comparison response.");
    }
    scenarioResultsData = getStoredScenarioResults(response.scenarios);
    renderScenarioResults(scenarioResultsData);
    scenarioResultsVisible = true;
    saveScenarioState();
    scenarioStatus.textContent = "Scenario analysis completed using mock API data.";
  } catch (error) {
    console.error("Scenario comparison request failed.", error);
    invalidateScenarioResults();
    saveScenarioState();
    scenarioStatus.textContent =
      `Scenario comparison failed: ${error instanceof Error ? error.message : String(error)}`;
  } finally {
    scenarioList.inert = false;
    addScenarioButton.disabled = scenarios.length >= 4;
    compareScenariosButton.disabled = scenarios.length < 2;
  }
});

deleteForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!deleteForm.reportValidity()) return;

  const selectedLocation = locations.find(
    (location) => location.id === deleteLocationSelect.value,
  );
  if (!selectedLocation || selectedLocation.siteId) {
    mapStatus.textContent = "Select a valid location to delete.";
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
      "The selected location was not found. Refresh the list and try again.";
    deleteConfirmation.hidden = true;
    pendingDeleteId = null;
    return;
  }

  const [deletedLocation] = locations.splice(locationIndex, 1);
  const saved = saveLocations();
  lunarGlobe?.setLocations(locations);
  updateLocationOptions();
  drawMap();
  comparisonResult.hidden = true;
  deleteForm.reset();
  deleteConfirmation.hidden = true;
  pendingDeleteId = null;
  mapStatus.textContent = saved
    ? `Location "${deletedLocation.name}" deleted.`
    : `Location "${deletedLocation.name}" removed for this session, but the change could not be saved.`;
  closeDrawer();
});

cancelDeleteButton.addEventListener("click", () => {
  pendingDeleteId = null;
  deleteConfirmation.hidden = true;
  deleteLocationSelect.focus();
});

new ResizeObserver(resizeCanvas).observe(mapWrap);
updateLocationOptions();
if (scenarioListMigrated) saveScenarioState();
if (
  scenarioResultsVisible &&
  Array.isArray(scenarioResultsData) &&
  scenarios.length >= 2 &&
  scenarios.every(
    (scenario) =>
      scenario.locationId &&
      scenario.date &&
      scenario.time &&
      locations.some((location) => location.id === scenario.locationId),
  )
) {
  try {
    renderScenarioResults();
  } catch (error) {
    console.error("Could not restore saved scenario results.", error);
    invalidateScenarioResults();
    scenarioStatus.textContent =
      `Could not restore saved scenario results: ${error.message}`;
  }
} else {
  invalidateScenarioResults();
}
drawMap();
