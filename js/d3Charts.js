window.d3Charts = {
    accessibleTable: function (headers, rows) {
        return { english: true, headers, rows: rows.map(row => row.map(value => value == null ? "—" : String(value))) };
    },
    renderAlluvial: function (element, culture) {
        if (!element || !window.d3) return;
        const isEnglish = culture === "en";

        // Stream/alluvial-by-year chart (ThaiAMRwatch-style)
        const years = [2019, 2020, 2021, 2022, 2023, 2024];
        const totals = [603463, 591201, 628659, 653415, 729812, 755833];
        const unit = "株";

        const categories = [
            "Escherichia coli",
            "Klebsiella pneumoniae",
            "Staphylococcus aureus",
            "Pseudomonas aeruginosa",
            "Enterococcus faecalis",
            "Proteus spp.",
            "Enterococcus faecium",
            "Acinetobacter baumannii",
            "Enterobacter spp.",
            "Citrobacter spp.",
            "Other",
        ];

        // Stable proportions used to synthesize data (replace with real data when available).
        const proportions = [0.36, 0.14, 0.11, 0.09, 0.08, 0.06, 0.05, 0.035, 0.03, 0.02, 0.065];

        const palette = [
            "#2b7bb9", "#cfe0f5", "#f29e4c", "#f7c59f", "#4caf50",
            "#bfe6b6", "#2e7d32", "#d94b4b", "#b25aa7", "#8b6fbf", "#5b879a",
        ];
        const color = d3.scaleOrdinal().domain(categories).range(palette);

        function kebabCase(str) {
            return String(str)
                .trim()
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, "-")
                .replace(/^-+|-+$/g, "");
        }

        function formatInt(n) {
            return Number(n).toLocaleString("en-US");
        }

        // Build per-year stacked segments, preserving category order in the stack.
        const rows = years.map((year, idx) => {
            const total = totals[idx] || 0;
            const values = {};
            let running = 0;
            for (let i = 0; i < categories.length; i++) {
                const name = categories[i];
                // Round, and let the last category absorb the remainder so totals always match.
                const value = (i === categories.length - 1)
                    ? Math.max(0, total - running)
                    : Math.max(0, Math.round(total * proportions[i]));
                values[name] = value;
                running += value;
            }
            return { year, total, values };
        });

        const segmentsByName = new Map(categories.map((name) => [name, []]));
        for (const row of rows) {
            let running = 0;
            for (const name of categories) {
                const value = row.values[name] || 0;
                const seg = { year: row.year, name, value, y0: running, y1: running + value };
                segmentsByName.get(name).push(seg);
                running += value;
            }
        }

        element.replaceChildren();

        const root = d3.select(element).append("div").attr("class", "alluvial-root");
        const head = root.append("div").attr("class", "alluvial-head");
        head.selectAll("div")
            .data(rows)
            .join("div")
            .attr("class", "alluvial-total")
            .html((d) => `<strong>${formatInt(d.total)}</strong> ${unit}`);
        head.append("div")
            .attr("class", "alluvial-total alluvial-total-label")
            .text(isEnglish ? "Total" : "總數");

        const figure = root.append("div").attr("class", "alluvial-figure");
        figure.style("position", "relative");

        const width = Math.max(figure.node().clientWidth || element.clientWidth || 920, 720);
        const height = 520;
        const margin = { top: 24, right: 210, bottom: 56, left: 40 };
        const innerW = Math.max(width - margin.left - margin.right, 1);
        const innerH = Math.max(height - margin.top - margin.bottom, 1);

        const svg = figure.append("svg")
            .attr("viewBox", `0 0 ${width} ${height}`)
            .attr("width", "100%")
            .attr("height", height)
            .attr("role", "img")
            .attr("aria-label", "Alluvial chart by year");

        const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

        const x = d3.scalePoint().domain(years).range([0, innerW]);
        const y = d3.scaleLinear()
            .domain([0, d3.max(rows, (d) => d.total) || 1])
            .range([innerH, 0]);

        const area = d3.area()
            .curve(d3.curveBumpX)
            .x((d) => x(d.year))
            .y0((d) => y(d.y0))
            .y1((d) => y(d.y1));

        const series = categories.map((name) => {
            const arr = segmentsByName.get(name);
            arr.key = name;
            return arr;
        });

        const areaPaths = g.append("g")
            .attr("class", "alluvial-areas")
            .selectAll("path")
            .data(series)
            .join("path")
            .attr("d", (d) => area(d))
            .attr("fill", (d) => color(d.key))
            .attr("opacity", 0.45)
            .attr("stroke", "#ffffff")
            .attr("stroke-width", 1);

        // Vertical bars per year showing segment boundaries (like ThaiAMRwatch)
        const barGroup = g.append("g").attr("class", "alluvial-bars");
        const barWrap = barGroup.selectAll("g")
            .data(rows)
            .join("g")
            .attr("transform", (d) => `translate(${x(d.year)},0)`);

        const barWidth = 10;
        const barRects = barWrap.selectAll("rect")
            .data((row) => categories.map((name) => {
                const value = row.values[name] || 0;
                const y0 = d3.sum(categories.slice(0, categories.indexOf(name)), (n) => row.values[n] || 0);
                return { year: row.year, name, value, y0, y1: y0 + value };
            }))
            .join("rect")
            .attr("x", -barWidth / 2)
            .attr("y", (d) => y(d.y1))
            .attr("width", barWidth)
            .attr("height", (d) => Math.max(0, y(d.y0) - y(d.y1)))
            .attr("fill", (d) => color(d.name))
            .attr("opacity", 0.9);

        // X axis
        const xAxis = g.append("g")
            .attr("transform", `translate(0,${innerH + 20})`)
            .call(d3.axisBottom(x).tickSize(-8).tickPadding(8).tickSizeOuter(0));
        xAxis.select(".domain").attr("stroke", "#7D7D7D");
        xAxis.selectAll("line").attr("stroke", "#7D7D7D").attr("transform", "translate(0,4)");
        xAxis.selectAll("text").attr("font-weight", 600);

        g.append("text")
            .attr("x", innerW / 2)
            .attr("y", innerH + 52)
            .attr("text-anchor", "middle")
            .attr("font-size", 18)
            .attr("font-weight", 700)
            .text("年份");

        // Right-side labels aligned to last year segments.
        const lastYear = years[years.length - 1];
        const lastSegments = segmentsByName.get(categories[0]).map((_, idx) => {
            const name = categories[idx];
            const seg = segmentsByName.get(name).find((s) => s.year === lastYear);
            return seg ? { name, yMid: (seg.y0 + seg.y1) / 2, height: seg.y1 - seg.y0 } : null;
        }).filter(Boolean);

        g.append("text")
            .attr("x", innerW + 160)
            .attr("y", innerH / 2)
            .attr("text-anchor", "middle")
            .attr("font-size", 22)
            .attr("font-weight", 800)
            .attr("fill", "#555")
            .text(isEnglish ? "Isolates" : "菌株數");

        const rightLabels = g.append("g")
            .attr("class", "alluvial-right-labels")
            .selectAll("text")
            .data(lastSegments)
            .join("text")
            .attr("x", innerW + 10)
            .attr("y", (d) => y(d.yMid))
            .attr("dominant-baseline", "middle")
            .attr("font-size", 11)
            .attr("font-weight", 700)
            .attr("fill", "#222")
            .text((d) => d.name);

        // Hover interactions (ThaiAMRwatch-style): highlight one series and show a tooltip box for every year.
        const rankByYear = new Map();
        for (const row of rows) {
            const sorted = categories
                .slice()
                .sort((a, b) => (row.values[b] || 0) - (row.values[a] || 0));
            const m = new Map();
            sorted.forEach((name, idx) => m.set(name, idx + 1));
            rankByYear.set(row.year, m);
        }

        const tooltipLayer = figure.append("div")
            .attr("class", "alluvial-tooltips")
            // Overlay on top of the SVG so (x,y) math matches SVG coordinates.
            .style("position", "absolute")
            .style("left", "0")
            .style("top", "0")
            .style("right", "0")
            .style("bottom", "0");

        const tooltipWrap = tooltipLayer.selectAll("div.tooltip-wrap")
            .data(rows)
            .join("div")
            .attr("class", "tooltip-wrap");

        const yearSegments = rows.flatMap((row) =>
            categories.map((name) => {
                const seg = (segmentsByName.get(name) || []).find((s) => s.year === row.year);
                return {
                    year: row.year,
                    total: row.total,
                    name,
                    value: row.values[name] || 0,
                    y1: seg ? seg.y1 : 0,
                };
            })
        );

        const allYearTooltips = tooltipLayer.selectAll("div.alluvial-tip")
            .data(yearSegments)
            .join("div")
            .attr("class", (d) => `alluvial-tip ${kebabCase(d.name)}`)
            .style("left", (d) => `${margin.left + (x(d.year) ?? 0) - 72}px`)
            .style("top", (d) => `${Math.max(margin.top + y(d.y1) - 58, 6)}px`)
            .style("display", "none")
            .html((d) => {
                const rank = rankByYear.get(d.year)?.get(d.name) ?? 0;
                const pct = d.total ? (d.value / d.total) : 0;
                return `<div class="tip-row"><b>排名：</b>${rank}</div>
<div class="tip-row"><b>${isEnglish ? "Isolates:" : "菌株數："}</b>${formatInt(d.value)}</div>
<div class="tip-row"><b>百分比：</b>${(pct * 100).toFixed(1)}%</div>`;
            });

        function highlightSeries(seriesName) {
            areaPaths.attr("opacity", (d) => (d.key === seriesName ? 0.65 : 0.12));
            barRects.attr("opacity", (d) => (d.name === seriesName ? 0.95 : 0.22));
            rightLabels.attr("opacity", (d) => (d.name === seriesName ? 1 : 0.28));
            allYearTooltips.style("display", (d) => (d.name === seriesName ? "block" : "none"));
        }

        function resetHighlight() {
            areaPaths.attr("opacity", 0.45);
            barRects.attr("opacity", 0.9);
            rightLabels.attr("opacity", 1);
            allYearTooltips.style("display", "none");
        }

        areaPaths
            .style("cursor", "pointer")
            .on("mouseover", (event, d) => { highlightSeries(d.key); })
            .on("mouseleave", resetHighlight);

        barRects
            .style("cursor", "pointer")
            .on("mouseover", (event, d) => { highlightSeries(d.name); })
            .on("mouseleave", resetHighlight);

        ensureAlluvialStyles();
        const keyboard = d3.select(element).append("div").attr("class", "amr-chart-keyboard").attr("role", "group").attr("aria-label", "Highlight organism");
        keyboard.selectAll("button").data(categories).join("button").attr("type", "button").text(name => name)
            .on("click", (_, name) => highlightSeries(name));
        keyboard.append("button").attr("type", "button").text("Reset highlight").on("click", resetHighlight);
        return window.d3Charts.accessibleTable(["Year", "Organism", "Isolates", "Total isolates"], rows.flatMap(row => categories.map(name => [row.year, name, row.values[name], row.total])));

        function ensureAlluvialStyles() {
            if (document.getElementById("alluvial-styles")) return;
            const style = document.createElement("style");
            style.id = "alluvial-styles";
            style.textContent = `
              .alluvial-root { display: grid; gap: 10px; font-family: Arial, sans-serif; color: #111; }
              .alluvial-head { display: flex; justify-content: space-between; align-items: baseline; padding: 0 40px; }
              .alluvial-total { font-size: 14px; color: #111; white-space: nowrap; }
              .alluvial-total strong { font-size: 16px; font-weight: 800; margin-right: 4px; }
              .alluvial-total-label { font-weight: 800; }
              .alluvial-figure { width: 100%; }
              .alluvial-tooltips { overflow: visible; pointer-events: none; z-index: 10; }
              .tooltip-wrap { position: absolute; left: 0; top: 0; right: 0; bottom: 0; overflow: visible; pointer-events: none; }
              .alluvial-tip { position: absolute; pointer-events: none; z-index: 20; width: 148px; padding: 10px 12px; border-radius: 10px; background: rgba(245, 215, 199, 0.95); color: #3b3b3b; font-size: 13px; line-height: 1.35; box-shadow: 0 1px 0 rgba(0,0,0,0.06); }
              .alluvial-tip .tip-row b { font-weight: 800; }
            `;
            document.head.appendChild(style);
        }
    },

    // Re-implemented to match ThaiAMRwatch Sankey behavior (see ThaiAMRwatch_files/6617d4d.js.下載).
    renderAntimicrobialConsumption: function (element) {
        if (!element || !window.d3) return;

        const years = [2019, 2020, 2021, 2022, 2023];
        const unit = "DID";
        const otherName = "Other non-top-10 antimicrobials";
        const groupColors = {
            "Critically Important": "#d85850",
            "Highly Important": "#e4a761",
            "Important": "#1c9879",
            "Non-antibacterial": "#a1afc7",
            "Other non-top-10 antimicrobials": "#588599",
        };

        // Static snapshot used in the current app.
        const sankeyRows = [
            {
                year: 2019, total: 51.10000000000002, values: {
                    "amoxicillin": { value: 9.2, group: "Critically Important" },
                    "azithromycin": { value: 2.8, group: "Critically Important" },
                    "emtricitabine, tenofovir disoproxil and efavirenz": { value: 2.5, group: "Non-antibacterial" },
                    "ketoconazole": { value: 2.4, group: "Important" },
                    "amoxicillin and beta-lactamase inhibitor": { value: 2.3, group: "Critically Important" },
                    "tetracycline": { value: 2.3, group: "Highly Important" },
                    "ampicillin": { value: 2.2, group: "Critically Important" },
                    "doxycycline": { value: 2, group: "Highly Important" },
                    "lamivudine": { value: 1.8, group: "Non-antibacterial" },
                    "tenofovir disoproxil": { value: 1.6, group: "Non-antibacterial" },
                    [otherName]: { value: 22.000000000000018, group: otherName }
                }
            },
            {
                year: 2020, total: 45.60000000000002, values: {
                    "amoxicillin": { value: 6.6, group: "Critically Important" },
                    "azithromycin": { value: 0.7, group: "Critically Important" },
                    "emtricitabine, tenofovir disoproxil and efavirenz": { value: 2.8, group: "Non-antibacterial" },
                    "ketoconazole": { value: 2, group: "Important" },
                    "amoxicillin and beta-lactamase inhibitor": { value: 2.3, group: "Critically Important" },
                    "tetracycline": { value: 2.4, group: "Highly Important" },
                    "ampicillin": { value: 2.2, group: "Critically Important" },
                    "doxycycline": { value: 1.6, group: "Highly Important" },
                    "lamivudine": { value: 2.5, group: "Non-antibacterial" },
                    "tenofovir disoproxil": { value: 1.6, group: "Non-antibacterial" },
                    [otherName]: { value: 20.900000000000023, group: otherName }
                }
            },
            {
                year: 2021, total: 34.199999999999996, values: {
                    "amoxicillin": { value: 4.7, group: "Critically Important" },
                    "azithromycin": { value: 0.1, group: "Critically Important" },
                    "emtricitabine, tenofovir disoproxil and efavirenz": { value: 2.6, group: "Non-antibacterial" },
                    "ketoconazole": { value: 1.6, group: "Important" },
                    "amoxicillin and beta-lactamase inhibitor": { value: 1.5, group: "Critically Important" },
                    "tetracycline": { value: 2.7, group: "Highly Important" },
                    "ampicillin": { value: 1.5, group: "Critically Important" },
                    "doxycycline": { value: 1.7, group: "Highly Important" },
                    "lamivudine": { value: 1.2, group: "Non-antibacterial" },
                    "tenofovir disoproxil": { value: 1.3, group: "Non-antibacterial" },
                    [otherName]: { value: 15.299999999999999, group: otherName }
                }
            },
            {
                year: 2022, total: 39.36000000000001, values: {
                    "amoxicillin": { value: 5.68, group: "Critically Important" },
                    "azithromycin": { value: 0.5, group: "Critically Important" },
                    "emtricitabine, tenofovir disoproxil and efavirenz": { value: 0.93, group: "Non-antibacterial" },
                    "ketoconazole": { value: 1.88, group: "Important" },
                    "amoxicillin and beta-lactamase inhibitor": { value: 2.29, group: "Critically Important" },
                    "tetracycline": { value: 2.6, group: "Highly Important" },
                    "ampicillin": { value: 1.18, group: "Critically Important" },
                    "doxycycline": { value: 1.71, group: "Highly Important" },
                    "lamivudine": { value: 0.81, group: "Non-antibacterial" },
                    "tenofovir disoproxil": { value: 0.45, group: "Non-antibacterial" },
                    [otherName]: { value: 21.330000000000013, group: otherName }
                }
            },
            {
                year: 2023, total: 56.11000000000003, values: {
                    "amoxicillin": { value: 7.83, group: "Critically Important" },
                    "azithromycin": { value: 0.86, group: "Critically Important" },
                    "emtricitabine, tenofovir disoproxil and efavirenz": { value: 0.67, group: "Non-antibacterial" },
                    "ketoconazole": { value: 1.46, group: "Important" },
                    "amoxicillin and beta-lactamase inhibitor": { value: 3.4, group: "Critically Important" },
                    "tetracycline": { value: 2.18, group: "Highly Important" },
                    "ampicillin": { value: 1.55, group: "Critically Important" },
                    "doxycycline": { value: 1.76, group: "Highly Important" },
                    "lamivudine": { value: 4.93, group: "Non-antibacterial" },
                    "tenofovir disoproxil": { value: 5.46, group: "Non-antibacterial" },
                    [otherName]: { value: 26.010000000000023, group: otherName }
                }
            },
        ];

        const drugNames = Object.keys(sankeyRows[0].values);

        function kebabCase(str) {
            return String(str)
                .trim()
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, "-")
                .replace(/^-+|-+$/g, "");
        }

        function formatValue(value) {
            return Number(value).toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
        }

        function getColor(drugName) {
            const group = sankeyRows[0].values[drugName]?.group;
            return groupColors[group] || "lightgrey";
        }

        // ThaiAMRwatch sorts each year: [Other] + (others ascending by value)
        const yearlySegments = sankeyRows.map((row) => {
            const sorted = [
                otherName,
                ...drugNames
                    .filter((n) => n !== otherName)
                    .slice()
                    .sort((a, b) => (row.values[a]?.value || 0) - (row.values[b]?.value || 0)),
            ];

            let running = 0;
            const segments = sorted.map((name) => {
                const value = row.values[name]?.value || 0;
                const seg = [running, running + value];
                seg.data = row;
                seg.key = name;
                running += value;
                return seg;
            });
            segments.key = row.year;
            return segments;
        });

        const drugSeries = drugNames.map((name) => {
            const arr = yearlySegments.map((segments) => segments.find((s) => s.key === name));
            arr.key = name;
            return arr;
        });

        const maxTotal = d3.max(sankeyRows, (r) => r.total) || 1;

        // Layout exactly as in ThaiAMRwatch setSankey().
        const height = 560;
        const marginVal = 50;
        const margin = { top: 24, right: marginVal, bottom: 40, left: marginVal };

        element.replaceChildren();
        ensureSankeyStyles();

        const state = {
            section: "human",
            groupBy: "WHO CIA",
            activeGroups: new Set(Object.keys(groupColors)),
            hiddenDrugs: new Set(),
            search: "",
        };

        const root = d3.select(element).append("div").attr("class", "amc-root");
        const layout = root.append("div").attr("class", "amc-layout");
        const left = layout.append("div").attr("class", "amc-left");
        const center = layout.append("div").attr("class", "amc-center");
        const right = layout.append("div").attr("class", "amc-right");

        left.append("div").attr("class", "amc-title").text("Antimicrobial Consumption");
        left.append("div").attr("class", "amc-subtitle").text("การบริโภคยาต้านจุลชีพ");
        left.append("hr").attr("class", "amc-sep");

        const sectionHost = left.append("div").attr("class", "amc-section");
        sectionHost.append("label").attr("class", "amc-radio")
            .html(`<input type="radio" name="amc-section" checked><span>Humans</span><small>มนุษย์</small>`);
        sectionHost.append("label").attr("class", "amc-radio")
            .html(`<input type="radio" name="amc-section"><span>Food-producing animals</span><small>สัตว์ที่ใช้บริโภค</small>`);

        left.append("hr").attr("class", "amc-sep");
        left.append("div").attr("class", "amc-desc").text("Showing top 10 antimicrobial consumption and the other routes");

        left.append("div").attr("class", "amc-groupby-label").text("Group by");
        const groupBySelect = left.append("select").attr("class", "amc-select").attr("aria-label", "Group by").attr("disabled", true);
        groupBySelect.append("option").attr("selected", true).text("WHO CIA");

        const groupHeader = left.append("div").attr("class", "amc-group-head");
        const groupCount = groupHeader.append("div").attr("class", "amc-group-count");
        groupHeader.append("button").attr("type", "button").attr("class", "amc-link")
            .text("Deselect all")
            .on("click", () => {
                state.activeGroups = new Set();
                state.hiddenDrugs = new Set();
                render();
            });

        const groupList = left.append("div").attr("class", "amc-group-list");

        // Right panel: search + list. (We only have the 11-series snapshot, but mimic the UI.)
        const searchBox = right.append("div").attr("class", "amc-search");
        searchBox.append("div").attr("class", "amc-search-icon").text(" ");
        const searchInput = searchBox.append("input")
            .attr("type", "search")
            .attr("aria-label", "Search antimicrobials")
            .attr("placeholder", "Search...")
            .on("input", function () {
                state.search = this.value || "";
                render();
            });

        const rightMeta = right.append("div").attr("class", "amc-right-meta");
        const drugList = right.append("div").attr("class", "amc-drug-list");

        function getDrugGroup(name) {
            return sankeyRows[0].values[name]?.group || name;
        }

        function getVisibleDrugNames() {
            return drugNames.filter((name) => {
                const group = getDrugGroup(name);
                if (!state.activeGroups.has(group)) return false;
                if (state.hiddenDrugs.has(name)) return false;
                return true;
            });
        }

        function buildSeriesFor(names) {
            // Always preserve ordering rules from ThaiAMRwatch: otherName forced to first, others ascending by value per year.
            const visible = new Set(names);
            const yearly = sankeyRows.map((row) => {
                const ordered = [
                    otherName,
                    ...drugNames
                        .filter((n) => n !== otherName && visible.has(n))
                        .slice()
                        .sort((a, b) => (row.values[a]?.value || 0) - (row.values[b]?.value || 0)),
                ].filter((n) => visible.has(n));

                let running = 0;
                const segments = ordered.map((name) => {
                    const value = row.values[name]?.value || 0;
                    const seg = [running, running + value];
                    seg.data = row;
                    seg.key = name;
                    running += value;
                    return seg;
                });
                segments.key = row.year;
                return segments;
            });

            const series = names.map((name) => {
                const arr = yearly.map((segments) => segments.find((s) => s.key === name));
                arr.key = name;
                return arr;
            });

            return { yearly, series };
        }

        function renderGroupControls() {
            const groups = Object.keys(groupColors);
            groupCount.text(`Showing ${state.activeGroups.size}`);

            const rows = groupList.selectAll("label")
                .data(groups)
                .join("label")
                .attr("class", "amc-check")
                .style("--color", (g) => groupColors[g]);

            rows.html((g) => {
                const checked = state.activeGroups.has(g) ? "checked" : "";
                return `<input type="checkbox" ${checked}><span class="swatch"></span><span class="name">${g}</span>`;
            });

            rows.select("input")
                .on("change", function (event, g) {
                    if (this.checked) state.activeGroups.add(g);
                    else state.activeGroups.delete(g);
                    render();
                });
        }

        function renderDrugList() {
            const visibleNames = getVisibleDrugNames();
            const query = (state.search || "").trim().toLowerCase();
            const filtered = drugNames.filter((name) => name.toLowerCase().includes(query));

            rightMeta.text(`Showing ${filtered.length} drugs`);

            const items = drugList.selectAll("div.amc-drug-row")
                .data(filtered, (d) => d)
                .join("div")
                .attr("class", "amc-drug-row");

            items.html((name) => {
                const hidden = state.hiddenDrugs.has(name);
                const eye = hidden ? "Show" : "Hide";
                // Keep the two-icon affordance but only wire the eye toggle.
                return `<div class="amc-drug-name">${name}</div>
<button type="button" class="amc-icon-btn" data-action="toggle" aria-label="${eye} ${name}" title="${eye}">${hidden ? "○" : "◉"}</button>
<button type="button" class="amc-icon-btn" data-action="doc" aria-label="Details: ${name}" title="Details">≡</button>`;
            });

            items.selectAll("button")
                .on("click", function (event, name) {
                    const action = this.getAttribute("data-action");
                    if (action === "toggle") {
                        if (state.hiddenDrugs.has(name)) state.hiddenDrugs.delete(name);
                        else state.hiddenDrugs.add(name);
                        render();
                        drugList.selectAll("button[data-action='toggle']").filter(drug => drug === name).node()?.focus();
                    } else if (action === "doc") {
                        const details = element.previousElementSibling;
                        if (details?.matches(".amr-a11y-table")) {
                            details.open = true;
                            details.querySelector("summary").focus();
                        }
                    }
                });

            // If a drug is hidden, dim the row.
            items.classed("is-hidden", (name) => state.hiddenDrugs.has(name));
        }

        function renderChart() {
            center.selectAll("*").remove();

            const head = center.append("div").attr("class", "amc-head");
            sankeyRows.forEach((row) => {
                head.append("div")
                    .attr("class", "amc-total")
                    .html(`<strong>${formatValue(row.total)}</strong> <span>${unit}</span>`);
            });

            const tooltipLayer = center.append("div")
                .attr("class", "amc-sankey-tooltips")
                .style("position", "relative");

            const sankey = center.append("div")
                .attr("id", "sankey")
                .attr("class", "amc-sankey")
                .style("position", "relative");

            const containerWidth = sankey.node().clientWidth || element.clientWidth || 792;
            const innerW = Math.max(containerWidth - margin.left - margin.right, 0);
            const innerH = height - margin.top - margin.bottom;

            const visibleNames = getVisibleDrugNames();
            const { yearly, series } = buildSeriesFor(visibleNames);

            const svg = sankey.append("svg")
                .attr("width", containerWidth)
                .attr("height", innerH + margin.top + margin.bottom)
                .append("g")
                .attr("transform", `translate(${margin.left}, ${margin.top})`);

            const x = d3.scalePoint().domain(years).range([0, innerW]);
            const y = d3.scaleLinear().domain([0, maxTotal]).range([innerH, 0]);

            const xAxis = svg.append("g")
                .attr("transform", `translate(0, ${innerH + 20})`)
                .call(d3.axisBottom(x)
                    .tickSize(-8)
                    .tickValues(years)
                    .tickFormat((t) => (years.includes(t) ? t : ""))
                    .tickPadding(8)
                    .tickSizeOuter(0));

            xAxis.select(".domain").attr("stroke", "#7D7D7D");
            xAxis.selectAll("line").attr("transform", "translate(0,4)").attr("stroke", "#7D7D7D");
            xAxis.selectAll("text").attr("class", "caption").attr("font-weight", "500");

            const area = d3.area()
                .curve(d3.curveBumpX)
                .x((d) => x(d.data.year))
                .y0((d) => y(d[0]))
                .y1((d) => y(d[1]));

            const areaGroup = svg.append("g").attr("class", "area-group");
            const areas = areaGroup.selectAll("path")
                .data(series)
                .join("path")
                .attr("class", (d) => `area ${kebabCase(d.key)}`)
                .attr("d", (d) => area(d))
                .style("fill", (d) => getColor(d.key))
                .style("cursor", "pointer")
                .style("opacity", 0.2)
                .style("stroke", "#f8f8f8");

            const barWrap = svg.append("g")
                .attr("class", "bar-group")
                .selectAll("g")
                .data(yearly)
                .join("g")
                .attr("class", "bar-wrap");

            const bars = barWrap.selectAll("rect")
                .data((d) => d)
                .join("rect")
                .attr("class", (d) => `bar ${kebabCase(d.key)}`)
                .attr("x", (d) => (x(d.data.year) ?? 0) - 8)
                .attr("y", (d) => y(d[1]))
                .attr("height", (d) => y(d[0]) - y(d[1]))
                .attr("width", 16)
                .style("stroke", "#f8f8f8")
                .style("fill", (d) => getColor(d.key))
                .style("cursor", "pointer");

            const labels = barWrap
                .filter((d) => d.key === years[0])
                .selectAll("text")
                .data((d) => d)
                .join("text")
                .attr("class", (d) => `caption label ${kebabCase(d.key)}`)
                .attr("x", 16)
                .attr("y", (d) => y(d[1]) + (y(d[0]) - y(d[1])) / 1.8)
                .style("fill", "black")
                .style("pointer-events", "none")
                .style("opacity", (d) => (y(d[0]) - y(d[1])) > 15 ? 1 : 0)
                .text((d) => d.key);

            const tooltipWrap = tooltipLayer.selectAll("div.tooltip-wrap")
                .data(yearly)
                .join("div")
                .attr("class", "tooltip-wrap");

            tooltipWrap.selectAll("div")
                .data((d) => d)
                .join("div")
                .attr("class", (d) => `tooltip ${kebabCase(d.key)}`)
                .style("background", "#474747")
                .style("color", "white")
                .style("border-radius", "2px")
                .style("padding", "4px")
                .style("position", "absolute")
                .style("width", "120px")
                .style("left", (d) => `${margin.left + (x(d.data.year) ?? 0) - 60}px`)
                .style("top", (d) => `${Math.max(margin.top + y(d[1]) - 50, -24)}px`)
                .style("display", "none")
                .html((d) => {
                    const value = d.data.values[d.key]?.value || 0;
                    return `<div class="caption" style="font-weight: 600;">${d.data.year}</div><div class="caption" style="white-space: pre-line;">${formatValue(value)} ${unit}</div>`;
                });

            const allTooltips = tooltipLayer.selectAll(".tooltip");

            function highlight(drugName) {
                const k = kebabCase(drugName);
                areas.style("fill", (d) => (kebabCase(d.key) === k ? getColor(d.key) : "#e5e5e5")).style("opacity", 0.2);
                bars.style("fill", (d) => (kebabCase(d.key) === k ? getColor(d.key) : "#7d7d7d"));
                allTooltips.style("display", "none");
                sankey.selectAll(".label").style("opacity", "0");
                tooltipLayer.selectAll(`.tooltip.${k}`).style("display", "block");
                sankey.selectAll(`.label.${k}`).style("opacity", "1");
            }

            function unhighlight() {
                areas.style("fill", (d) => getColor(d.key)).style("opacity", 0.2);
                bars.style("fill", (d) => getColor(d.key));
                allTooltips.style("display", "none");
                sankey.selectAll(".label").style("opacity", (d) => (y(d[0]) - y(d[1])) > 15 ? "1" : "0");
            }

            areas.on("mouseover", (event, d) => highlight(d.key)).on("mouseleave", unhighlight);
            bars.on("mouseover", (event, d) => highlight(d.key)).on("mouseleave", unhighlight);
        }

        function render() {
            // When a group is turned off, ensure drugs within that group are not "forced visible" by stale state.
            for (const name of Array.from(state.hiddenDrugs)) {
                if (!drugNames.includes(name)) state.hiddenDrugs.delete(name);
            }

            renderGroupControls();
            renderDrugList();
            renderChart();
        }

        render();

        // No scrollbars: tooltips are positioned in the same coordinate space as the chart.
        return window.d3Charts.accessibleTable(["Year", "Antimicrobial", "Group", "Consumption (DID)"], sankeyRows.flatMap(row => Object.entries(row.values).map(([name, item]) => [row.year, name, item.group, item.value])));

        function ensureSankeyStyles() {
            if (document.getElementById("amc-sankey-styles")) return;
            const style = document.createElement("style");
            style.id = "amc-sankey-styles";
            style.textContent = `
                .amc-root { font-family: Arial, sans-serif; color: #1a1a1a; }
                .amc-layout { display: grid; grid-template-columns: 320px minmax(0, 1fr) 320px; gap: 24px; align-items: start; }
                .amc-left, .amc-right { padding: 10px 0; }
                .amc-center { min-width: 0; }
                .amc-title { font-size: 40px; font-weight: 800; letter-spacing: 0; }
                .amc-subtitle { margin-top: 6px; font-size: 18px; color: #111; }
                .amc-sep { border: none; border-top: 1px dashed #7d7d7d; margin: 16px 0; }
                .amc-radio { display: grid; grid-template-columns: 20px 1fr; gap: 10px; padding: 10px 0; cursor: default; }
                .amc-radio span { font-size: 18px; font-weight: 600; }
                .amc-radio small { grid-column: 2; color: #444; margin-top: 2px; }
                .amc-desc { margin: 16px 0 10px; color: #555; line-height: 1.35; }
                .amc-groupby-label { margin-top: 10px; font-weight: 700; }
                .amc-select { width: 100%; height: 40px; margin-top: 8px; border: 1px solid #b0b0b0; border-radius: 4px; background: #fff; padding: 0 10px; }
                .amc-group-head { display: flex; justify-content: space-between; align-items: center; margin-top: 16px; }
                .amc-group-count { color: #333; }
                .amc-link { background: transparent; border: none; padding: 0; color: #666; text-decoration: underline; cursor: pointer; font: inherit; }
                .amc-group-list { border: 1px solid #b0b0b0; border-radius: 4px; overflow: hidden; margin-top: 8px; }
                .amc-check { display: grid; grid-template-columns: 18px 14px 1fr; gap: 10px; padding: 8px 10px; align-items: center; border-top: 1px dashed #b0b0b0; cursor: pointer; }
                .amc-check:first-child { border-top: none; }
                .amc-check .swatch { width: 14px; height: 14px; border-radius: 3px; background: var(--color); }
                .amc-check input { width: 16px; height: 16px; }

                .amc-search { display: grid; grid-template-columns: 40px 1fr; align-items: center; border: 1px solid #b0b0b0; border-radius: 4px; overflow: hidden; }
                .amc-search-icon { height: 40px; background: #fff; border-right: 1px solid #b0b0b0; }
                .amc-search input { height: 40px; border: none; padding: 0 12px; outline: none; font-size: 18px; }
                .amc-right-meta { padding: 10px 12px; border-left: 1px solid #b0b0b0; border-right: 1px solid #b0b0b0; border-bottom: 1px solid #b0b0b0; border-radius: 0 0 4px 4px; }
                .amc-drug-list { border: 1px solid #b0b0b0; border-radius: 4px; margin-top: 12px; overflow: hidden; }
                .amc-drug-row { display: grid; grid-template-columns: 1fr 34px 34px; gap: 8px; padding: 10px 12px; align-items: center; border-top: 1px dashed #b0b0b0; }
                .amc-drug-row:first-child { border-top: none; }
                .amc-drug-row.is-hidden { opacity: 0.55; }
                .amc-drug-name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 18px; }
                .amc-icon-btn { width: 34px; height: 34px; border: 1px solid transparent; background: transparent; cursor: pointer; border-radius: 4px; font-size: 16px; }
                .amc-icon-btn:hover { background: #f0f0f0; border-color: #b0b0b0; }

                .amc-head { display: flex; justify-content: space-between; padding: 0 50px; text-align: center; }
                .amc-total { width: 1px; display: flex; justify-content: center; white-space: nowrap; font-size: 12px; }
                .amc-total strong { font-weight: 600; margin-right: 4px; }
                .amc-sankey-tooltips { width: 100%; overflow: visible; position: relative; z-index: 50; }
                .amc-sankey { width: 100%; overflow: visible; }
                .tooltip-wrap { position: absolute; left: 0; top: 0; width: 100%; overflow: visible; pointer-events: none; z-index: 50; }
                .tooltip { pointer-events: none; position: absolute; z-index: 51; }

                @media (max-width: 1100px) {
                  .amc-layout { grid-template-columns: 1fr; }
                  .amc-head { padding: 0 12px; }
                }
            `;
            document.head.appendChild(style);
        }
    },

    // Prototype dashboard: Taiwan choropleth + dual-axis bar/line + table (based on the screenshot provided).
    // Data is mocked; wire your API/CSV later.
    renderCreResistanceDashboard: function (element) {
        if (!element || !window.d3) return;

        const years = d3.range(2015, 2025);
        const regions = [
            { id: "taipei", name: "Taipei" },
            { id: "north", name: "North" },
            { id: "central", name: "Central" },
            { id: "east", name: "East" },
            { id: "south", name: "South" },
            { id: "kaohsiung", name: "Kaohsiung" },
        ];

        // Mock data per region/year.
        const data = [];
        for (const r of regions) {
            for (const y of years) {
                const base = 180 + (y - 2015) * 18 + (r.id === "taipei" ? 70 : 0);
                const isolatesMc = Math.round(base + (Math.sin((y - 2015) / 2) * 40));
                const isolatesRh = Math.round(base * 0.65 + (Math.cos((y - 2015) / 2) * 30));
                const resMc = Math.min(95, Math.max(5, 52 + (y - 2015) * 0.9 + (r.id === "taipei" ? 6 : -2) + Math.sin((y - 2015) / 2) * 4));
                const resRh = Math.min(95, Math.max(5, 40 + (y - 2015) * 0.6 + (r.id === "taipei" ? 2 : -3) + Math.cos((y - 2015) / 2) * 4));
                data.push({
                    regionId: r.id,
                    year: y,
                    isolatesMc,
                    isolatesRh,
                    resMc,
                    resRh,
                });
            }
        }

        let selectedRegionId = "taipei";
        let selectedYear = 2024;

        // GeoJSON: Taiwan county boundaries (in wwwroot/data).
        const countyGeoUrl = `${window.d3ChartsDataBasePath || "data/"}COUNTY_MOI_1090820.json`;
        // Cache across renders/pages so we only fetch once.
        const countyGeoPromise =
            window.d3Charts.__twCountyGeoPromise ||
            (window.d3Charts.__twCountyGeoPromise = d3.json(countyGeoUrl));

        element.replaceChildren();
        ensureCreStyles();

        const root = d3.select(element).append("div").attr("class", "cre-root");
        const title = root.append("div").attr("class", "cre-title")
            .text("CRE Resistance Dashboard (2015-2024) - Prototype");

        const top = root.append("div").attr("class", "cre-top");
        const mapHost = top.append("div").attr("class", "cre-map");
        const chartHost = top.append("div").attr("class", "cre-chart");

        const bottom = root.append("div").attr("class", "cre-bottom");
        const keyboard = root.append("div").attr("class", "amr-chart-keyboard");
        const regionLabel = keyboard.append("label").text("Region ");
        regionLabel.append("select").attr("aria-label", "Region").on("change", function () { selectedRegionId = this.value; render(); })
            .selectAll("option").data(regions).join("option").attr("value", region => region.id).text(region => region.name);
        const yearLabel = keyboard.append("label").text("Year ");
        const yearSelect = yearLabel.append("select").attr("aria-label", "Year").on("change", function () { selectedYear = Number(this.value); render(); });
        yearSelect.selectAll("option").data(years).join("option").attr("value", year => year).text(year => year);
        yearSelect.property("value", selectedYear);

        function getRow(regionId, year) {
            return data.find((d) => d.regionId === regionId && d.year === year);
        }

        function formatInt(n) {
            return Number(n).toLocaleString("en-US");
        }

        function render() {
            mapHost.selectAll("*").remove();
            chartHost.selectAll("*").remove();
            bottom.selectAll("*").remove();

            renderMap();
            renderChart();
            renderTable();
        }

        function renderMap() {
            const w = 260;
            const h = 300;

            // Values are mocked (resMc) and binned into the same legend thresholds as the original screenshot.
            const legendBins = [
                { label: "<20 (white)", color: "#ffffff" },
                { label: "<=2", color: "#dbe9f6" },
                { label: ">2 - 4", color: "#bed6ee" },
                { label: ">4 - 6", color: "#95b7df" },
                { label: ">6 - 8", color: "#6b93cf" },
                { label: ">8 - 10", color: "#4a66b3" },
                { label: ">10", color: "#3b2a86" },
            ];

            function binColor(v) {
                if (!isFinite(v)) return "#ffffff";
                if (v <= 2) return legendBins[1].color;
                if (v <= 4) return legendBins[2].color;
                if (v <= 6) return legendBins[3].color;
                if (v <= 8) return legendBins[4].color;
                if (v <= 10) return legendBins[5].color;
                return legendBins[6].color;
            }

            function countyEngToRegionId(countyEng) {
                const c = String(countyEng || "").trim();
                const map = {
                    "Taipei City": "taipei",
                    "New Taipei City": "north",
                    "Keelung City": "north",
                    "Taoyuan City": "north",
                    "Hsinchu City": "north",
                    "Hsinchu County": "north",
                    "Yilan County": "north",

                    "Miaoli County": "central",
                    "Taichung City": "central",
                    "Changhua County": "central",
                    "Nantou County": "central",
                    "Yunlin County": "central",

                    "Hualien County": "east",
                    "Taitung County": "east",

                    "Chiayi City": "south",
                    "Chiayi County": "south",
                    "Tainan City": "south",
                    "Pingtung County": "south",

                    "Kaohsiung City": "kaohsiung",

                    "Kinmen County": "north",
                    "Lienchiang County": "north",
                    "Penghu County": "south",
                };
                return map[c] || "north";
            }

            const legend = mapHost.append("div").attr("class", "cre-legend");
            legend.append("div").attr("class", "cre-legend-title").text(" ");
            legend
                .selectAll("div.cre-legend-row")
                .data(legendBins)
                .join("div")
                .attr("class", "cre-legend-row")
                .html((d) => `<span class="sw" style="background:${d.color}"></span><span>${d.label}</span>`);

            const svg = mapHost
                .append("svg")
                .attr("class", "cre-map-svg")
                .attr("viewBox", `0 0 ${w} ${h}`)
                .attr("width", "100%")
                .attr("height", h)
                .style("overflow", "visible");

            const g = svg.append("g");
            g.append("text")
                .attr("x", 6)
                .attr("y", 16)
                .attr("font-size", 12)
                .attr("fill", "#666")
                .text("Loading map...");

            countyGeoPromise
                .then((geo) => {
                    g.selectAll("*").remove();

                    // This county file has polygon winding that makes d3.geoMercator fill the
                    // spherical complement, which appears as a solid rectangle. Treat the
                    // lon/lat pairs as planar coordinates for a stable county outline map.
                    // Use a fixed mainland Taiwan viewport. Automatic fit bounds are pulled outward
                    // by outlying islands in this county file, making the island render too small.
                    const mainlandBounds = {
                        minLon: 120.05,
                        maxLon: 122.0,
                        minLat: 21.85,
                        maxLat: 25.35,
                    };
                    const pad = 4;
                    const mapZoom = 1.2;
                    const baseScale = Math.min(
                        (w - pad * 2) / (mainlandBounds.maxLon - mainlandBounds.minLon),
                        (h - pad * 2) / (mainlandBounds.maxLat - mainlandBounds.minLat)
                    );
                    const scale = baseScale * mapZoom;
                    const offsetX = (w - (mainlandBounds.maxLon - mainlandBounds.minLon) * scale) / 2 + 42;
                    const offsetY = (h - (mainlandBounds.maxLat - mainlandBounds.minLat) * scale) / 2 - 41;
                    const projection = d3.geoTransform({
                        point(lon, lat) {
                            this.stream.point(
                                offsetX + (lon - mainlandBounds.minLon) * scale,
                                offsetY + (mainlandBounds.maxLat - lat) * scale
                            );
                        },
                    });
                    const path = d3.geoPath(projection);

                    const features = (geo && geo.features) ? geo.features : [];
                    const items = features.map((f) => {
                        const eng = f && f.properties ? (f.properties.COUNTYENG || "") : "";
                        const regionId = countyEngToRegionId(eng);
                        const row = getRow(regionId, selectedYear);
                        const value = row ? row.resMc : NaN;
                        return { feature: f, countyEng: eng, regionId, value };
                    });

                    g.selectAll("path.county")
                        .data(items)
                        .join("path")
                        .attr("class", "county")
                        .attr("d", (d) => path(d.feature))
                        .attr("fill", (d) => binColor(d.value))
                        .attr("stroke", (d) => (d.regionId === selectedRegionId ? "#111" : "rgba(0,0,0,0.35)"))
                        .attr("stroke-width", (d) => (d.regionId === selectedRegionId ? 2.1 : 0.7))
                        .style("cursor", "pointer")
                        .on("click", (event, d) => {
                            selectedRegionId = d.regionId;
                            render();
                        })
                        .append("title")
                        .text((d) => `${d.countyEng || "Unknown"} (${regions.find((r) => r.id === d.regionId)?.name || d.regionId})`);
                })
                .catch((err) => {
                    g.selectAll("*").remove();
                    g.append("text")
                        .attr("x", 6)
                        .attr("y", 16)
                        .attr("font-size", 12)
                        .attr("fill", "#b00020")
                        .text("Failed to load GeoJSON.");
                    // eslint-disable-next-line no-console
                    console.error("GeoJSON load failed:", err);
                });
        }

        function renderChart() {
            const margin = { top: 18, right: 60, bottom: 46, left: 54 };
            const width = Math.max(chartHost.node().clientWidth || 820, 640);
            const height = 320;
            const innerW = width - margin.left - margin.right;
            const innerH = height - margin.top - margin.bottom;

            const regionName = regions.find((r) => r.id === selectedRegionId)?.name || selectedRegionId;

            const rows = data.filter((d) => d.regionId === selectedRegionId);
            const maxIso = d3.max(rows, (d) => Math.max(d.isolatesMc, d.isolatesRh)) || 1;

            const svg = chartHost.append("svg")
                .attr("class", "cre-chart-svg")
                .attr("viewBox", `0 0 ${width} ${height}`)
                .attr("width", "100%")
                .attr("height", height);

            const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

            const x = d3.scaleBand().domain(years.map(String)).range([0, innerW]).padding(0.28);
            const x2 = d3.scaleBand().domain(["mc", "rh"]).range([0, x.bandwidth()]).padding(0.14);

            const yL = d3.scaleLinear().domain([0, maxIso * 1.15]).nice().range([innerH, 0]);
            const yR = d3.scaleLinear().domain([0, 100]).range([innerH, 0]);

            const bars = g.append("g").selectAll("g")
                .data(rows)
                .join("g")
                .attr("transform", (d) => `translate(${x(String(d.year))},0)`);

            bars.append("rect")
                .attr("x", x2("mc"))
                .attr("y", (d) => yL(d.isolatesMc))
                .attr("width", x2.bandwidth())
                .attr("height", (d) => innerH - yL(d.isolatesMc))
                .attr("fill", "#1b7f2a");

            bars.append("rect")
                .attr("x", x2("rh"))
                .attr("y", (d) => yL(d.isolatesRh))
                .attr("width", x2.bandwidth())
                .attr("height", (d) => innerH - yL(d.isolatesRh))
                .attr("fill", "#b9e769")
                .attr("stroke", "#2b7f2e")
                .attr("stroke-width", 1);

            const lineMc = d3.line()
                .x((d) => (x(String(d.year)) || 0) + x.bandwidth() / 2)
                .y((d) => yR(d.resMc))
                .curve(d3.curveMonotoneX);
            const lineRh = d3.line()
                .x((d) => (x(String(d.year)) || 0) + x.bandwidth() / 2)
                .y((d) => yR(d.resRh))
                .curve(d3.curveMonotoneX);

            g.append("path")
                .datum(rows)
                .attr("fill", "none")
                .attr("stroke", "#2f4f2f")
                .attr("stroke-width", 3)
                .attr("d", lineMc);

            g.append("path")
                .datum(rows)
                .attr("fill", "none")
                .attr("stroke", "#8aa38a")
                .attr("stroke-width", 2)
                .attr("d", lineRh);

            g.selectAll("circle.mc")
                .data(rows)
                .join("circle")
                .attr("class", "mc")
                .attr("cx", (d) => (x(String(d.year)) || 0) + x.bandwidth() / 2)
                .attr("cy", (d) => yR(d.resMc))
                .attr("r", 5)
                .attr("fill", "#2f4f2f");

            g.selectAll("circle.rh")
                .data(rows)
                .join("circle")
                .attr("class", "rh")
                .attr("cx", (d) => (x(String(d.year)) || 0) + x.bandwidth() / 2)
                .attr("cy", (d) => yR(d.resRh))
                .attr("r", 5)
                .attr("fill", "#8aa38a");

            g.append("g").call(d3.axisLeft(yL).ticks(5));
            g.append("g").attr("transform", `translate(${innerW},0)`).call(d3.axisRight(yR).ticks(5));
            g.append("g").attr("transform", `translate(0,${innerH})`).call(d3.axisBottom(x));

            g.append("text").attr("x", -38).attr("y", innerH / 2).attr("transform", `rotate(-90,-38,${innerH / 2})`).attr("font-weight", 700).text("Isolates");
            g.append("text").attr("x", innerW + 44).attr("y", innerH / 2).attr("transform", `rotate(90,${innerW + 44},${innerH / 2})`).attr("font-weight", 700).text("Resistance %");

            // Tooltip box (fixed at the right side like the screenshot).
            const tip = chartHost.append("div").attr("class", "cre-tip");
            function setTip(year) {
                selectedYear = year;
                const row = getRow(selectedRegionId, year);
                const prev = getRow(selectedRegionId, year - 1);
                const delta = prev ? (row.resMc - prev.resMc) : 0;
                const deltaText = `${delta >= 0 ? "+" : "-"}${Math.abs(delta).toFixed(1)}%`;
                tip.html(`<div class="cre-tip-year">${year}</div>
<div class="cre-tip-name">${regionName} - CRE</div>
<div class="cre-tip-line">Isolates: <b>${formatInt(row.isolatesMc)}</b>, Resistance: <b>${row.resMc.toFixed(0)}%</b></div>
<div class="cre-tip-line">YoY: <b>${deltaText}</b></div>`);
            }
            setTip(selectedYear);

            // Hover hit boxes per year.
            const hit = g.append("g").selectAll("rect.hit")
                .data(rows)
                .join("rect")
                .attr("class", "hit")
                .attr("x", (d) => x(String(d.year)))
                .attr("y", 0)
                .attr("width", x.bandwidth())
                .attr("height", innerH)
                .attr("fill", "transparent")
                .style("cursor", "pointer")
                .on("mousemove", (event, d) => setTip(d.year));
        }

        function renderTable() {
            const row = getRow(selectedRegionId, selectedYear);
            const prev = getRow(selectedRegionId, selectedYear - 1);
            const delta = prev ? (row.resMc - prev.resMc) : 0;

            const tbl = bottom.append("table").attr("class", "cre-table");
            tbl.append("thead").append("tr").html("<th>Region</th><th>Species</th><th>Resistance %</th><th>YoY</th>");

            const regionName = regions.find((r) => r.id === selectedRegionId)?.name || selectedRegionId;
            const inc = `${delta >= 0 ? "+" : "-"}${Math.abs(delta).toFixed(1)}%`;
            tbl.append("tbody").append("tr")
                .html(`<td>${regionName}</td><td>CRE</td><td>${row.resMc.toFixed(1)}%</td><td>${inc}</td>`);
        }

        function ensureCreStyles() {
            if (document.getElementById("cre-dash-styles")) return;
            const style = document.createElement("style");
            style.id = "cre-dash-styles";
            style.textContent = `
              .cre-root { display: grid; gap: 12px; font-family: Arial, sans-serif; color: #111; }
              .cre-title { font-weight: 800; font-size: 18px; text-align: center; }
              .cre-top { display: grid; grid-template-columns: 320px minmax(0, 1fr); gap: 18px; align-items: start; }
              .cre-map { border: 1px solid rgba(0,0,0,0.12); padding: 10px; overflow: hidden; }
              .cre-legend { display: grid; gap: 6px; margin-bottom: 10px; }
              .cre-legend-row { display: grid; grid-template-columns: 18px 1fr; gap: 8px; align-items: center; font-size: 12px; }
              .cre-legend-row .sw { width: 18px; height: 14px; border: 1px solid rgba(0,0,0,0.2); }
              .cre-chart { position: relative; }
              .cre-map-svg { overflow: visible; }
              .cre-tip { position: absolute; width: 320px; background: rgba(232, 242, 255, 0.9); border: 2px solid rgba(0,0,0,0.35); border-radius: 4px; padding: 12px 12px; }
              .cre-tip-year { font-weight: 900; font-size: 18px; }
              .cre-tip-name { margin-top: 6px; font-weight: 800; }
              .cre-tip-line { margin-top: 6px; }
              .cre-table { width: 100%; border-collapse: collapse; font-size: 14px; }
              .cre-table th, .cre-table td { border: 1px solid rgba(0,0,0,0.25); padding: 8px 10px; text-align: left; }
              @media (max-width: 980px) { .cre-top { grid-template-columns: 1fr; } .cre-tip { position: static; width: auto; margin-top: 10px; } }
            `;
            document.head.appendChild(style);
        }

        render();
        return window.d3Charts.accessibleTable(["Region", "Year", "Medical center isolates", "Regional hospital isolates", "Medical center resistance (%)", "Regional hospital resistance (%)"],
            data.map(row => [regions.find(region => region.id === row.regionId).name, row.year, row.isolatesMc, row.isolatesRh, row.resMc, row.resRh]));
    },

    renderFacetedStackedBarLine: function (element) {
        if (!element || !window.d3) return;

        const years = [2019, 2020, 2021, 2022, 2023, 2024];
        const levels = ["Medical center", "Regional hospital", "District hospital"];
        const sources = ["CO", "HO"];
        const sourceColor = d3.scaleOrdinal().domain(sources).range(["#c7d9ef", "#2f5f9e"]);
        const lineColors = {
            "Medical center": "#32669a",
            "Regional hospital": "#c7782f",
            "District hospital": "#8f8f8f",
            National: "#d4a915",
        };

        const baseByLevel = {
            "Medical center": 180,
            "Regional hospital": 205,
            "District hospital": 72,
        };

        const bars = [];
        years.forEach((year, yi) => {
            levels.forEach((level, li) => {
                const total = Math.max(36, baseByLevel[level] + Math.sin(yi * 1.18 + li) * 34 + yi * (li === 2 ? 3 : 7));
                const co = Math.round(total * (0.5 + Math.sin(yi + li) * 0.08));
                const ho = Math.round(total - co);
                bars.push({ year, level, source: "CO", isolates: co });
                bars.push({ year, level, source: "HO", isolates: ho });
            });
        });

        const lineSeries = [
            { name: "Medical center", values: [47, 47, 50, 55, 54, 47] },
            { name: "Regional hospital", values: [55, 59, 63, 64, 61, 58] },
            { name: "District hospital", values: [71, 76, 75, 78, 70, 75] },
            { name: "National", values: [53, 56, 60, 62, 59, 56] },
        ].map((series) => ({
            ...series,
            values: series.values.map((resistance, index) => ({ year: years[index], resistance })),
            visible: true,
        }));

        let activeYear = 2022;
        const hiddenLines = new Set();

        element.replaceChildren();
        ensureFacetedStyles();

        const root = d3.select(element).append("div").attr("class", "facet-root");
        root.append("div").attr("class", "facet-title").html("Isolates by year and resistance trend");
        const topHost = root.append("div").attr("class", "facet-panel facet-top");
        const bottomHost = root.append("div").attr("class", "facet-panel facet-bottom");
        const tooltip = root.append("div").attr("class", "facet-tip").style("display", "none");
        const keyboard = root.append("div").attr("class", "amr-chart-keyboard");
        const yearSelect = keyboard.append("label").text("Focus year ").append("select").attr("aria-label", "Focus year")
            .on("change", function () { activeYear = Number(this.value); render(); });
        yearSelect.selectAll("option").data(years).join("option").attr("value", year => year).text(year => year);
        yearSelect.property("value", activeYear);
        keyboard.selectAll("button").data(lineSeries).join("button").attr("type", "button")
            .attr("aria-pressed", "true").text(series => series.name).on("click", function (_, series) {
                if (hiddenLines.has(series.name)) hiddenLines.delete(series.name);
                else hiddenLines.add(series.name);
                this.setAttribute("aria-pressed", String(!hiddenLines.has(series.name)));
                render();
            });

        render();
        return window.d3Charts.accessibleTable(["Year", "Hospital level", "Source", "Isolates", "Resistance (%)"],
            [...bars.map(row => [row.year, row.level, row.source, row.isolates, null]), ...lineSeries.flatMap(series => series.values.map(row => [row.year, series.name, null, null, row.resistance]))]);

        function render() {
            topHost.selectAll("*").remove();
            bottomHost.selectAll("*").remove();
            renderBars();
            renderLines();
            setActiveYear(activeYear, null, false);
        }

        function barRows() {
            const rows = [];
            years.forEach((year) => {
                levels.forEach((level) => {
                    const pieces = sources.map((source) => bars.find((d) => d.year === year && d.level === level && d.source === source));
                    rows.push({
                        year,
                        level,
                        total: d3.sum(pieces, (d) => d?.isolates || 0),
                        pieces,
                    });
                });
            });
            return rows;
        }

        function renderBars() {
            const margin = { top: 18, right: 18, bottom: 78, left: 62 };
            const width = Math.max(topHost.node().clientWidth || 920, 760);
            const height = 250;
            const innerW = width - margin.left - margin.right;
            const innerH = height - margin.top - margin.bottom;
            const rows = barRows();
            const yearBand = d3.scaleBand().domain(years.map(String)).range([0, innerW]).paddingInner(0.2).paddingOuter(0.02);
            const levelBand = d3.scaleBand().domain(levels).range([0, yearBand.bandwidth()]).padding(0.18);
            const y = d3.scaleLinear().domain([0, Math.max(220, d3.max(rows, (d) => d.total) || 1)]).nice().range([innerH, 0]);

            const svg = topHost.append("svg")
                .attr("class", "facet-svg facet-bar-svg")
                .attr("viewBox", `0 0 ${width} ${height}`)
                .attr("width", "100%")
                .attr("height", height);
            const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

            g.append("g")
                .selectAll("rect.year-highlight")
                .data(years)
                .join("rect")
                .attr("class", "year-highlight bar-year-highlight")
                .attr("x", (d) => yearBand(String(d)))
                .attr("y", 0)
                .attr("width", yearBand.bandwidth())
                .attr("height", innerH)
                .attr("fill", "#cdebd1")
                .attr("opacity", 0);

            const groups = g.append("g")
                .selectAll("g.bar-stack")
                .data(rows)
                .join("g")
                .attr("class", "bar-stack")
                .attr("transform", (d) => `translate(${yearBand(String(d.year)) + levelBand(d.level)},0)`)
                .style("cursor", "pointer")
                .on("mousemove", (event, d) => {
                    setActiveYear(d.year, event, true, d);
                })
                .on("mouseleave", () => tooltip.style("display", "none"));

            groups.each(function (d) {
                let y0 = innerH;
                const group = d3.select(this);
                d.pieces.forEach((piece) => {
                    const h = y0 - y(piece.isolates);
                    group.append("rect")
                        .attr("x", 0)
                        .attr("y", y0 - h)
                        .attr("width", levelBand.bandwidth())
                        .attr("height", Math.max(0, h))
                        .attr("fill", sourceColor(piece.source))
                        .attr("stroke", "#42526b")
                        .attr("stroke-width", 0.7);
                    y0 -= h;
                });
            });

            g.append("g").call(d3.axisLeft(y).ticks(4));
            g.append("text")
                .attr("x", -42)
                .attr("y", innerH / 2)
                .attr("transform", `rotate(-90,-42,${innerH / 2})`)
                .attr("font-weight", 800)
                .text("Isolates (n)");

            const yearAxis = g.append("g").attr("transform", `translate(0,${innerH})`);
            yearAxis.selectAll("line.year-sep")
                .data(years.slice(1))
                .join("line")
                .attr("class", "year-sep")
                .attr("x1", (d) => yearBand(String(d)) - yearBand.step() * 0.1)
                .attr("x2", (d) => yearBand(String(d)) - yearBand.step() * 0.1)
                .attr("y1", 0)
                .attr("y2", 38)
                .attr("stroke", "#7d7d7d");
            yearAxis.selectAll("text.year-label")
                .data(years)
                .join("text")
                .attr("class", "year-label")
                .attr("x", (d) => yearBand(String(d)) + yearBand.bandwidth() / 2)
                .attr("y", 58)
                .attr("text-anchor", "middle")
                .attr("font-size", 18)
                .text((d) => d);

            g.selectAll("text.level-label")
                .data(rows)
                .join("text")
                .attr("class", "level-label")
                .attr("x", (d) => yearBand(String(d.year)) + levelBand(d.level) + levelBand.bandwidth() / 2)
                .attr("y", innerH + 10)
                .attr("text-anchor", "end")
                .attr("dominant-baseline", "middle")
                .attr("transform", (d) => `rotate(90,${yearBand(String(d.year)) + levelBand(d.level) + levelBand.bandwidth() / 2},${innerH + 10})`)
                .text((d) => d.level.replace(" hospital", ""));

            const legend = svg.append("g").attr("transform", `translate(${width - 168},14)`);
            legend.append("text").attr("x", 0).attr("y", -4).attr("font-weight", 700).text("Source");
            sources.forEach((source, index) => {
                const item = legend.append("g").attr("transform", `translate(${index * 58},8)`);
                item.append("rect").attr("width", 12).attr("height", 12).attr("fill", sourceColor(source)).attr("stroke", "#555");
                item.append("text").attr("x", 17).attr("y", 10).text(source);
            });
        }

        function renderLines() {
            const margin = { top: 46, right: 28, bottom: 54, left: 62 };
            const width = Math.max(bottomHost.node().clientWidth || 920, 760);
            const height = 310;
            const innerW = width - margin.left - margin.right;
            const innerH = height - margin.top - margin.bottom;
            const x = d3.scalePoint().domain(years.map(String)).range([0, innerW]).padding(0.55);
            const y = d3.scaleLinear().domain([0, 100]).range([innerH, 0]);

            const svg = bottomHost.append("svg")
                .attr("class", "facet-svg facet-line-svg")
                .attr("viewBox", `0 0 ${width} ${height}`)
                .attr("width", "100%")
                .attr("height", height);
            const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

            const yearWidth = innerW / years.length;
            g.append("g")
                .selectAll("rect.year-highlight")
                .data(years)
                .join("rect")
                .attr("class", "year-highlight line-year-highlight")
                .attr("x", (d) => x(String(d)) - yearWidth / 2)
                .attr("y", 0)
                .attr("width", yearWidth)
                .attr("height", innerH)
                .attr("fill", "#cdebd1")
                .attr("opacity", 0);

            const line = d3.line()
                .x((d) => x(String(d.year)))
                .y((d) => y(d.resistance))
                .curve(d3.curveMonotoneX);

            const visibleSeries = lineSeries.filter((s) => !hiddenLines.has(s.name));
            g.append("g").selectAll("path.line")
                .data(visibleSeries)
                .join("path")
                .attr("class", "facet-line")
                .attr("fill", "none")
                .attr("stroke", (d) => lineColors[d.name])
                .attr("stroke-width", 3)
                .attr("d", (d) => line(d.values));

            const points = visibleSeries.flatMap((s) => s.values.map((v) => ({ ...v, name: s.name })));
            g.append("g").selectAll("circle.point")
                .data(points)
                .join("circle")
                .attr("class", "facet-point")
                .attr("cx", (d) => x(String(d.year)))
                .attr("cy", (d) => y(d.resistance))
                .attr("r", 4.5)
                .attr("fill", (d) => lineColors[d.name])
                .style("cursor", "pointer")
                .on("mousemove", (event, d) => setActiveYear(d.year, event, true, null, d))
                .on("mouseleave", () => tooltip.style("display", "none"));

            g.append("g").call(d3.axisLeft(y).ticks(5));
            g.append("g").attr("transform", `translate(0,${innerH})`).call(d3.axisBottom(x));
            g.append("text")
                .attr("x", -42)
                .attr("y", innerH / 2)
                .attr("transform", `rotate(-90,-42,${innerH / 2})`)
                .attr("font-weight", 800)
                .text("Resistance (%)");
            g.append("text")
                .attr("x", innerW / 2)
                .attr("y", innerH + 44)
                .attr("text-anchor", "middle")
                .attr("font-weight", 800)
                .text("Year");

            g.append("g").selectAll("rect.hit")
                .data(years)
                .join("rect")
                .attr("class", "year-hit")
                .attr("x", (d) => x(String(d)) - yearWidth / 2)
                .attr("y", 0)
                .attr("width", yearWidth)
                .attr("height", innerH)
                .attr("fill", "transparent")
                .style("cursor", "pointer")
                .on("mousemove", (event, d) => setActiveYear(d, event, true))
                .on("mouseleave", () => tooltip.style("display", "none"));

            const legend = svg.append("g").attr("class", "facet-line-legend").attr("transform", `translate(${margin.left + 70},16)`);
            lineSeries.forEach((series, index) => {
                const x0 = index * 160;
                const item = legend.append("g")
                    .attr("transform", `translate(${x0},0)`)
                    .style("cursor", "pointer")
                    .on("click", () => {
                        if (hiddenLines.has(series.name)) hiddenLines.delete(series.name);
                        else hiddenLines.add(series.name);
                        render();
                    });
                item.append("line")
                    .attr("x1", 0)
                    .attr("x2", 34)
                    .attr("y1", 8)
                    .attr("y2", 8)
                    .attr("stroke", lineColors[series.name])
                    .attr("stroke-width", 3)
                    .attr("opacity", hiddenLines.has(series.name) ? 0.25 : 1);
                item.append("circle")
                    .attr("cx", 17)
                    .attr("cy", 8)
                    .attr("r", 4)
                    .attr("fill", lineColors[series.name])
                    .attr("opacity", hiddenLines.has(series.name) ? 0.25 : 1);
                item.append("text")
                    .attr("x", 42)
                    .attr("y", 12)
                    .attr("opacity", hiddenLines.has(series.name) ? 0.4 : 1)
                    .text(series.name);
            });
        }

        function setActiveYear(year, event, showTip, barDatum, pointDatum) {
            activeYear = year;
            root.selectAll(".year-highlight")
                .attr("opacity", (d) => Number(d) === Number(year) ? 0.55 : 0);

            if (!showTip || !event) return;
            const lines = lineSeries
                .filter((s) => !hiddenLines.has(s.name))
                .map((s) => {
                    const v = s.values.find((d) => d.year === year);
                    return `${s.name}: <b>${v ? v.resistance.toFixed(1) : "-"}%</b>`;
                })
                .join("<br>");
            const barText = barDatum
                ? `<div class="facet-tip-section">${barDatum.level}<br>Isolates: <b>${barDatum.total.toLocaleString("en-US")}</b></div>`
                : "";
            const pointText = pointDatum
                ? `<div class="facet-tip-section">${pointDatum.name}<br>Resistance: <b>${pointDatum.resistance.toFixed(1)}%</b></div>`
                : "";

            tooltip
                .style("display", "block")
                .style("left", `${event.offsetX + 18}px`)
                .style("top", `${event.offsetY + 18}px`)
                .html(`<div class="facet-tip-year">${year}</div>${barText}${pointText}<div class="facet-tip-section">${lines}</div>`);
        }

        function ensureFacetedStyles() {
            if (document.getElementById("faceted-stack-line-styles")) return;
            const style = document.createElement("style");
            style.id = "faceted-stack-line-styles";
            style.textContent = `
              .facet-root { position: relative; display: grid; gap: 14px; font-family: Arial, sans-serif; color: #111; }
              .facet-title { font-size: 24px; font-weight: 900; }
              .facet-panel { width: 100%; overflow: visible; }
              .facet-svg { display: block; overflow: visible; }
              .facet-bar-svg text, .facet-line-svg text { font-size: 13px; }
              .level-label { font-size: 11px; }
              .facet-line-legend text { font-size: 13px; font-weight: 700; }
              .facet-line { transition: opacity 120ms ease; }
              .facet-tip { position: absolute; z-index: 20; min-width: 190px; padding: 10px 12px; background: rgba(255,255,255,0.95); border: 1px solid #6b7280; box-shadow: 0 4px 16px rgba(0,0,0,0.14); pointer-events: none; font-size: 13px; line-height: 1.45; }
              .facet-tip-year { font-size: 18px; font-weight: 900; margin-bottom: 4px; }
              .facet-tip-section { margin-top: 6px; }
              @media (max-width: 900px) {
                .facet-title { font-size: 20px; }
              }
            `;
            document.head.appendChild(style);
        }
    },

    renderHeatmap: async function (element) {
        if (!element || !window.d3) return;

        const antibioticsSortOrder = {
            "Oxacillin": 1,
            "Ampicillin": 2,
            "Amoxicillin/Clavulanate": 3,
            "Piperacillin/Tazobactam": 4,
            "Ceftriaxone": 5,
            "Ceftazidime": 6,
            "Meropenem": 7,
            "Ertapenem": 8,
            "Clindamycin": 9,
            "Ciprofloxacin": 10,
            "Nitrofurantoin": 11,
            "Trimethoprim/Sulfamethoxazole": 12,
            "Gentamicin": 13,
            "Tobramycin": 14,
            "Amikacin": 15,
            "Vancomycin": 16,
            "Linezolid": 17,
            "Daptomycin": 18,
        };

        const defaultColors = [
            "#ffffff",
            "#9e0522",
            "#c22a26",
            "#cc4f25",
            "#d67324",
            "#e09823",
            "#eabc22",
            "#f5e121",
            "#b8c924",
            "#7cb228",
            "#409b2b",
            "#04842f",
            "#004b23",
        ];
        const accessibleColors = [
            "#ffffff",
            "#54478c",
            "#2c699a",
            "#048ba8",
            "#0db39e",
            "#16db93",
            "#83e377",
            "#b9e769",
            "#efea5a",
            "#f1c453",
            "#f29e4c",
            "#dc2f02",
            "#6a040f",
        ];
        const scaleDomain = [0, 49.99, 54.99, 59.99, 64.99, 69.99, 74.99, 79.99, 84.99, 89.99, 94.99, 99.01];
        let useAccessibleColors = false;

        const data = await d3.csv(`${window.d3ChartsDataBasePath || "data/"}humandata.csv`);

        element.replaceChildren();
        ensureHeatmapStyles();

        const root = d3.select(element)
            .append("div")
            .attr("class", "amr-heatmap");

        const controls = root.append("div")
            .attr("class", "amr-heatmap-controls");

        controls.append("div")
            .attr("class", "amr-heatmap-info")
            .html("<strong>Info:</strong> Click the boxes of the antibiogram to display more information.");

        const selectWrap = controls.append("label")
            .attr("class", "amr-heatmap-select");
        selectWrap.append("span").text("Specimen type:");
        const specimenSelect = selectWrap.append("select");
        const specimenTypes = Array.from(new Set(data.map((d) => d.specimen_type).filter(Boolean)));

        specimenSelect.selectAll("option")
            .data(specimenTypes)
            .join("option")
            .attr("value", (d) => d)
            .text((d) => d);

        controls.append("button")
            .attr("type", "button")
            .attr("class", "amr-heatmap-button")
            .text("Change colour scheme")
            .on("click", function () {
                useAccessibleColors = !useAccessibleColors;
                draw(specimenSelect.property("value"));
            });

        const figure = root.append("div").attr("class", "amr-heatmap-figure");
        const chartHost = figure.append("div").attr("class", "amr-heatmap-chart");
        const dynamicText = figure.append("div")
            .attr("class", "amr-heatmap-text")
            .attr("role", "status")
            .html("Select a cell to see details.");
        const legendHost = figure.append("div").attr("class", "amr-heatmap-legend");

        specimenSelect.on("change", function () {
            dynamicText.html("Select a cell to see details.");
            draw(this.value);
        });

        draw(specimenTypes.includes("Blood") ? "Blood" : specimenTypes[0]);
        return window.d3Charts.accessibleTable(data.columns, data.map(row => data.columns.map(column => row[column])));

        function draw(specimenType) {
            chartHost.selectAll("*").remove();
            legendHost.selectAll("*").remove();

            const antibiotics = getAntibiotics(specimenType)
                .sort((a, b) => (antibioticsSortOrder[a] || 999) - (antibioticsSortOrder[b] || 999));
            const negativeOrganisms = getOrganisms(specimenType, "Gram Negative");
            const positiveOrganisms = getOrganisms(specimenType, "Gram Positive");
            const currentData = data.filter((d) => d.specimen_type === specimenType && d.year === "2024");
            const boxSize = 42;
            const margin = { top: 44, right: 160, bottom: 10, left: 210 };
            const spaceTop = 100;
            const width = 1100;
            const height = 500;
            const innerWidth = boxSize * antibiotics.length;
            const topSize = boxSize * negativeOrganisms.length;
            const bottomStart = topSize + 40;

            const svg = chartHost.append("svg")
                .attr("preserveAspectRatio", "xMinYMin meet")
                .attr("viewBox", `0 0 ${width} ${height}`)
                .attr("class", "amr-heatmap-svg")
                .attr("role", "img");

            const g = svg.append("g")
                .attr("transform", `translate(${margin.left},${margin.top + spaceTop})`);

            const x = d3.scaleBand()
                .domain(antibiotics)
                .range([0, innerWidth])
                .padding(0.05);
            const yNegative = d3.scaleBand()
                .domain(negativeOrganisms)
                .range([0, topSize])
                .padding(0.05);
            const yPositive = d3.scaleBand()
                .domain(positiveOrganisms)
                .range([bottomStart, bottomStart + boxSize * positiveOrganisms.length])
                .padding(0.05);

            g.append("g")
                .attr("class", "amr-heatmap-x-axis")
                .call(d3.axisTop(x).tickSize(0))
                .call((axis) => axis.select(".domain").remove())
                .selectAll("text")
                .attr("font-size", 16)
                .attr("text-anchor", "start")
                .attr("transform", "rotate(-60)")
                .attr("dx", "0.2em")
                .attr("dy", "0.2em")
                .each(wrapSlashLabel);

            g.append("g")
                .attr("class", "amr-heatmap-y-axis")
                .style("font-size", 16)
                .style("font-style", "italic")
                .call(d3.axisLeft(yNegative).tickSize(0))
                .call((axis) => axis.select(".domain").remove());

            g.append("text")
                .text("Gram negative organisms")
                .attr("x", -margin.left + margin.left / 10)
                .attr("y", 0)
                .attr("font-size", 14)
                .attr("font-weight", "bold");

            g.append("g")
                .attr("class", "amr-heatmap-y-axis")
                .style("font-size", 16)
                .style("font-style", "italic")
                .call(d3.axisLeft(yPositive).tickSize(0))
                .call((axis) => axis.select(".domain").remove());

            g.append("text")
                .text("Gram positive organisms")
                .attr("x", -margin.left + margin.left / 10)
                .attr("y", bottomStart)
                .attr("font-size", 14)
                .attr("font-weight", "bold");

            const color = d3.scaleThreshold()
                .domain(scaleDomain)
                .range(useAccessibleColors ? accessibleColors : defaultColors);

            const cell = g.selectAll(".amr-heatmap-cell")
                .data(currentData)
                .join("g")
                .attr("class", "amr-heatmap-cell");

            cell.append("rect")
                .attr("x", (d) => x(d.antibiotic))
                .attr("y", (d) => getY(d, yNegative, yPositive))
                .attr("width", x.bandwidth())
                .attr("height", (d) => getBandHeight(d, yNegative, yPositive))
                .attr("tabindex", 0)
                .attr("role", "button")
                .attr("aria-label", (d) => getAriaLabel(d))
                .style("fill", (d) => getCellFill(d, color))
                .style("stroke", "black")
                .style("stroke-width", 0.8)
                .on("mouseover", function () {
                    d3.select(this).style("stroke-width", 3);
                })
                .on("mouseleave", function () {
                    d3.select(this).style("stroke-width", 0.8);
                })
                .on("click", function (event, d) {
                    showCellDetails(d);
                })
                .on("keydown", function (event, d) {
                    if (event.key === "Enter" || event.key === " ") { event.preventDefault(); showCellDetails(d); }
                });

            cell.append("text")
                .attr("x", (d) => x(d.antibiotic) + x.bandwidth() / 2)
                .attr("y", (d) => getY(d, yNegative, yPositive) + getBandHeight(d, yNegative, yPositive) / 2)
                .attr("text-anchor", "middle")
                .attr("dominant-baseline", "central")
                .attr("font-size", 20)
                .style("pointer-events", "none")
                .style("fill", (d) => getTextColor(d))
                .text((d) => getCellText(d));

            renderLegend(legendHost, useAccessibleColors ? accessibleColors : defaultColors);
        }

        function getAntibiotics(specimenType) {
            return Array.from(new Set(data
                .filter((d) => d.specimen_type === specimenType)
                .map((d) => d.antibiotic)
                .filter(Boolean)));
        }

        function getOrganisms(specimenType, organismType) {
            return Array.from(new Set(data
                .filter((d) => d.specimen_type === specimenType && d.organism_type === organismType)
                .map((d) => d.organism)));
        }

        function getY(d, yNegative, yPositive) {
            return d.organism_type === "Gram Negative" ? yNegative(d.organism) : yPositive(d.organism);
        }

        function getBandHeight(d, yNegative, yPositive) {
            return d.organism_type === "Gram Negative" ? yNegative.bandwidth() : yPositive.bandwidth();
        }

        function getNumericPercent(d) {
            if (
                d.percent_susceptibility === null ||
                d.percent_susceptibility === undefined ||
                String(d.percent_susceptibility).trim() === "" ||
                String(d.percent_susceptibility).toUpperCase() === "NA" ||
                String(d.percent_susceptibility).toUpperCase() === "R"
            ) {
                return null;
            }

            const value = Number(d.percent_susceptibility);
            return Number.isFinite(value) ? value : null;
        }

        function getCellFill(d, color) {
            const value = getNumericPercent(d);
            if (value !== null && Number(d.number_of_tests_conducted) > 0) return color(value);
            if (d.percent_susceptibility === "R") return "#bfbfbf";
            return "#ffffff";
        }

        function getCellText(d) {
            const value = getNumericPercent(d);
            if (d.percent_susceptibility === "R") return "-";
            if (value === null) return "";
            if (value > 99 && value < 100) return ">99";
            if (value < 1) return "<1";
            return Math.round(value);
        }

        function getTextColor(d) {
            const scale = d3.scaleThreshold().domain(scaleDomain).range(useAccessibleColors ? accessibleColors : defaultColors);
            const background = d3.rgb(getCellFill(d, scale));
            const luminance = [background.r, background.g, background.b].map(value => {
                value /= 255;
                return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
            }).reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0);
            return (luminance + .05) / .05 >= 1.05 / (luminance + .05) ? "#000000" : "#ffffff";
        }

        function showCellDetails(d) {
            const value = getNumericPercent(d);
            if (value !== null && Number(d.number_of_tests_conducted) > 0) {
                dynamicText.html(
                    `In <strong>${d.year}</strong>, the percent susceptibility of ` +
                    `<strong><em>${d.organism}</em></strong> found in <strong>${d.specimen_type.toLowerCase()}</strong> ` +
                    `to <strong>${d.antibiotic.toLowerCase()}</strong> was <strong>${getCellText(d)}%</strong>. ` +
                    `<strong><em>${d.organism}</em></strong> was tested in ` +
                    `<strong>${formatWholeNumber(d.number_of_tests_conducted)}</strong> tests and was found susceptible in ` +
                    `<strong>${formatWholeNumber(d.s)}</strong> tests.`
                );
            } else if (d.percent_susceptibility === "R") {
                dynamicText.html(`<strong><em>${d.organism}</em></strong> is intrinsically resistant to <strong>${d.antibiotic.toLowerCase()}</strong>.`);
            } else {
                dynamicText.html(`No data available for <strong><em>${d.organism}</em></strong> and <strong>${d.antibiotic.toLowerCase()}</strong>.`);
            }
        }

        function getAriaLabel(d) {
            const value = getNumericPercent(d);
            if (value !== null) return `Susceptibility of ${d.organism} to ${d.antibiotic} is ${Math.round(value)} percent`;
            if (d.percent_susceptibility === "R") return `${d.organism} is intrinsically resistant to ${d.antibiotic}`;
            return `No data available for ${d.organism} and ${d.antibiotic}`;
        }

        function renderLegend(host, colors) {
            const labels = ["0-49", "50", "55", "60", "65", "70", "75", "80", "85", "90", "95", ">99"];
            host.append("div")
                .attr("class", "amr-legend-title")
                .text("Percent susceptibility");

            const legend = host.append("div").attr("class", "amr-legend");
            legend.append("div")
                .attr("class", "amr-legend-labels")
                .selectAll("span")
                .data(labels)
                .join("span")
                .text((d) => d);

            legend.append("div")
                .attr("class", "amr-legend-colors")
                .selectAll("span")
                .data(colors.slice(1))
                .join("span")
                .style("background", (d) => d);

            const special = host.append("div").attr("class", "amr-legend-special");
            special.append("span").html("<i class='amr-legend-resistant'></i> Intrinsically resistant");
            special.append("span").html("<i class='amr-legend-empty'></i> Not tested/reported");
        }

        function wrapSlashLabel() {
            const label = d3.select(this);
            const labelText = label.text();
            if (!labelText.includes("/")) return;

            const parts = labelText.replace("/", " /,").split(",");
            label.text("");
            label.append("tspan")
                .attr("dx", "0em")
                .attr("dy", "-0.2em")
                .text(parts[0]);
            label.append("tspan")
                .attr("x", 0)
                .attr("dx", "1.3em")
                .attr("dy", "1.1em")
                .text(parts[1]);
        }

        function formatWholeNumber(value) {
            return Number(value).toLocaleString("en-US", { maximumFractionDigits: 0 });
        }

        function ensureHeatmapStyles() {
            if (document.getElementById("amr-heatmap-styles")) return;

            const style = document.createElement("style");
            style.id = "amr-heatmap-styles";
            style.textContent = `
        .amr-heatmap { display: grid; gap: 16px; font-family: Arial, sans-serif; }
        .amr-heatmap-controls { display: grid; grid-template-columns: 1fr auto auto; align-items: end; gap: 16px; }
        .amr-heatmap-info { font-size: 0.86rem; color: #374151; }
        .amr-heatmap-select { display: grid; gap: 4px; font-size: 0.9rem; font-weight: 600; }
        .amr-heatmap-select select { min-width: 160px; height: 36px; border: 1px solid #9ca3af; background: #fff; padding: 0 8px; }
        .amr-heatmap-button { height: 36px; border: 1px solid #1d4ed8; background: #2563eb; color: #fff; padding: 0 12px; font-weight: 600; cursor: pointer; }
        .amr-heatmap-figure { display: grid; grid-template-columns: minmax(0, 1fr); gap: 12px; }
        .amr-heatmap-chart { width: 100%; overflow-x: auto; }
        .amr-heatmap-svg { width: min(100%, 1160px); min-width: 0; height: auto; overflow: visible; }
        .amr-heatmap-text { min-height: 76px; border-left: 4px solid #2563eb; background: #f8fafc; padding: 12px 14px; font-size: 1rem; line-height: 1.5; }
        .amr-heatmap-legend { justify-self: end; text-align: left; max-width: 100%; overflow-x: auto; }
        .amr-legend-title { font-weight: 700; margin-bottom: 4px; }
        .amr-legend { display: inline-grid; gap: 2px; }
        .amr-legend-labels, .amr-legend-colors { display: grid; grid-template-columns: repeat(12, 32px); }
        .amr-legend-labels span { font-size: 0.75rem; text-align: center; }
        .amr-legend-colors span { height: 20px; border-top: 1px solid rgba(0,0,0,0.12); border-bottom: 1px solid rgba(0,0,0,0.12); }
        .amr-legend-special { display: flex; flex-wrap: wrap; gap: 20px; margin-top: 10px; font-size: 0.85rem; }
        .amr-legend-special span { display: inline-flex; align-items: center; gap: 6px; }
        .amr-legend-special i { width: 20px; height: 20px; display: inline-block; border: 1px solid #555; }
        .amr-legend-resistant { background: #bfbfbf; }
        .amr-legend-empty { background: #fff; }
        @media (max-width: 800px) {
          .amr-heatmap-controls { grid-template-columns: 1fr; align-items: stretch; }
          .amr-heatmap-button { width: 100%; }
        }
      `;
            document.head.appendChild(style);
        }
    },

    exportHeatmapPng: async function (element) {
        const svg = element?.querySelector(".amr-heatmap-svg");
        if (!svg) throw new Error("Heatmap chart is not ready.");

        const clone = svg.cloneNode(true);
        clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");

        const viewBox = svg.viewBox.baseVal;
        const width = viewBox.width || 1100;
        const height = viewBox.height || 500;
        const scale = 2;
        const canvas = document.createElement("canvas");
        canvas.width = width * scale;
        canvas.height = height * scale;

        const image = new Image();
        const blob = new Blob(
            [new XMLSerializer().serializeToString(clone)],
            { type: "image/svg+xml;charset=utf-8" });
        const url = URL.createObjectURL(blob);

        try {
            image.src = url;
            await image.decode();

            const context = canvas.getContext("2d");
            context.fillStyle = "#ffffff";
            context.fillRect(0, 0, canvas.width, canvas.height);
            context.drawImage(image, 0, 0, canvas.width, canvas.height);

            return await new Promise((resolve, reject) => {
                canvas.toBlob(
                    (pngBlob) => pngBlob ? resolve(pngBlob) : reject(new Error("Unable to create heatmap image.")),
                    "image/png");
            });
        } finally {
            URL.revokeObjectURL(url);
        }
    },

    downloadFileFromStream: async function (fileName, contentStreamReference) {
        const arrayBuffer = await contentStreamReference.arrayBuffer();
        const blob = new Blob(
            [arrayBuffer],
            { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = fileName;
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(url);
    }
};
