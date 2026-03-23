const MIN_YEAR = 1988;
const MAX_YEAR = 2016;
const YEARS = [1988, 1992, 1994, 1996, 1998, 2000, 2002, 2004, 2006, 2008, 2010, 2012, 2014, 2016];
const ALL_VALUE = "All";
const WORLD_GEO_URL = "data/world.geojson";

const state = {
  filters: {
    startYear: MIN_YEAR,
    endYear: MAX_YEAR,
    season: ALL_VALUE,
    medal: ALL_VALUE,
    sports: [ALL_VALUE]
  },
  selectedCountry: null,
  medalists: [],
  countryFeatures: [],
  availableSports: [],
  countryAliases: new Map(),
  mapLookup: new Map(),
  filteredRows: []
};

const mapDimensions = { width: 900, height: 540 };
const detailDimensions = {
  width: 420,
  minHeight: 420,
  margin: { top: 16, right: 18, bottom: 36, left: 150 }
};

const tooltip = d3.select("#tooltip");
const startYearSelect = d3.select("#start-year-select");
const endYearSelect = d3.select("#end-year-select");
const seasonSelect = d3.select("#season-select");
const medalSelect = d3.select("#medal-select");
const sportDropdown = d3.select("#sport-filter");
const sportDropdownButton = d3.select("#sport-dropdown-button");
const sportDropdownPanel = d3.select("#sport-dropdown-panel");
const resetFiltersButton = d3.select("#reset-filters-button");
const legendContainer = d3.select("#map-legend");
const detailEmptyState = d3.select("#detail-empty-state");

const mapSvg = d3.select("#map")
  .append("svg")
  .attr("viewBox", `0 0 ${mapDimensions.width} ${mapDimensions.height}`)
  .attr("role", "img")
  .attr("aria-label", "World map showing Olympic medal counts by country");

const mapLayer = mapSvg.append("g");

const detailSvg = d3.select("#detail-chart")
  .append("svg")
  .attr("viewBox", `0 0 ${detailDimensions.width} ${detailDimensions.minHeight}`)
  .attr("role", "img")
  .attr("aria-label", "Bar chart showing medal counts by sport for the selected country");

const detailChartLayer = detailSvg.append("g")
  .attr("transform", `translate(${detailDimensions.margin.left},${detailDimensions.margin.top})`);

const detailInnerWidth = detailDimensions.width - detailDimensions.margin.left - detailDimensions.margin.right;
let detailInnerHeight = detailDimensions.minHeight - detailDimensions.margin.top - detailDimensions.margin.bottom;

const xAxisGroup = detailChartLayer.append("g")
  .attr("class", "axis")
  .attr("transform", `translate(0,${detailInnerHeight})`);

const yAxisGroup = detailChartLayer.append("g")
  .attr("class", "axis");

const barsGroup = detailChartLayer.append("g");

const projection = d3.geoNaturalEarth1()
  .scale(165)
  .translate([mapDimensions.width / 2, mapDimensions.height / 2 + 28]);

const path = d3.geoPath().projection(projection);
const colorScale = d3.scaleSequential(d3.interpolateYlOrRd);

const aliasOverrides = new Map([
  ["United States of America", "USA"],
  ["United States", "USA"],
  ["Russian Federation", "Russia"],
  ["Korea, Republic of", "South Korea"],
  ["Korea, Dem. Rep.", "North Korea"],
  ["United Kingdom", "England"],
  ["UK", "England"],
  ["Czechia", "Czech Republic"],
  ["Slovak Republic", "Slovakia"],
  ["Viet Nam", "Vietnam"],
  ["Iran", "Iran"],
  ["Syrian Arab Republic", "Syria"],
  ["Republic of Moldova", "Moldova"],
  ["Democratic Republic of the Congo", "Democratic Republic of the Congo"],
  ["Dominican Rep.", "Dominican Republic"],
  ["Bosnia and Herz.", "Bosnia and Herzegovina"],
  ["Lao PDR", "Laos"],
  ["Central African Rep.", "Central African Republic"],
  ["United Republic of Tanzania", "Tanzania"],
  ["eSwatini", "Swaziland"],
  ["North Macedonia", "Macedonia"],
  ["Bahamas", "The Bahamas"],
  ["Serbia", "Republic of Serbia"],
  ["Trinidad", "Trinidad and Tobago"]
]);

