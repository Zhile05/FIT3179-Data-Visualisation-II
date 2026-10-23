const charts = [
  "01_total_emissions_map",
  "02_top10_emitters_bar",
  "03_per_person_map",
  "04_per_person_dumbbell",
  "05_income_emissions_scatter",
  "06_global_emissions_line",
  "07_emissions_rank_bump",
  "08_global_sectors_treemap",
  "09_country_sectors_heatmap",
  "10_malaysia_sectors_waterfall",
  "11_southeast_asia_cartogram",
  "12_malaysia_exports_flow"
];

const views = {};
const chartWidths = {};
const embedOptions = { renderer: "svg", actions: false, tooltip: true };
const yearCharts = ["01_total_emissions_map", "02_top10_emitters_bar", "03_per_person_map"];
const worldMaps = ["01_total_emissions_map", "03_per_person_map"];

// Display numbers without thousands separators.
function number(value, digits = 1) {
  return new Intl.NumberFormat("en", {
    useGrouping: false,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  }).format(value);
}

// Vega's CSV reader uses the same file that is referenced by the chart JSON.
async function loadCountryEmissions() {
  const csvText = await vega.loader().load("data/country_emissions.csv");
  return vega.read(csvText, {
    type: "csv",
    parse: {
      year: "number",
      total_ghg_mt_co2e: "number",
      ghg_per_capita_t_co2e: "number",
      global_share_pct: "number"
    }
  });
}

function updateStory(year, countryEmissions) {
  const rows = countryEmissions.filter(row => row.year === year);
  const world = rows.find(row => row.country_code === "GLOBAL TOTAL");
  const malaysia = rows.find(row => row.country_code === "MYS");
  const ranked = rows.filter(row => row.country_code !== "GLOBAL TOTAL")
    .sort((a, b) => b.total_ghg_mt_co2e - a.total_ghg_mt_co2e);
  const share = count => ranked.slice(0, count).reduce(
    (sum, row) => sum + row.total_ghg_mt_co2e, 0
  ) / world.total_ghg_mt_co2e * 100;

  document.querySelectorAll("[data-map-year]").forEach(node => {
    node.textContent = year;
  });
  document.getElementById("year-output").textContent = year;
  document.getElementById("selected-world-gt").textContent = number(world.total_ghg_mt_co2e / 1000);
  document.getElementById("selected-top3").textContent = number(share(3)) + "%";
  document.getElementById("selected-top10").textContent = number(share(10)) + "%";
  document.getElementById("selected-mys-percap").textContent = number(malaysia.ghg_per_capita_t_co2e);
  document.getElementById("selected-world-percap").textContent = number(world.ghg_per_capita_t_co2e);
  document.getElementById("selected-ratio").textContent = number(
    malaysia.ghg_per_capita_t_co2e / world.ghg_per_capita_t_co2e
  ) + "×";
}

function fitChart(id, element) {
  const view = views[id];
  if (!view) return Promise.resolve();
  const width = Math.max(250, Math.round(element.clientWidth));
  chartWidths[id] = width;
  view.width(width);
  if (id === "05_income_emissions_scatter") {
    return view.runAsync().then(() => view.resize().runAsync()).then(() => {
      // Centre the legend boxes within the full chart, including the Y-axis space.
      element.style.setProperty("--scatter-legend-shift", "0px");
      const boxes = Array.from(element.querySelectorAll(".role-legend > g > .background"))
        .map(box => box.getBoundingClientRect());
      const chart = element.getBoundingClientRect();
      const left = Math.min(...boxes.map(box => box.left));
      const right = Math.max(...boxes.map(box => box.right));
      element.style.setProperty("--scatter-legend-shift", (chart.left + chart.width / 2 - (left + right) / 2) + "px");
    });
  }
  if (worldMaps.includes(id)) {
    view.height(Math.max(260, Math.min(400, Math.round(width * 0.48 + 50))));
  }
  if (id === "11_southeast_asia_cartogram") {
    view.height(width < 430 ? 390 : 445);
  }
  if (id === "12_malaysia_exports_flow") {
    view.height(width < 500 ? 670 : width < 760 ? 730 : 540);
  }
  return view.runAsync();
}

// Embed a chart and keep its view for resizing and year selection.
function embedChart(id) {
  var vg = "charts/" + id + ".vg.json";
  var container = document.getElementById("chart-" + id);
  container.replaceChildren();

  return vegaEmbed("#chart-" + id, vg, embedOptions)
    .then(function(result) {
      views[id] = result.view;
      return fitChart(id, container);
    })
    .then(function() {
      container.setAttribute("data-ready", "true");
      return 0;
    })
    .catch(function(error) {
      container.classList.add("chart-error");
      container.textContent = "This chart could not load. Open the project with Live Server and check that all folders are present.";
      console.error(id, error);
      return 1;
    });
}

function drawCharts() {
  var chartPromises = [];
  for (var i = 0; i < charts.length; i++) {
    chartPromises.push(embedChart(charts[i]));
  }

  return Promise.all(chartPromises).then(function(results) {
    var failures = 0;
    for (var i = 0; i < results.length; i++) {
      failures += results[i];
    }
    return failures;
  });
}

function enableYearSlider(countryEmissions) {
  const slider = document.getElementById("map-year");
  let timer;
  slider.disabled = false;
  slider.addEventListener("input", () => {
    const year = Number(slider.value);
    document.getElementById("year-output").textContent = year;
    clearTimeout(timer);
    timer = setTimeout(async () => {
      try {
        await Promise.all(yearCharts.map(id => views[id]
          ? views[id].signal("selectedYear", year).runAsync()
          : Promise.resolve()));
        updateStory(year, countryEmissions);
      } catch (error) {
        console.error("Year selection", error);
      }
    }, 100);
  });
}

function enableResponsiveCharts() {
  if (!window.ResizeObserver) return;
  const observer = new ResizeObserver(entries => {
    entries.forEach(entry => {
      const id = entry.target.id.replace("chart-", "");
      const view = views[id];
      if (view && Math.abs(chartWidths[id] - entry.contentRect.width) > 3) {
        fitChart(id, entry.target).catch(error => console.error(id, error));
      }
    });
  });
  document.querySelectorAll(".chart").forEach(node => observer.observe(node));
}

async function initialise() {
  const status = document.getElementById("load-status");
  if (window.location.protocol === "file:") {
    status.textContent = "To display the charts, open this folder in VS Code, then right-click index.html and choose Open with Live Server.";
    status.classList.add("chart-error");
    return;
  }
  try {
    // Load the local sans-serif font before Vega measures labels and legends.
    if (document.fonts) {
      await Promise.all([400, 600, 700].map(weight =>
        document.fonts.load(weight + ' 14px "Source Sans 3"')));
    }
    const [failures, countryEmissions] = await Promise.all([drawCharts(), loadCountryEmissions()]);
    updateStory(2025, countryEmissions);
    enableYearSlider(countryEmissions);
    enableResponsiveCharts();
    status.textContent = failures ? "Some charts could not load. Check the project files." : "";
  } catch (error) {
    status.textContent = "The data could not load. Please open the complete project with Live Server.";
    status.classList.add("chart-error");
    console.error(error);
  }
}

initialise();