initialize();

async function initialize() {
  populateStaticControls();

  const [athleteRows, regionRows, world] = await Promise.all([
    d3.csv("data/athlete_events.csv", d3.autoType),
    d3.csv("data/noc_regions.csv"),
    d3.json(WORLD_GEO_URL)
  ]);

  buildCountryAliasMap(regionRows);
  state.medalists = athleteRows
    .filter((d) => d.Medal && d.Medal !== "NA" && d.Year >= MIN_YEAR && d.Year <= MAX_YEAR)
    .map((d) => ({
      ...d,
      region: normalizeCountryName(state.countryAliases.get(d.NOC) || d.Team || d.NOC)
    }))
    .filter((d) => d.region);

  state.availableSports = Array.from(new Set(state.medalists.map((d) => d.Sport))).sort(d3.ascending);
  populateSportControl();

  state.countryFeatures = world.features.map((feature) => ({
    ...feature,
    normalizedName: normalizeCountryName(feature.properties.name)
  }));

  state.mapLookup = new Map(state.countryFeatures.map((feature) => [feature.normalizedName, feature]));

  drawMapBase();
  bindControls();
  updateVisualization();
}

function buildCountryAliasMap(regionRows) {
  regionRows.forEach((row) => {
    if (row.NOC && row.region) {
      state.countryAliases.set(row.NOC, row.region);
    }
  });
}

function normalizeCountryName(name) {
  if (!name) {
    return null;
  }

  const trimmed = name.trim();
  const alias = aliasOverrides.get(trimmed) || trimmed;
  return alias
    .replace(/\s*\(.*?\)\s*/g, " ")
    .replace(/&/g, "and")
    .replace(/[.'"]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function populateStaticControls() {
  startYearSelect.selectAll("option")
    .data(YEARS)
    .join("option")
    .attr("value", (d) => d)
    .property("selected", (d) => d === state.filters.startYear)
    .text((d) => d);

  endYearSelect.selectAll("option")
    .data(YEARS)
    .join("option")
    .attr("value", (d) => d)
    .property("selected", (d) => d === state.filters.endYear)
    .text((d) => d);
}

function populateSportControl() {
  const options = [ALL_VALUE, ...getAvailableSportsForSeason(state.filters.season)];
  const validSelections = state.filters.sports.filter((sport) => options.includes(sport));
  state.filters.sports = validSelections.length ? validSelections : [ALL_VALUE];
  renderSportDropdown(options);
  updateSportDropdownLabel();
}

function bindControls() {
  startYearSelect.on("change", (event) => {
    state.filters.startYear = Number(event.target.value);
    reconcileYearRange("start");
    updateVisualization();
  });

  endYearSelect.on("change", (event) => {
    state.filters.endYear = Number(event.target.value);
    reconcileYearRange("end");
    updateVisualization();
  });

  seasonSelect.on("change", (event) => {
    state.filters.season = event.target.value;
    populateSportControl();
    updateVisualization();
  });

  medalSelect.on("change", (event) => {
    state.filters.medal = event.target.value;
    updateVisualization();
  });

  sportDropdownButton.on("click", (event) => {
    event.stopPropagation();
    toggleSportDropdown();
  });

  resetFiltersButton.on("click", () => {
    resetFilters();
  });

  d3.select("body").on("click.sport-dropdown", (event) => {
    if (!sportDropdown.node().contains(event.target)) {
      closeSportDropdown();
    }
  });
}

function reconcileYearRange(changedBound) {
  const start = state.filters.startYear;
  const end = state.filters.endYear;

  if (start === ALL_VALUE || end === ALL_VALUE) {
    return;
  }

  if (start > end) {
    if (changedBound === "start") {
      state.filters.endYear = start;
      endYearSelect.property("value", String(start));
    } else {
      state.filters.startYear = end;
      startYearSelect.property("value", String(end));
    }
  }
}

function resetFilters() {
  state.filters.startYear = MIN_YEAR;
  state.filters.endYear = MAX_YEAR;
  state.filters.season = ALL_VALUE;
  state.filters.medal = ALL_VALUE;
  state.filters.sports = [ALL_VALUE];
  state.selectedCountry = null;

  startYearSelect.property("value", String(MIN_YEAR));
  endYearSelect.property("value", String(MAX_YEAR));
  seasonSelect.property("value", ALL_VALUE);
  medalSelect.property("value", ALL_VALUE);
  populateSportControl();
  closeSportDropdown();

  updateVisualization();
}

function renderSportDropdown(options) {
  const rows = sportDropdownPanel.selectAll(".multi-select-option")
    .data(options, (d) => d);

  const rowsEnter = rows.enter()
    .append("label")
    .attr("class", "multi-select-option");

  rowsEnter.append("input")
    .attr("type", "checkbox");

  rowsEnter.append("span");

  rows.merge(rowsEnter)
    .each(function bindOption(option) {
      const row = d3.select(this);
      row.select("input")
        .attr("value", option)
        .property("checked", state.filters.sports.includes(option))
        .on("click", (event) => {
          event.stopPropagation();
        })
        .on("change", (event) => {
          handleSportSelectionChange(option, event.target.checked);
        });

      row.select("span").text(option);
    });

  rows.exit().remove();
}

function handleSportSelectionChange(option, isChecked) {
  if (option === ALL_VALUE) {
    state.filters.sports = [ALL_VALUE];
  } else {
    const nextSports = new Set(state.filters.sports.filter((sport) => sport !== ALL_VALUE));

    if (isChecked) {
      nextSports.add(option);
    } else {
      nextSports.delete(option);
    }

    state.filters.sports = nextSports.size ? Array.from(nextSports).sort(d3.ascending) : [ALL_VALUE];
  }

  populateSportControl();
  updateVisualization();
}

function updateSportDropdownLabel() {
  const label = state.filters.sports.includes(ALL_VALUE)
    ? "All sports"
    : state.filters.sports.length === 1
      ? state.filters.sports[0]
      : `${state.filters.sports.length} sports selected`;

  sportDropdownButton.text(label);
}

function toggleSportDropdown() {
  const isOpen = sportDropdownPanel.classed("hidden");

  sportDropdownPanel.classed("hidden", !isOpen);
  sportDropdownButton.attr("aria-expanded", String(isOpen));
  sportDropdown.classed("open", isOpen);
}

function closeSportDropdown() {
  sportDropdownPanel.classed("hidden", true);
  sportDropdownButton.attr("aria-expanded", "false");
  sportDropdown.classed("open", false);
}

function drawMapBase() {
  mapSvg.on("click", (event) => {
    if (event.target.tagName !== "path") {
      state.selectedCountry = null;
      updateVisualization();
    }
  });

  mapLayer.selectAll("path")
    .data(state.countryFeatures)
    .join("path")
    .attr("class", "map-country")
    .attr("d", path)
    .attr("fill", "var(--map-base)")
    .attr("stroke", "var(--map-stroke)")
    .attr("stroke-width", 0.7)
    .on("mouseenter", handleMouseEnter)
    .on("mousemove", handleMouseMove)
    .on("mouseleave", handleMouseLeave)
    .on("click", (event, feature) => {
      event.stopPropagation();
      const name = feature.normalizedName;
      state.selectedCountry = state.selectedCountry === name ? null : name;
      updateVisualization();
    });
}

function updateVisualization() {
  state.filteredRows = getFilteredRows();
  const countryCounts = d3.rollup(
    state.filteredRows,
    (rows) => rows.length,
    (d) => d.region
  );

  const maxCount = d3.max(Array.from(countryCounts.values())) || 0;
  colorScale.domain([0, Math.max(maxCount, 1)]);

  mapLayer.selectAll(".map-country")
    .transition()
    .duration(550)
    .attr("fill", (feature) => {
      const count = countryCounts.get(feature.normalizedName) || 0;
      return count > 0 ? colorScale(count) : "var(--map-base)";
    })
    .attr("opacity", (feature) => {
      if (!state.selectedCountry) {
        return 1;
      }
      return feature.normalizedName === state.selectedCountry ? 1 : 0.55;
    })
    .attr("class", (feature) => `map-country${feature.normalizedName === state.selectedCountry ? " selected" : ""}`);

  updateMapSubtitle();
  updateLegend(maxCount);
  updateDetailPanel();
}

function getFilteredRows() {
  return state.medalists.filter((d) => {
    const startMatch = d.Year >= state.filters.startYear;
    const endMatch = d.Year <= state.filters.endYear;
    const seasonMatch = state.filters.season === ALL_VALUE || d.Season === state.filters.season;
    const medalMatch = state.filters.medal === ALL_VALUE || d.Medal === state.filters.medal;
    const sportMatch = state.filters.sports.includes(ALL_VALUE) || state.filters.sports.includes(d.Sport);
    return startMatch && endMatch && seasonMatch && medalMatch && sportMatch;
  });
}

function updateMapSubtitle() {
  const sportText = state.filters.sports.includes(ALL_VALUE)
    ? "all sports"
    : `${state.filters.sports.length} sports selected`;
  const medalText = state.filters.medal === ALL_VALUE ? "all medal types" : `${state.filters.medal} medals`;
  const seasonText = state.filters.season === ALL_VALUE ? "Summer and Winter" : state.filters.season;
  d3.select("#map-subtitle").text(`${getYearLabel()} • ${seasonText} • ${sportText} • ${medalText}`);
}

function updateLegend(maxCount) {
  const domainMax = Math.max(maxCount || 0, 1);
  const gradientId = "legend-gradient";
  const stops = d3.range(0, 1.01, 0.1);
  const legendPadding = 20;
  const rampWidth = 280;
  const legendWidth = rampWidth + legendPadding * 2;
  const legendHeight = 54;

  legendContainer.html("");

  legendContainer.append("span")
    .attr("class", "legend-title")
    .text("Medal count");

  const legendSvg = legendContainer.append("svg")
    .attr("width", legendWidth)
    .attr("height", legendHeight)
    .attr("viewBox", `0 0 ${legendWidth} ${legendHeight}`)
    .attr("aria-hidden", true);

  const defs = legendSvg.append("defs");
  const linearGradient = defs.append("linearGradient")
    .attr("id", gradientId)
    .attr("x1", "0%")
    .attr("x2", "100%")
    .attr("y1", "0%")
    .attr("y2", "0%");

  linearGradient.selectAll("stop")
    .data(stops)
    .join("stop")
    .attr("offset", (d) => `${d * 100}%`)
    .attr("stop-color", (d) => colorScale(d * domainMax));

  legendSvg.append("rect")
    .attr("class", "legend-ramp")
    .attr("x", legendPadding)
    .attr("y", 2)
    .attr("width", rampWidth)
    .attr("height", 14)
    .attr("rx", 999)
    .attr("fill", `url(#${gradientId})`);

  const legendScale = d3.scaleLinear()
    .domain([0, domainMax])
    .range([legendPadding, legendPadding + rampWidth]);

  const legendAxis = d3.axisBottom(legendScale)
    .ticks(4)
    .tickFormat(d3.format("d"));

  legendSvg.append("g")
    .attr("class", "axis")
    .attr("transform", "translate(0,22)")
    .call(legendAxis);
}

function updateDetailPanel() {
  const selectedName = state.selectedCountry;
  const rows = selectedName
    ? state.filteredRows.filter((d) => d.region === selectedName)
    : [];

  d3.select("#detail-title").text(selectedName || "Select a country");
  d3.select("#detail-subtitle").text(
    selectedName
      ? `Medal sources for ${selectedName} under the current filters, including ${getYearLabel().toLowerCase()}.`
      : "Click any country on the map to inspect medal sources."
  );

  d3.select("#detail-total").text(rows.length);

  const sportCounts = Array.from(
    d3.rollup(rows, (group) => group.length, (d) => d.Sport),
    ([sport, count]) => ({ sport, count })
  ).sort((a, b) => d3.descending(a.count, b.count));

  d3.select("#detail-top-sport").text(sportCounts[0] ? sportCounts[0].sport : "-");

  if (!selectedName) {
    detailEmptyState.style("display", "block");
    d3.select("#detail-chart").style("display", "none");
    barsGroup.selectAll("rect").remove();
    barsGroup.selectAll(".bar-label").remove();
    xAxisGroup.selectAll("*").remove();
    yAxisGroup.selectAll("*").remove();
    return;
  }

  detailEmptyState.style("display", "none");
  d3.select("#detail-chart").style("display", "block");

  const topSports = sportCounts.slice(0, 10);
  const dynamicInnerHeight = Math.max(topSports.length * 32, 220);
  const svgHeight = dynamicInnerHeight + detailDimensions.margin.top + detailDimensions.margin.bottom;
  detailInnerHeight = dynamicInnerHeight;

  detailSvg
    .attr("viewBox", `0 0 ${detailDimensions.width} ${svgHeight}`);

  xAxisGroup.attr("transform", `translate(0,${detailInnerHeight})`);

  const xScale = d3.scaleLinear()
    .domain([0, d3.max(topSports, (d) => d.count) || 1])
    .range([0, detailInnerWidth]);

  const yScale = d3.scaleBand()
    .domain(topSports.map((d) => d.sport))
    .range([0, detailInnerHeight])
    .padding(0.18);

  xAxisGroup.transition()
    .duration(400)
    .call(d3.axisBottom(xScale).ticks(5).tickFormat(d3.format("d")));

  yAxisGroup.transition()
    .duration(400)
    .call(d3.axisLeft(yScale).tickSize(0))
    .call((g) => g.selectAll("text").attr("dx", "-0.35em"));

  const bars = barsGroup.selectAll("rect")
    .data(topSports, (d) => d.sport);

  bars.join(
    (enter) => enter.append("rect")
      .attr("x", 0)
      .attr("y", (d) => yScale(d.sport))
      .attr("height", yScale.bandwidth())
      .attr("width", 0)
      .attr("rx", 6)
      .attr("fill", "var(--accent)")
      .call((enter) => enter.transition().duration(500).attr("width", (d) => xScale(d.count))),
    (update) => update.call((update) => update.transition().duration(500)
      .attr("y", (d) => yScale(d.sport))
      .attr("height", yScale.bandwidth())
      .attr("width", (d) => xScale(d.count))),
    (exit) => exit.call((exit) => exit.transition().duration(300).attr("width", 0).remove())
  );

  const labels = barsGroup.selectAll(".bar-label")
    .data(topSports, (d) => d.sport);

  labels.join(
    (enter) => enter.append("text")
      .attr("class", "bar-label")
      .attr("x", (d) => xScale(d.count) + 8)
      .attr("y", (d) => (yScale(d.sport) || 0) + yScale.bandwidth() / 2 + 4)
      .style("opacity", 0)
      .text((d) => d.count)
      .call((enter) => enter.transition().duration(500).style("opacity", 1)),
    (update) => update
      .text((d) => d.count)
      .transition()
      .duration(500)
      .attr("x", (d) => xScale(d.count) + 8)
      .attr("y", (d) => (yScale(d.sport) || 0) + yScale.bandwidth() / 2 + 4),
    (exit) => exit.remove()
  );
}

function getYearLabel() {
  const { startYear, endYear } = state.filters;

  if (startYear === endYear) {
    return `${startYear}`;
  }

  return `${startYear}-${endYear}`;
}

function getAvailableSportsForSeason(season) {
  if (season === ALL_VALUE) {
    return state.availableSports;
  }

  return Array.from(
    new Set(
      state.medalists
        .filter((d) => d.Season === season)
        .map((d) => d.Sport)
    )
  ).sort(d3.ascending);
}

function handleMouseEnter(event, feature) {
  const countryName = feature.normalizedName;
  const rows = state.filteredRows.filter((d) => d.region === countryName);
  const sportCounts = Array.from(d3.rollup(rows, (group) => group.length, (d) => d.Sport));
  const topSport = sportCounts.sort((a, b) => d3.descending(a[1], b[1]))[0]?.[0] || "None";

  tooltip
    .classed("hidden", false)
    .html(`
      <div class="tooltip-title">${feature.properties.name}</div>
      <div>Medals: ${rows.length}</div>
      <div>Top sport: ${topSport}</div>
    `);

  handleMouseMove(event);
}

function handleMouseMove(event) {
  tooltip
    .style("left", `${event.clientX + 14}px`)
    .style("top", `${event.clientY + 14}px`);
}

function handleMouseLeave() {
  tooltip.classed("hidden", true);
}
