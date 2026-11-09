const instances = new WeakMap();

export async function render(host, query, receiver) {
    const report = buildReportData(query);
    if (report.kind === "susceptibility-heatmap") {
        dispose(host);
        const { renderSusceptibilityHeatmap } = await import("./amrSusceptibilityHeatmap.js");
        const state = { query, report, legendSelected: {}, renderer: "d3" };
        state.chart = await renderSusceptibilityHeatmap(host, query, report, chartText);
        state.observer = new ResizeObserver(() => state.chart.resize());
        state.observer.observe(host);
        instances.set(host, state);
        return;
    }
    if (report.kind === "isolate-alluvial") {
        dispose(host);
        const { renderIsolateAlluvial } = await import("./amrIsolateAlluvial.js");
        const state = { query, report, legendSelected: {}, renderer: "d3" };
        state.chart = await renderIsolateAlluvial(host, query, report, chartText);
        state.observer = new ResizeObserver(() => state.chart.resize());
        state.observer.observe(host);
        instances.set(host, state);
        return;
    }
    if (report.kind === "consumption" && query.renderer !== "echarts") {
        dispose(host);
        const { renderConsumption } = await import("./amrConsumptionChart.js");
        const state = { query, report, legendSelected: {}, renderer: "d3" };
        state.chart = await renderConsumption(host, query, report, consumptionLayout, consumptionColors, chartText, selected => { state.legendSelected = selected; });
        state.observer = new ResizeObserver(() => state.chart.resize());
        state.observer.observe(host);
        instances.set(host, state);
        return;
    }
    if (instances.get(host)?.renderer === "d3") dispose(host);
    const engine = await loadEngine();
    let state = instances.get(host);
    if (!state) {
        const chart = engine.init(host, null, { renderer: "svg" });
        const observer = new ResizeObserver(() => {
            chart.resize();
            instances.get(host)?.decorate?.();
        });
        observer.observe(host);
        state = { chart, observer };
        instances.set(host, state);
    }
    state.query = query;
    state.report = report;
    if (report.kind === "map") await loadRegions(engine);
    state.chart.off("click");
    state.chart.off("mouseover");
    state.chart.off("mouseout");
    state.chart.off("globalout");
    state.chart.off("legendselectchanged");
    state.chart.off("timelinechanged");
    state.legendSelected = {};
    state.focusRegion = null;
    state.focusAntibiotic = null;
    state.focusConsumption = null;
    state.focusClass = null;
    state.focusCorrelation = false;
    state.focusYear = query.focusYear ?? null;
    state.decorate = null;
    state.activateClick = null;
    state.chart.setOption(buildOptions(query, report), true);
    if (report.kind === "mdro-facets") {
        state.decorate = () => state.chart.setOption({ graphic: { elements: mdroYearBand(state.chart, report, state.focusYear) } });
        state.decorate();
    }
    state.chart.on("legendselectchanged", event => {
        const translations = query.translations ?? {};
        const canonicalName = name => Object.keys(translations).find(key => translations[key] === name) ?? name;
        const selected = Object.fromEntries(Object.entries(event.selected).map(([name, visible]) => [canonicalName(name), visible]));
        state.legendSelected = report.kind === "mdro-facets" ? { ...state.legendSelected, ...selected } : selected;
        if (report.kind === "class-share") {
            const options = classShareOptions(query, report, selected);
            state.chart.setOption(query.english ? localizeOptions(options, query) : options, true);
        }
        if (report.kind === "consumption") {
            const options = consumptionOptions(query, report, selected);
            state.chart.setOption(query.english ? localizeOptions(options, query) : options, true);
        }
        if (report.kind === "organism-trend") state.chart.setOption({ yAxis: organismAxis(report, selected) });
        if (report.kind === "antibiotic-trend") state.chart.setOption({ yAxis: antibioticAxis(report, selected) });
        if (report.kind === "map") {
            const options = { yAxis: mdroTrend(query, report, state.focusRegion, selected).yAxis };
            state.chart.setOption(query.english ? localizeOptions(options, query) : options);
        }
        if (report.kind === "hai-rate") {
            state.chart.setOption({ series: [
                { id: "hai-boxes", data: report.rows.map(row => selected[row.name] === false ? "-" : { name: chartText(row.name, query), value: [row.low, row.q1, row.median, row.q3, row.high] }) },
                { id: "hai-means", data: report.rows.flatMap((row, index) => selected[row.name] === false ? [] : [[index, row.average]]) },
                { id: "hai-annotations", data: [] }
            ] });
        }
    });
    if (report.kind === "hai-rate") {
        const annotations = haiRateAnnotations(report);
        const hideAnnotations = () => state.chart.setOption({ series: [{ id: "hai-annotations", data: [] }] });
        state.chart.on("mouseover", event => {
            if (event.seriesId !== "hai-boxes") return;
            state.chart.setOption({ series: [{ id: "hai-annotations", data: annotations.data.filter(item => item[0] === event.dataIndex) }] });
        });
        state.chart.on("mouseout", event => { if (event.seriesId === "hai-boxes") hideAnnotations(); });
        state.chart.on("globalout", hideAnnotations);
    }
    if (report.kind === "hai-density") {
        bindChartClick(state, event => {
            if (event.componentType !== "xAxis") return;
            const groupRows = report.rows.filter(row => row.group && chartText(row.group, query) === event.value);
            if (groupRows.length) {
                const hide = groupRows.some(row => state.legendSelected[row.name] !== false);
                for (const row of groupRows) state.legendSelected[row.name] = !hide;
                state.chart.setOption({ series: buildHaiDensityOptions(report, state.legendSelected).series });
                return;
            }
            const index = report.rows.findIndex(row => chartText(row.name, query) === event.value);
            if (index < 0) return;
            const name = report.rows[index].name;
            state.legendSelected[name] = state.legendSelected[name] === false;
            const options = buildHaiDensityOptions(report, state.legendSelected);
            state.chart.setOption({ series: options.series });
        });
    }
    if (report.kind === "map") {
        bindChartClick(state, event => {
            if (event.seriesType !== "map") return;
            const region = report.labels.find(name => name === event.name || chartText(name, query) === event.name);
            if (!region) return;
            state.focusRegion = state.focusRegion === region ? null : region;
            const options = mdroTrend(query, report, state.focusRegion, state.legendSelected);
            state.chart.setOption(query.english ? localizeOptions({ ...options, title: { text: mdroTitle(query, state.focusRegion) } }, query) : { ...options, title: { text: mdroTitle(query, state.focusRegion) } });
        });
        state.chart.on("timelinechanged", () => {
            const options = mdroTrend(query, report, state.focusRegion, state.legendSelected);
            state.chart.setOption(query.english ? localizeOptions({ ...options, title: { text: mdroTitle(query, state.focusRegion) } }, query) : { ...options, title: { text: mdroTitle(query, state.focusRegion) } });
        });
    }
    if (report.kind === "correlation") {
        bindChartClick(state, event => {
            if (event.seriesType !== "scatter") return;
            state.focusCorrelation = !state.focusCorrelation;
            const options = correlationOptions(query, report, state.focusCorrelation);
            state.chart.setOption(query.english ? localizeOptions(options, query) : options, true);
        });
    }
    if (report.kind === "class-share") {
        bindChartClick(state, event => {
            if (event.seriesType !== "bar") return;
            const name = event.data?.row?.name;
            if (!name) return;
            state.focusClass = state.focusClass === name ? null : name;
            state.legendSelected = Object.fromEntries(report.labels.map(label => [label, !state.focusClass || label === name]));
            const options = classShareOptions(query, report, state.legendSelected);
            state.chart.setOption(query.english ? localizeOptions(options, query) : options, true);
        });
    }
    if (report.kind === "consumption") {
        bindChartClick(state, event => {
            if (event.seriesType !== "custom") return;
            const name = event.data?.row?.name;
            if (!name) return;
            state.focusConsumption = state.focusConsumption === name ? null : name;
            state.legendSelected = Object.fromEntries(report.labels.map(label => [label, !state.focusConsumption || label === name]));
            const options = consumptionOptions(query, report, state.legendSelected);
            state.chart.setOption(query.english ? localizeOptions(options, query) : options, true);
        });
    }
    if (report.kind === "antibiotic-trend") {
        bindChartClick(state, event => {
            if (event.seriesType !== "line") return;
            state.focusAntibiotic = state.focusAntibiotic === event.seriesName ? null : event.seriesName;
            for (const name of report.labels) state.chart.dispatchAction({ type: !state.focusAntibiotic || name === state.focusAntibiotic ? "legendSelect" : "legendUnSelect", name });
            state.legendSelected = Object.fromEntries(report.labels.map(name => [name, !state.focusAntibiotic || name === state.focusAntibiotic]));
            state.chart.setOption({ yAxis: antibioticAxis(report, state.legendSelected) });
        });
    }
    if (report.kind === "mdro-facets") {
        let hoveredYear = null;
        const hoverYear = year => {
            if (hoveredYear === year) return;
            hoveredYear = year;
            const series = state.chart.getOption().series.slice(0, report.categories.length);
            state.chart.dispatchAction({ type: "downplay", seriesIndex: series.map((_, index) => index) });
            state.chart.setOption({ series: series.map(seriesOption => ({
                data: seriesOption.data.map(point => ({ ...point, itemStyle: { ...point.itemStyle,
                    opacity: year ? point.row.year === year ? 1 : .25 : !state.focusYear || point.row.year === state.focusYear ? 1 : .35
                } }))
            })) });
            if (year) state.chart.dispatchAction({ type: "highlight", batch: series.map((seriesOption, seriesIndex) => ({
                seriesIndex, dataIndex: seriesOption.data.flatMap((point, index) => point.row.year === year ? [index] : [])
            })) });
        };
        state.chart.on("mouseover", event => {
            if (event.seriesType === "bar") hoverYear(event.data?.row?.year ?? null);
        });
        state.chart.on("mouseout", event => {
            if (event.seriesType === "bar") hoverYear(null);
        });
        state.chart.on("globalout", () => hoverYear(null));
        const highlightYear = year => {
            hoveredYear = null;
            state.focusYear = year;
            const options = mdroFacetOptions(query, report, year, state.legendSelected);
            state.chart.setOption(query.english ? localizeOptions(options, query) : options, true);
            state.decorate();
        };
        bindChartClick(state, event => {
            if (event.componentType === "xAxis") {
                const year = Number(String(event.value).split("|")[0]);
                if (report.years.includes(year)) highlightYear(state.focusYear === year ? null : year);
                return;
            }
            const year = event.data?.row?.year;
            if (!year) return;
            highlightYear(state.focusYear === year ? null : year);
            if (event.seriesType === "bar" && ["CO", "HO"].includes(event.seriesName)) {
                receiver?.invokeMethodAsync("SelectSourceYear", event.seriesName, year);
            }
        });
    }
    if (report.kind === "facets") {
        bindChartClick(state, event => {
            if (event.seriesType === "bar") {
                if (event.seriesName === "CO" || event.seriesName === "HO") {
                    receiver?.invokeMethodAsync("SelectSource", event.seriesName);
                    return;
                }
                const year = Number(event.name);
                for (let index = 0; index < report.labels.length; index++) state.chart.dispatchAction({ type: "highlight", seriesIndex: report.labels.length * 2 + index, dataIndex: report.years.indexOf(year) });
            }
        });
    }
}

function bindChartClick(state, handler) {
    state.activateClick = handler;
    state.chart.on("click", handler);
}

export function accessibleTable(host) {
    const { query, report } = instances.get(host);
    const rows = report.kind === "mdro-facets" ? mdroExportRows(report) : report.rows;
    const keys = Array.from(new Set(rows.flatMap(row => Object.keys(row))));
    const names = {
        year: "年度", name: "項目", value: "數值", unit: "單位", count: "筆數", total: "總數",
        hospital: "醫院層級", site: "感染部位", antibiotic: "抗生素", organism: "菌種",
        low: "下鬚", q1: "第 25 百分位", median: "中位數", average: "平均值", q3: "第 75 百分位", high: "上鬚",
        min: "最小值", max: "最大值", group: "群組", percent: "百分比 (%)", rank: "排名", status: "狀態",
        panel: "圖表面板", category: "分類", co: "社區來源", ho: "醫院來源",
        susceptible: "敏感性菌株", nonsusceptible: "非敏感性菌株"
    };
    return {
        english: !!query.english,
        headers: keys.map(key => query.english ? key : names[key] ?? key),
        rows: rows.map(row => keys.map(key => row[key] == null ? "—" : String(chartText(row[key], query))))
    };
}

export function renderKeyboardControls(host, controls) {
    const state = instances.get(host);
    const { query, report } = state;
    controls.replaceChildren();
    controls.setAttribute("role", "group");
    controls.setAttribute("aria-label", query.english ? "Keyboard chart controls" : "圖表鍵盤操作");
    const add = (label, action) => {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = label;
        button.addEventListener("click", action);
        controls.append(button);
    };
    if (state.renderer === "d3") {
        if (report.kind === "consumption") {
            for (const name of report.labels) {
                add(`${query.english ? "Show/hide" : "顯示／隱藏"} ${chartText(name, query)}`, () => state.chart.toggleSelection(name));
                add(`${query.english ? "Focus" : "切換聚焦"} ${chartText(name, query)}`, () => state.chart.focus(name));
            }
        }
        return;
    }
    const option = state.chart.getOption();
    const legends = [...new Set((option.legend ?? []).filter(legend => legend.show !== false)
        .flatMap(legend => legend.data?.length ? legend.data : (report.labels ?? []).map(name => chartText(name, query)))
        .map(item => typeof item === "string" ? item : item.name))];
    for (const name of legends) {
        const label = `${query.english ? "Show/hide" : "顯示／隱藏"} ${name}`;
        add(label, () => {
            state.chart.dispatchAction({ type: "legendToggleSelect", name });
        });
        const button = controls.lastElementChild;
        const updatePressed = () => button.setAttribute("aria-pressed", String(!state.chart.getOption().legend.some(legend => legend.selected?.[name] === false)));
        updatePressed();
        state.chart.on("legendselectchanged", updatePressed);
    }
    const activate = (label, event) => add(label, () => state.activateClick(event));
    if (report.kind === "map") {
        for (const name of report.labels) activate(`${query.english ? "Focus region" : "切換區域聚焦"}: ${chartText(name, query)}`, { seriesType: "map", name });
        for (let index = 0; index < report.years.length; index++) add(String(report.years[index]), () => state.chart.dispatchAction({ type: "timelineChange", currentIndex: index }));
    }
    if (report.kind === "correlation") activate(query.english ? "Toggle regression focus" : "切換迴歸線聚焦", { seriesType: "scatter" });
    if (["class-share", "antibiotic-trend", "consumption"].includes(report.kind)) {
        for (const name of report.labels) activate(`${query.english ? "Focus" : "切換聚焦"}: ${chartText(name, query)}`, {
            seriesType: report.kind === "class-share" ? "bar" : report.kind === "consumption" ? "custom" : "line",
            seriesName: name, data: { row: { name } }
        });
    }
    if (report.kind === "hai-density") {
        for (const name of [...new Set(report.rows.map(row => row.group ?? row.name))]) activate(`${query.english ? "Show/hide" : "顯示／隱藏"}: ${chartText(name, query)}`, { componentType: "xAxis", value: chartText(name, query) });
    }
    if (report.kind === "mdro-facets") {
        for (const year of report.years) {
            activate(`${query.english ? "Focus year" : "切換年度聚焦"}: ${year}`, { componentType: "xAxis", value: String(year) });
            for (const source of report.categories.filter(category => ["CO", "HO"].includes(category))) activate(`${year} ${source}`, { seriesType: "bar", seriesName: source, data: { row: { year } } });
        }
    }
    if (report.kind === "facets") {
        for (const source of ["CO", "HO"]) activate(source, { seriesType: "bar", seriesName: source });
    }
}

let enginePromise;
function loadEngine() {
    enginePromise ??= new Promise((resolve, reject) => {
        if (globalThis.echarts) return resolve(globalThis.echarts);
        const script = document.createElement("script");
        script.src = new URL("../lib/echarts/echarts.min.js", import.meta.url).href;
        script.onload = () => resolve(globalThis.echarts);
        script.onerror = () => { enginePromise = undefined; reject(new Error("Unable to load chart engine")); };
        document.head.append(script);
    });
    return enginePromise;
}

const palette = ["#4472C4", "#ED7D31", "#70AD47", "#FFC000", "#A6A6A6", "#9C0134", "#33C3A0", "#ACC6E6", "#BF9000", "#6F2EA0", "#46566C", "#FF9999"];
const organismColors = {
    "Enterococcus faecium": "#A6A6A6", "Klebsiella pneumoniae": "#4472C4", "Candida albicans": "#ED7D31",
    "Escherichia coli": "#70AD47", "Pseudomonas aeruginosa": "#FFC000", "Yeast-like": "#FF9999",
    "Acinetobacter baumannii": "#9C0134", "Stenotrophomonas maltophilia": "#ACC6E6", "Enterococcus faecalis": "#BF9000",
    "Enterobacter species": "#6F2EA0", "Staphylococcus aureus": "#46566C", "Coagulase negative staphylococci": "#33C3A0", "Other": "#8C9BA5"
};
const antibioticColors = {
    Amikacin: "#A6A6A6", Cefepime: "#4472C4", Ciprofloxacin: "#ED7D31", Gentamicin: "#70AD47",
    "Piperacilin/Tazobactam": "#FFC000", Tigecycline: "#FF9999", "Ampicillin/Sulbactam (SAM)": "#9C0134",
    Ceftazidime: "#ACC6E6", "Gentamicin-high": "#BF9000", Linezolid: "#6F2EA0", Clindamycin: "#46566C",
    Daptomycin: "#33C3A0", Tetracycline: "#277F82", "Trimethoprim/Sulfamethoxazole": "#91674C", Vancomycin: "#58652F", Ampicillin: "#367AA3"
};
const antibiotics = {
    CRE: ["Amikacin", "Cefepime", "Ciprofloxacin", "Gentamicin", "Piperacilin/Tazobactam", "Tigecycline"],
    CRAB: ["Amikacin", "Ampicillin/Sulbactam (SAM)", "Cefepime", "Ceftazidime", "Ciprofloxacin", "Gentamicin", "Tigecycline"],
    CRPA: ["Amikacin", "Cefepime", "Ciprofloxacin", "Piperacilin/Tazobactam"],
    "VR E. faecium": ["Ampicillin", "Gentamicin-high", "Linezolid", "Tigecycline"],
    MRSA: ["Ciprofloxacin", "Clindamycin", "Daptomycin", "Gentamicin", "Linezolid", "Tetracycline", "Tigecycline", "Trimethoprim/Sulfamethoxazole", "Vancomycin"]
};
const specimenOrganisms = ["Escherichia coli", "Klebsiella pneumoniae", "Staphylococcus aureus", "Pseudomonas aeruginosa", "Acinetobacter baumannii", "Enterococcus faecium", "Enterococcus faecalis", "Enterobacter species", "Candida albicans", "Coagulase negative staphylococci", "Other"];
const regionCounties = {
    "臺北區": ["基隆市", "臺北市", "新北市", "宜蘭縣"],
    "北區": ["桃園市", "新竹縣", "新竹市", "苗栗縣"],
    "中區": ["臺中市", "彰化縣", "南投縣"],
    "南區": ["雲林縣", "嘉義縣", "嘉義市", "臺南市"],
    "高屏區": ["高雄市", "屏東縣"], "東區": ["花蓮縣", "臺東縣"]
};

function sample(query, year, index, scale = 100) {
    const filterKey = Object.keys(query.filters).sort().map(key => `${key}:${query.filters[key]}`).join("|");
    let seed = 17;
    for (const character of `${query.family}|${query.topic}|${filterKey}`) seed = (seed * 31 + character.charCodeAt(0)) >>> 0;
    return Math.round((.16 + ((seed + year * 37 + index * 73) % 700) / 1000) * scale * 10) / 10;
}

export function percentages(values) {
    const total = values.reduce((sum, value) => sum + value, 0);
    const exact = values.map(value => value / total * 100);
    const result = exact.map(Math.floor);
    const order = exact.map((value, index) => ({ index, fraction: value - result[index] })).sort((left, right) => right.fraction - left.fraction);
    for (let remaining = 100 - result.reduce((sum, value) => sum + value, 0), index = 0; index < remaining; index++) result[order[index].index]++;
    return result;
}

export function rankOrganisms(records) {
    const groups = new Map();
    for (const record of records) {
        let name = record.subId && record.subId !== "FP99999" ? record.subName : record.name;
        if (["E.cloacae", "Enterobacter cloacae", "Other Enterobacter spp. or NOS"].includes(name)) name = "Enterobacter spp.";
        if (["Proteus mirabilis", "Other Proteus spp. or NOS"].includes(name)) name = "Proteus spp.";
        const excluded = Number(record.flag) === 1 || name === "Candida spp.";
        const key = `${name}|${excluded}`;
        const group = groups.get(key) ?? { name, count: 0, excluded };
        group.count += record.count;
        groups.set(key, group);
    }
    const all = [...groups.values()];
    const total = all.reduce((sum, row) => sum + row.count, 0);
    const ranked = all.filter(row => !row.excluded).sort((left, right) => right.count - left.count || left.name.localeCompare(right.name));
    let rank = 0;
    ranked.forEach((row, index) => {
        if (index === 0 || row.count !== ranked[index - 1].count) rank = index + 1;
        row.rank = rank;
        row.total = total;
        row.value = total ? row.count / total * 100 : 0;
    });
    const cutoff = ranked[Math.min(9, ranked.length - 1)]?.rank ?? 0;
    return ranked.filter(row => row.rank <= cutoff);
}

function organismTrendData(query, years) {
    const trends = [
        ["Enterococcus faecium", [8, 9, 10, 11.7]], ["Klebsiella pneumoniae", [8.6, 10.9, 10.1, 10.8]],
        ["Candida albicans", [8.7, 7.1, 7.6, 6.6]], ["Escherichia coli", [9.5, 8.6, 6.6, 8.4]],
        ["Pseudomonas aeruginosa", [7.6, 6.8, 6, 5.9]], ["Yeast-like", [6.1, 6.6, 4.2, 4.4]],
        ["Acinetobacter baumannii", [7.4, 5.6, 4.3, 3.7]], ["Stenotrophomonas maltophilia", [2.8, 3.4, 4.1, 4.6]],
        ["Enterococcus faecalis", [3.8, 3.5, 3.5, 3.7]], ["Enterobacter spp.", [2.7, 3.2, 3.8, 4.2]],
        ["Staphylococcus aureus", [4.6, 3.5, 2.9, 3.7]], ["Coagulase negative staphylococci", [5.4, 7.6, 9.9, 9.4]],
        ["Proteus spp.", [2.1, 2.3, 2.5, 2.8]]
    ];
    const siteIndex = ["不分部位", "SSI", "PNEU", "BSI", "UTI"].indexOf(query.filters.site);
    const rows = years.flatMap(year => {
        const position = (year - 2015) / 10 * 3;
        const segment = Math.min(2, Math.floor(position));
        const fraction = position - segment;
        const records = trends.flatMap(([name, values], index) => {
            const proportion = values[segment] * (1 - fraction) + values[segment + 1] * fraction;
            const filterFactor = 1 + (query.filters.hospital === "區域醫院" ? ((index % 3) - 1) * .12 : 0) + Math.max(0, siteIndex) * ((index % 4) - 1.5) * .05;
            const count = Math.round(proportion * filterFactor * (65 + (year - 2015) * 2));
            if (name === "Enterobacter spp." || name === "Proteus spp.") {
                const first = Math.round(count * .65);
                return [{ name: name === "Enterobacter spp." ? "E.cloacae" : "Proteus mirabilis", count: first }, { name: name === "Enterobacter spp." ? "Other Enterobacter spp. or NOS" : "Other Proteus spp. or NOS", count: count - first }];
            }
            return [{ name: "Grouped organism", subId: `DEMO${index}`, subName: name, count }];
        });
        records.push({ name: "Candida spp.", count: 350, flag: 0 }, { name: "Other", count: 1100, flag: 1 });
        return rankOrganisms(records).map(row => ({ year, hospital: query.filters.hospital, site: query.filters.site, ...row }));
    });
    const labels = [...new Set(rows.map(row => row.name))].sort((left, right) => {
        const endRank = name => rows.find(row => row.year === query.end && row.name === name)?.rank ?? Infinity;
        return endRank(left) - endRank(right) || left.localeCompare(right);
    });
    return { kind: "organism-trend", years, labels, rows, unit: "%" };
}

export function buildReportData(query) {
    if (query.family === "one-health-animal") return animalReportData(query);
    if (query.family === "one-health-quality") return {
        kind: "one-health-quality", years: query.years, labels: query.series.map(series => series.name),
        rows: query.series.flatMap(series => query.years.map((year, index) => ({ year, name: series.name, value: series.values[index] })))
    };
    if (query.family === "hai") {
        const rows = ["icu-density", "icu-device"].includes(query.chart) ? query.rows.map(row => {
            if (row.count >= 20) return row;
            return { ...row, low: null, q1: null, median: row.count >= 10 ? row.median : null, q3: null, high: null, min: null, max: null };
        }) : query.rows;
        return { kind: ["density", "site-density", "site-device", "device-density", "device-use", "icu-density", "icu-device"].includes(query.chart) ? "hai-density" : "hai-rate", chart: query.chart, rows, year: query.year, device: query.device, utilization: query.utilization };
    }
    const years = Array.from({ length: query.end - query.start + 1 }, (_, index) => query.start + index);
    if (query.family === "ar" && query.topic === 0) return isolateAlluvialData(query, years);
    if (query.family === "ar" && query.topic === 1) return susceptibilityData(query);
    if (query.family === "ar" && query.topic === 2) return clinicalResistanceData(query, years);
    if (query.family === "ar" && query.topic === 3) return mdroFacetData(query, query.years?.length ? [...new Set(query.years)].sort((left, right) => left - right) : years);
    if (query.family === "amr" && query.topic === 1) return organismTrendData(query, years);
    const report = { years, labels: [], rows: [], kind: "line", unit: "%" };
    if (query.family === "amr") {
        if (query.topic === 0) {
            report.kind = "stack";
            report.labels = ["手術部位感染", "肺炎感染", "血流感染", "泌尿道感染", "其他感染"];
            const referenceShares = [
                [5, 9, 44, 34, 7], [5, 8, 44, 36, 8], [5, 9, 42, 33, 11],
                [5, 10, 42, 32, 12], [5, 9, 44, 31, 12], [4, 8, 46, 31, 11],
                [4, 6, 47, 32, 10], [5, 8, 45, 32, 10], [4, 8, 44, 33, 11], [4, 9, 41, 34, 12]
            ];
            for (const year of years) {
                const weights = referenceShares[Math.max(0, Math.min(referenceShares.length - 1, year - 2016))];
                const counts = weights.map((weight, index) => Math.round((weight + (query.filters.hospital === "區域醫院" ? [1, 3, -4, 2, 0][index] : 0)) * (28 + year - 2015)));
                const total = counts.reduce((sum, count) => sum + count, 0);
                const shares = percentages(counts);
                report.labels.forEach((name, index) => report.rows.push({ year, hospital: query.filters.hospital, name, site: ["SSI", "PNEU", "BSI", "UTI", "OTH"][index], count: counts[index], total, value: shares[index] }));
            }
            return report;
        } else if (query.topic === 2) { report.kind = "map"; report.labels = Object.keys(regionCounties); }
        else { report.kind = "antibiotic-trend"; report.labels = antibiotics[query.filters.organism] ?? []; }
    } else if (query.family === "au") {
        if (query.topic === 0) {
            return consumptionData(query, years);
        } else if (query.topic === 1) {
            return classShareData(query, years);
        } else { return correlationData(query, years); }
    } else if (query.topic === 0) {
        report.kind = "alluvial"; report.unit = "n";
        report.labels = specimenOrganisms.filter(name => !(query.hidden ?? []).includes(name));
    } else if (query.topic === 1) {
        report.kind = "heatmap";
        const groups = {
            "Aerobic Gram Positive": ["Staphylococcus aureus", "Enterococcus faecium", "Enterococcus faecalis"],
            "Aerobic Gram Negative – Enterobacterales": ["Escherichia coli", "Klebsiella pneumoniae", "Enterobacter species"],
            "Aerobic Gram Negative – Non Enterobacterales": ["Pseudomonas aeruginosa", "Acinetobacter baumannii"],
            Anaerobes: ["Bacteroides fragilis", "Clostridium spp."]
        };
        report.groups = Object.entries(groups).filter(([group]) => query.filters.group === "全部分群" || query.filters.group === group);
        report.labels = report.groups.flatMap(([, names]) => names);
        report.columns = ["Amikacin", "Cefepime", "Ciprofloxacin", "Gentamicin", "Tigecycline", "Linezolid"];
    } else if (query.topic === 2) {
        report.kind = years.length === 1 ? "horizontal" : "line";
        report.labels = ["Amikacin", "Cefepime", "Ciprofloxacin", "Gentamicin", "Tigecycline", "Linezolid"];
    } else {
        report.kind = "facets";
        report.labels = query.levels ?? ["醫學中心", "區域醫院", "地區醫院", "全國"];
    }
    for (const year of years) {
        const values = report.labels.map((name, index) => sample(query, year, report.kind === "alluvial" && query.family === "ar" ? specimenOrganisms.indexOf(name) : index, report.unit === "n" ? 2200 : report.unit === "DID" ? 28 : 100));
        const normalized = report.kind === "stack" ? percentages(values) : values;
        report.labels.forEach((name, index) => {
            const row = { year, name, value: report.unit === "n" ? Math.round(normalized[index]) : normalized[index] };
            if (report.kind === "antibiotic-trend") {
                row.hospital = query.filters.hospital;
                row.organism = query.filters.organism;
                row.antibiotic = name;
            }
            if (report.kind === "map") {
                row.value = sample(query, year, index, 12);
                row.count = index === 5 && year % 2 === 0 ? 16 : Math.round(sample(query, year, index, 400));
                row.previous = sample(query, year - 1, index, 12);
                row.previousCount = index === 5 && (year - 1) % 2 === 0 ? 16 : Math.round(sample(query, year - 1, index, 400));
                row.hospital = query.filters.hospital;
                row.organism = query.filters.organism;
                row.delta = row.count >= 20 && row.previousCount >= 20 ? Number((row.value - row.previous).toFixed(1)) : null;
            }
            if (report.kind === "facets") { row.count = Math.round(sample(query, year, index, 2800)); row.share = query.filters.source === "全部（CO+HO）" ? .4 + index * .06 : row.value / 100; }
            if (report.kind === "scatter") row.resistance = Math.round(12 + row.value * 1.4 + Math.sin(year) * 7);
            report.rows.push(row);
        });
    }
    if (report.kind === "alluvial") {
        for (const year of years) {
            const rows = report.rows.filter(row => row.year === year).sort((left, right) => right.value - left.value);
            const ranked = query.family === "ar" ? specimenOrganisms.map((name, index) => ({ name, value: Math.round(sample(query, year, index, 2200)) })).sort((left, right) => right.value - left.value) : rows;
            const total = ranked.reduce((sum, row) => sum + row.value, 0);
            rows.forEach(row => { row.rank = ranked.findIndex(candidate => candidate.name === row.name) + 1; row.percent = Math.round(row.value / total * 1000) / 10; });
        }
    }
    if (report.kind === "heatmap") {
        report.rows = report.labels.flatMap((name, rowIndex) => report.columns.map((antibiotic, columnIndex) => {
            const tested = Math.round(sample(query, query.start, rowIndex * 6 + columnIndex, 900));
            const value = (rowIndex + columnIndex) % 11 === 0 ? null : Math.round(sample(query, query.start, rowIndex * 6 + columnIndex));
            return { year: query.start, name, antibiotic, value, tested: value === null ? null : tested, susceptible: value === null ? null : Math.round(tested * value / 100) };
        }));
    }
    return report;
}

function color(name, index) { return organismColors[name] ?? antibioticColors[name] ?? palette[index % palette.length]; }
function baseOption() {
    return { animationDuration: 350, backgroundColor: "#fff", textStyle: { fontFamily: "Noto Sans TC, sans-serif", color: "#334653" }, tooltip: { trigger: "axis", confine: true }, legend: { type: "scroll", bottom: 0 }, grid: { left: 55, right: 25, top: 35, bottom: 100, containLabel: true } };
}
function lineOptions(report) {
    return { ...baseOption(), xAxis: { type: "category", data: report.years, axisLabel: { interval: 0 } }, yAxis: { type: "value", name: report.unit, min: 0, max: report.kind === "stack" ? 100 : undefined, interval: report.kind === "stack" ? 10 : undefined }, series: report.labels.map((name, index) => ({ name, type: report.kind === "stack" ? "bar" : "line", stack: report.kind === "stack" ? "total" : undefined, emphasis: { focus: "series" }, itemStyle: { color: color(name, index) }, label: report.kind === "stack" ? { show: true, formatter: "{c}%", position: "inside", fontSize: 11 } : { show: false }, data: report.years.map(year => report.rows.find(row => row.year === year && row.name === name)?.value ?? null) })) };
}

export function buildOptions(query, report = buildReportData(query)) {
    const options = buildCanonicalOptions(query, report);
    return query.english ? localizeOptions(options, query) : options;
}

export function chartText(text, query) {
    if (!query.english || typeof text !== "string") return text;
    let result = text;
    const translations = Object.entries(query.translations ?? {}).sort(([left], [right]) => right.length - left.length);
    for (const [chinese, english] of translations) result = result.replaceAll(chinese, english);
    return result.replace(/(\d+)：第 (\d+) 名/g, "$1: Rank $2").replace(/(\d+) 年/g, "$1").replace(/排名：/g, "Rank: ").replace(/占比：/g, "Share: ").replaceAll("：", ": ");
}

function localizeOptions(value, query, preserveIdentity = false) {
    if (typeof value === "string") return chartText(value, query);
    if (Array.isArray(value)) return value.map(item => localizeOptions(item, query, preserveIdentity));
    if (!value || typeof value !== "object") return value;
    const result = {};
    for (const [key, item] of Object.entries(value)) {
        if (key === "row" || preserveIdentity && ["name", "source", "target"].includes(key)) result[key] = item;
        else if (key === "formatter" && typeof item === "function") result[key] = (...args) => chartText(item(...args), query);
        else result[key] = localizeOptions(item, query, key === "data" || key === "links"
            ? value.type === "map" || value.type === "sankey" || Array.isArray(item) && item.some(entry => entry?.row && entry?.name) && !value.type
            : preserveIdentity);
    }
    if (value.type === "map") {
        result.label = { ...result.label, formatter: params => chartText(params.name, query) };
        result.emphasis = { ...result.emphasis, label: { ...result.emphasis?.label, formatter: params => chartText(params.name, query) } };
    }
    return result;
}

function buildCanonicalOptions(query, report) {
    if (report.kind === "mdro-facets") return mdroFacetOptions(query, report, query.focusYear);
    if (report.kind === "clinical-resistance") return clinicalResistanceOptions(query, report);
    if (report.kind === "isolate-alluvial") return alluvialOptions(report);
    if (report.kind === "correlation") return correlationOptions(query, report);
    if (report.kind === "class-share") return classShareOptions(query, report);
    if (report.kind === "consumption") return consumptionOptions(query, report);
    if (report.kind === "antibiotic-trend") return antibioticTrendOptions(query, report);
    if (report.kind === "organism-trend") return organismTrendOptions(query, report);
    if (query.family === "amr" && query.topic === 0) return infectionSiteOptions(query, report);
    if (report.kind === "one-health-animal") return animalOptions(report);
    if (report.kind === "one-health-quality") return qualityOptions(query, report);
    if (report.kind === "hai-rate") return buildHaiRateOptions(report);
    if (report.kind === "hai-density") return buildHaiDensityOptions(report);
    if (report.kind === "alluvial" && report.years.length === 1) return horizontalOptions(report);
    if (report.kind === "alluvial") {
        const options = alluvialOptions(report);
        options.series[0].right = "24%";
        options.series[0].data.forEach(node => { node.label = { show: node.row.year === report.years.at(-1) }; });
        options.tooltip.formatter = params => {
            const name = params.data.row.name;
            return `${name}<br>` + report.rows.filter(row => row.name === name).map(row => `${row.year}：第 ${row.rank} 名 · ${row.value.toFixed(report.unit === "n" ? 0 : 1)} ${report.unit} · ${row.percent}%`).join("<br>");
        };
        options.graphic = report.years.map((year, index) => ({ type: "text", left: `${5 + index / Math.max(1, report.years.length - 1) * 68}%`, top: 8, style: { text: String(year), fill: "#52636f", fontSize: 12 } }));
        return options;
    }
    if (report.kind === "heatmap") return heatmapOptions(report);
    if (report.kind === "scatter") return scatterOptions(report);
    if (report.kind === "map") return mapOptions(query, report);
    if (report.kind === "facets") return facetOptions(query, report);
    if (report.kind === "horizontal") return horizontalOptions(report);
    const options = lineOptions(report);
    if (query.family === "amr" && query.topic === 3 || query.family === "ar" && query.topic === 2) Object.assign(options.yAxis, { max: 100, interval: 10 });
    return options;
}

const classShareGroups = {
    AWaRe: ["Access", "Watch", "Reserve", "Other", "Not recommended"],
    Penicillins: ["J01CA", "J01CE", "J01CF", "J01CR"],
    Cephalosporins: ["J01DB", "J01DC", "J01DD", "J01DE", "J01DI"]
};
const classShareColors = { Access: "#7daf50", Watch: "#ed7d31", Reserve: "#df2227", Other: "#b6b6b6", "Not recommended": "#6aa6cc", J01CA: "#4472c4", J01CE: "#ed7d31", J01CF: "#70ad47", J01CR: "#a16da4", J01DB: "#4472c4", J01DC: "#70ad47", J01DD: "#ed7d31", J01DE: "#a16da4", J01DI: "#33a3a0" };

function classShareData(query, years) {
    const group = query.filters.classgroup;
    const labels = classShareGroups[group] ?? classShareGroups.AWaRe;
    const report = { kind: "class-share", unit: "%", years, labels, rows: [] };
    for (const year of years) {
        const bases = group === "Penicillins" ? [44, 8, 5, 43] : group === "Cephalosporins" ? [20, 24, 48, 6, 2] : [74, 24.9, .05, 1, .05];
        const amounts = labels.map((name, index) => bases[index] * (.85 + sample(query, year, index, .3)));
        const total = amounts.reduce((sum, value) => sum + value, 0);
        labels.forEach((name, index) => report.rows.push({ year, name, classgroup: group, visit: query.filters.visit, amount: amounts[index], total, value: amounts[index] / total * 100 }));
    }
    return report;
}

function classShareValue(value) {
    return value === 0 ? "0" : value < 1 ? value.toFixed(2) : value.toFixed(1).replace(/\.0$/, "");
}

export function classShareOptions(query, report, selected = {}) {
    const visible = report.labels.filter(name => selected[name] !== false);
    const focused = visible.length < report.labels.length;
    const totals = report.years.map(year => report.rows.filter(row => row.year === year && selected[row.name] !== false).reduce((sum, row) => sum + row.value, 0));
    const maximum = Math.max(0, ...totals);
    const axisMaximum = !focused ? 100 : maximum === 0 ? 1 : maximum < 1 ? Math.ceil(maximum * 120) / 100 : Math.min(100, Math.ceil(maximum * 1.15 / 10) * 10);
    const endingRows = report.labels.map(name => report.rows.find(row => row.year === report.years.at(-1) && row.name === name));
    const tableText = endingRows.map(row => `${row.name}: ${classShareValue(row.value)}%`).join("   ·   ");
    const options = {
        ...baseOption(),
        animation: false,
        title: { text: `${query.filters.classgroup} · ${query.filters.visit} (${query.start}-${query.end})`, left: "center", textStyle: { fontSize: 13 } },
        grid: { left: 70, right: 20, top: 55, bottom: 175 },
        legend: { type: "plain", data: report.labels, selected, left: "center", right: null, top: null, bottom: 80, textStyle: { fontSize: 11 } },
        xAxis: { type: "category", data: report.years, name: "年度", nameLocation: "middle", nameGap: 30, axisLabel: { interval: 0, fontSize: 10 } },
        yAxis: { type: "value", name: "抗生素類別占比（%）", nameLocation: "middle", nameGap: 48, min: 0, max: axisMaximum, interval: !focused ? 10 : undefined, axisLabel: { formatter: value => `${maximum < 1 && focused ? classShareValue(value) : Math.round(value)}%` } },
        tooltip: { trigger: "item", confine: true, formatter: params => `${params.data.row.year} · ${query.filters.classgroup} · ${query.filters.visit}<br>` + report.rows.filter(row => row.year === params.data.row.year).map(row => `${row.name}: ${classShareValue(row.value)}%`).join("<br>") },
        graphic: { elements: [{ id: "class-share-summary", type: "text", left: "center", top: null, bottom: 16, style: { text: `${report.years.at(-1)} · ${query.english ? "Details" : "詳細數據"}\n${tableText}`, fontSize: 11, lineHeight: 20, fill: "#334653", align: "center" } }] },
        series: report.labels.map(name => ({ name, type: "bar", stack: "class-share", barMaxWidth: 55, itemStyle: { color: classShareColors[name] }, data: report.years.map(year => { const row = report.rows.find(row => row.year === year && row.name === name); return { value: row.value, row }; }) }))
    };
    return { baseOption: options, media: [{ query: { maxWidth: 650 }, option: {
        title: { ...options.title, text: `${query.filters.classgroup} · ${query.filters.visit}\n${query.start}-${query.end}`, textStyle: { fontSize: 12 } },
        grid: { left: 60, right: 12, top: 60, bottom: 230 },
        legend: { ...options.legend, type: "scroll", left: 15, right: 15, bottom: 120, textStyle: { fontSize: 10 } },
        xAxis: { ...options.xAxis, axisLabel: { interval: 0, rotate: 45, fontSize: 9 }, nameGap: 40 },
        yAxis: { ...options.yAxis, nameGap: 42, nameTextStyle: { fontSize: 10 } },
        graphic: { elements: [{ id: "class-share-summary", type: "text", left: "center", top: null, bottom: 12, style: { text: `${report.years.at(-1)} · ${query.english ? "Details" : "詳細數據"}\n${endingRows.map(row => `${row.name}: ${classShareValue(row.value)}%`).join("\n")}`, fontSize: 10, lineHeight: 14, fill: "#334653", align: "center" } }] }
    } }, { option: { title: options.title, grid: options.grid, legend: options.legend, xAxis: options.xAxis, yAxis: options.yAxis, graphic: options.graphic } }] };
}

const consumptionGroups = {
    J01: ["Amoxicillin", "Azithromycin", "Amoxicillin and Clavulanate", "Tetracycline", "Ampicillin", "Doxycycline", "Ciprofloxacin", "Cefuroxime", "Clarithromycin", "Levofloxacin"],
    A07AA: ["Neomycin", "Nystatin", "Natamycin", "Paromomycin", "Vancomycin", "Rifaximin"],
    P01AB: ["Metronidazole", "Tinidazole", "Ornidazole"],
    J02: ["Amphotericin B", "Ketoconazole", "Fluconazole", "Itraconazole", "Voriconazole", "Posaconazole", "Caspofungin", "Micafungin"],
    D01B: ["Griseofulvin", "Terbinafine"]
};
const consumptionColors = Object.fromEntries([...new Set(Object.values(consumptionGroups).flat())].map((name, index) => [name, antibioticColors[name] ?? palette[index % palette.length]]));
consumptionColors.Other = "#7899a8";

function consumptionData(query, years) {
    const names = consumptionGroups[query.filters.atc] ?? consumptionGroups.J01;
    const unit = query.metric === "DDD" ? "DDD" : "DID";
    const report = { kind: "consumption", unit, years, labels: [...names, "Other"], rows: [] };
    for (const year of years) {
        const annual = report.labels.map((name, index) => {
            const base = name === "Other" ? 8 : index === 0 ? 5 : 1.1 + (names.length - index) * .15;
            const wave = .7 + .3 * Math.sin((year - 2015) * .8 + index * 1.7);
            const filterFactor = sample(query, 2015, index, 1) + .6;
            const value = Number((base * wave * filterFactor * (unit === "DDD" ? 100000 : 1)).toFixed(1));
            return { year, name, antibiotic: name, atc: query.filters.atc, route: query.filters.route, visit: query.filters.visit, region: query.filters.region, level: query.filters.level, unit, value };
        });
        const ranked = annual.filter(row => row.name !== "Other").sort((left, right) => right.value - left.value || left.name.localeCompare(right.name));
        annual.forEach(row => { row.rank = row.name === "Other" ? null : ranked.findIndex(candidate => candidate.name === row.name) + 1; });
        report.rows.push(...annual);
    }
    return report;
}

export function consumptionLayout(report, selected = {}) {
    let maximum = 0;
    const segments = report.years.flatMap((year, yearIndex) => {
        const rows = report.rows.filter(row => row.year === year && selected[row.name] !== false).sort((left, right) => left.name === "Other" ? -1 : right.name === "Other" ? 1 : left.value - right.value || left.name.localeCompare(right.name));
        let total = 0;
        const annual = rows.map(row => { const low = total; total += row.value; return { row, yearIndex, low, high: total }; });
        maximum = Math.max(maximum, total);
        return annual;
    });
    return { segments, maximum };
}

function consumptionOptions(query, report, selected = {}) {
    const layout = consumptionLayout(report, selected);
    const annotations = [
        ...report.years.map((year, yearIndex) => ({ yearIndex, total: layout.segments.filter(segment => segment.row.year === year).reduce((sum, segment) => sum + segment.row.value, 0) })),
        ...layout.segments.filter(segment => segment.yearIndex === 0)
    ];
    const options = {
        ...baseOption(),
        animation: false,
        title: { text: `${query.filters.atc} · ${report.unit}\n${query.start}-${query.end}`, left: "center", textStyle: { fontSize: 13 } },
        grid: { left: report.unit === "DDD" ? 115 : 75, right: 25, top: 80, bottom: 135 },
        legend: { type: "plain", data: report.labels, selected, left: 15, right: 15, top: "82%", bottom: null, textStyle: { fontSize: 10 }, tooltip: { show: true } },
        xAxis: { type: "category", data: report.years, boundaryGap: true, axisTick: { show: false }, axisLabel: { interval: 0, fontSize: 10 } },
        yAxis: { type: "value", name: report.unit, nameLocation: "middle", nameGap: 50, min: 0, max: layout.maximum ? Number((layout.maximum * 1.1).toFixed(1)) : 1, axisLabel: { formatter: value => Number(value).toFixed(1) } },
        tooltip: { trigger: "item", confine: true, formatter: params => {
            const row = params.data.row;
            return `${row.year} · ${row.atc}<br>${chartText(row.name, query)}<br>${chartText(row.route, query)} · ${chartText(row.visit, query)}<br>${chartText(row.region, query)} · ${chartText(row.level, query)}<br>${row.unit}：${row.value.toFixed(1)}`;
        } },
        series: report.labels.map(name => ({
            id: `consumption-${name}`, name: `consumption-shape-${name}`, type: "custom", clip: true,
            itemStyle: { color: consumptionColors[name] },
            data: layout.segments.filter(segment => segment.row.name === name).map(segment => {
                const next = layout.segments.find(candidate => candidate.yearIndex === segment.yearIndex + 1 && candidate.row.name === name);
                return { value: [segment.yearIndex, segment.low, segment.high, next?.low ?? null, next?.high ?? null], row: segment.row };
            }),
            renderItem: (params, api) => {
                const index = api.value(0);
                const low = api.coord([index, api.value(1)]);
                const high = api.coord([index, api.value(2)]);
                const halfWidth = Math.min(9, api.size([1, 0])[0] * .12);
                const children = [];
                if (index < report.years.length - 1 && api.value(3) != null) {
                    const nextLow = api.coord([index + 1, api.value(3)]);
                    const nextHigh = api.coord([index + 1, api.value(4)]);
                    const upper = [], lower = [];
                    for (let step = 0; step <= 16; step++) {
                        const ratio = step / 16;
                        const smooth = ratio * ratio * (3 - 2 * ratio);
                        const position = high[0] + halfWidth + (nextHigh[0] - high[0] - 2 * halfWidth) * ratio;
                        upper.push([position, high[1] + (nextHigh[1] - high[1]) * smooth]);
                        lower.push([position, low[1] + (nextLow[1] - low[1]) * smooth]);
                    }
                    children.push({ type: "polygon", shape: { points: [...upper, ...lower.reverse()] }, style: { fill: consumptionColors[name], opacity: .25 } });
                }
                children.push({ type: "rect", shape: { x: high[0] - halfWidth, y: high[1], width: halfWidth * 2, height: Math.max(1, low[1] - high[1]) }, style: { fill: consumptionColors[name], stroke: "#fff", lineWidth: .5 } });
                return { type: "group", children };
            }
        })).concat(report.labels.map(name => ({ id: `consumption-legend-${name}`, name, type: "line", data: [], itemStyle: { color: consumptionColors[name] }, tooltip: { show: false } })), [{
            id: "consumption-annotations", type: "custom", silent: true, clip: false, z: 10, tooltip: { show: false },
            data: annotations.map(annotation => [annotation.yearIndex, annotation.low ?? 0, annotation.high ?? 0]),
            renderItem: (params, api) => {
                const annotation = annotations[params.dataIndex];
                const low = api.coord([api.value(0), api.value(1)]);
                if (annotation.total !== undefined) {
                    const text = `${annotation.total.toFixed(1)} ${report.unit}`;
                    const textWidth = text.length * 6;
                    const columnWidth = api.size([1, 0])[0];
                    const totalRows = Math.max(1, Math.ceil((textWidth + 8) / columnWidth));
                    const totalX = Math.min(low[0], params.coordSys.x + params.coordSys.width - textWidth / 2);
                    return { type: "text", style: { x: totalX, y: params.coordSys.y - 12 - annotation.yearIndex % totalRows * 16, text, fontSize: 10, fontWeight: 600, fill: "#111", align: "center", verticalAlign: "middle" } };
                }
                const high = api.coord([api.value(0), api.value(2)]);
                if (low[1] - high[1] <= 15) return null;
                const halfWidth = Math.min(9, api.size([1, 0])[0] * .12);
                const label = annotation.row.name === "Other" ? query.english ? "Other non-top-10 antimicrobials" : "其他非前十名抗生素" : annotation.row.name;
                return { type: "text", style: { x: high[0] + halfWidth + 8, y: (low[1] + high[1]) / 2, text: label, fontSize: 11, fill: "#111", align: "left", verticalAlign: "middle" } };
            }
        }])
    };
    return { baseOption: options, media: [{ query: { maxWidth: 650 }, option: {
        grid: { left: report.unit === "DDD" ? 110 : 65, right: 10, top: 150, bottom: 110 },
        legend: { ...options.legend, type: "scroll", left: 8, right: 8, top: "85%", bottom: null, textStyle: { fontSize: 10, width: 150, overflow: "truncate" } },
        xAxis: { ...options.xAxis, axisLabel: { rotate: 45, fontSize: 9 } }, yAxis: { ...options.yAxis, nameGap: 35 }
    } }, { option: { grid: options.grid, legend: options.legend, xAxis: { axisLabel: { rotate: 0 } } } }] };
}

export function antibioticAxis(report, selected = {}) {
    const values = report.rows.filter(row => selected[row.name] !== false).map(row => row.value).filter(Number.isFinite);
    const allVisible = report.labels.every(name => selected[name] !== false);
    return {
        min: allVisible || !values.length ? 0 : Math.max(0, Math.floor(Math.min(...values) / 10) * 10 - 10),
        max: allVisible ? 100 : !values.length ? 10 : Math.min(100, Math.ceil(Math.max(...values) / 10) * 10 + 10),
        interval: 10
    };
}

function antibioticTrendOptions(query, report) {
    const options = lineOptions(report);
    options.title = { text: `${query.filters.organism} · ${query.filters.hospital}\n${query.start}-${query.end}`, left: "center", textStyle: { fontSize: 13 } };
    options.grid = { left: 70, right: 25, top: 65, bottom: 130 };
    options.legend = { type: "plain", left: "center", right: null, top: null, bottom: 12, textStyle: { fontSize: 11 }, tooltip: { show: true } };
    options.xAxis = { type: "category", data: report.years, name: "年度", nameLocation: "middle", nameGap: 32, axisLabel: { interval: 0, fontSize: 10 } };
    options.yAxis = { type: "value", name: "抗藥性（%）", nameLocation: "middle", nameGap: 45, ...antibioticAxis(report), axisLabel: { formatter: value => `${Math.round(value)}%` } };
    options.tooltip = { trigger: "item", confine: true, formatter: params => {
        const row = params.data.row;
        return `${row.year} · ${row.hospital}<br>${row.organism} · ${row.antibiotic}<br>抗藥性：${row.value.toFixed(1)}%`;
    } };
    options.series = report.labels.map(name => ({ name, type: "line", symbol: "circle", symbolSize: 7, connectNulls: false, itemStyle: { color: antibioticColors[name] }, emphasis: { focus: "series" }, data: report.years.map(year => { const row = report.rows.find(row => row.year === year && row.name === name); return { value: row?.value ?? null, row }; }) }));
    return { baseOption: options, media: [{ query: { maxWidth: 650 }, option: {
        grid: { left: 60, right: 12, top: 65, bottom: 125 },
        legend: { type: "scroll", left: 8, right: 8, top: null, bottom: 12, textStyle: { fontSize: 10, width: 150, overflow: "truncate" } },
        xAxis: { axisLabel: { rotate: 45, fontSize: 9 }, nameGap: 42 },
        yAxis: { nameGap: 43, nameTextStyle: { fontSize: 10 } }
    } }, { option: { grid: options.grid, legend: options.legend, xAxis: { axisLabel: { rotate: 0 } } } }] };
}

export function buildHaiRateOptions(report) {
    const rows = report.rows;
    const legendColors = ["#dcdfff", "#e8dcff", "#ffdede"];
    const maximum = Math.max(3, Math.ceil(Math.max(...rows.map(row => row.high)) * 2) / 2);
    const series = [{
        id: "hai-boxes", name: "感染率", type: "boxplot", boxWidth: [60, 100],
        itemStyle: { color: "#eeeeee", borderColor: "#999999", borderWidth: 1 },
        emphasis: { itemStyle: { color: "#e4e4e4", borderColor: "#666666" } },
        data: rows.map(row => ({ name: row.name, value: [row.low, row.q1, row.median, row.q3, row.high] }))
    }, ...rows.map(row => ({ name: row.name, type: "scatter", data: [], tooltip: { show: false } }))];
    series.push({
        id: "hai-means", name: "平均值", type: "custom", silent: true, tooltip: { show: false },
        data: rows.map((row, index) => [index, row.average]),
        renderItem: (params, api) => {
            const point = api.coord([api.value(0), api.value(1)]);
            const width = Math.min(100, Math.max(60, api.size([1, 0])[0] * .5));
            return { type: "line", shape: { x1: point[0] - width / 2, y1: point[1], x2: point[0] + width / 2, y2: point[1] }, style: { stroke: "#ff0000", lineWidth: 1.5, lineDash: [6, 5] } };
        }, z: 5
    });
    series.push({ ...haiRateAnnotations(report), data: [] });
    return {
        ...baseOption(),
        title: { text: "全院醫療照護相關感染率", left: "center", top: 4, textStyle: { fontSize: 14, fontWeight: "normal", color: "#637f9e" } },
        grid: { left: 130, right: 140, top: 60, bottom: 65, show: true, borderColor: "#999999", borderWidth: 1 },
        legend: { bottom: 10, itemWidth: 5, itemHeight: 5, textStyle: { fontSize: 11 }, data: rows.map((row, index) => ({ name: row.name, icon: "circle", itemStyle: { color: legendColors[index] } })) },
        xAxis: { type: "category", data: rows.map(row => row.name), boundaryGap: true, axisLabel: { show: false }, axisTick: { show: false }, axisLine: { lineStyle: { color: "#777777" } } },
        yAxis: { type: "value", min: 0, max: maximum, interval: .5, name: "Rate per 1,000 patient days (%)", nameLocation: "middle", nameGap: 55, nameTextStyle: { color: "#637f9e", fontSize: 11 }, axisLabel: { fontSize: 11, formatter: value => value === 0 ? "" : String(value) }, splitLine: { lineStyle: { color: "#f0f0f0" } } },
        tooltip: { show: false }, series
    };
}

function organismAxis(report, selected = {}) {
    const values = report.rows.filter(row => selected[row.name] !== false).map(row => row.value);
    return { min: values.length ? Math.max(0, Math.floor(Math.min(...values)) - 1) : 0, max: values.length ? Math.ceil(Math.max(...values)) + 1 : 1 };
}

function organismTrendOptions(query, report) {
    const options = lineOptions(report);
    options.title = { text: `醫院感染菌種比例趨勢 - ${query.filters.hospital} · ${query.filters.site} (${query.start}-${query.end})`, left: "center", top: 4, textStyle: { fontSize: 14, fontWeight: "normal" } };
    options.grid = { left: 65, right: 25, top: 60, bottom: 120, containLabel: true };
    options.legend = { type: "plain", top: "84%", bottom: null, left: 35, right: 15, tooltip: { show: true }, textStyle: { fontSize: 11 } };
    options.xAxis = { ...options.xAxis, name: "年度", nameLocation: "middle", nameGap: 28 };
    options.yAxis = { ...options.yAxis, ...organismAxis(report), name: "菌種比例（%）", nameLocation: "middle", nameGap: 45, axisLabel: { formatter: value => `${Number(value).toFixed(1)}%` } };
    options.series.forEach(series => {
        series.symbol = "circle";
        series.symbolSize = 7;
        series.connectNulls = false;
        if (series.name === "Enterobacter spp.") series.itemStyle.color = organismColors["Enterobacter species"];
    });
    options.tooltip = { trigger: "item", confine: true, formatter: params => {
        const row = report.rows.find(candidate => candidate.year === report.years[params.dataIndex] && candidate.name === report.labels[params.seriesIndex]);
        return row ? `${row.name}<br>${row.year} · ${row.hospital} · ${row.site}<br>菌株數：${row.count}<br>總菌株數：${row.total}<br>占比：${row.value.toFixed(1)}%<br>排名：${row.rank}` : "";
    } };
    options.media = [
        { query: { maxWidth: 650 }, option: { title: { text: `醫院感染菌種比例趨勢\n${query.filters.hospital} · ${query.filters.site} (${query.start}-${query.end})`, textStyle: { fontSize: 10 } }, grid: { left: 55, right: 10, top: 65, bottom: 115 }, xAxis: { axisLabel: { rotate: 45, fontSize: 9 } }, yAxis: { nameGap: 50, nameTextStyle: { fontSize: 10 } }, legend: { type: "scroll", top: "84%", bottom: null, left: 10, right: 10, textStyle: { fontSize: 10, width: 145, overflow: "truncate" } } } },
        { option: { title: { textStyle: { fontSize: 14 } }, grid: { left: 65, right: 25, top: 60, bottom: 120 }, xAxis: { axisLabel: { rotate: 0, fontSize: 11 } }, yAxis: { nameGap: 45, nameTextStyle: { fontSize: 12 } }, legend: { type: "plain", left: 35, right: 15, textStyle: { fontSize: 11 } } } }
    ];
    return options;
}

function infectionSiteOptions(query, report) {
    const codes = ["SSI", "PNEU", "BSI", "UTI", "OTH"];
    const colors = ["#000080", "#a0a0a0", "#ff80ab", "#fff59d", "#90caf9"];
    return {
        ...baseOption(),
        title: { text: `醫療照護相關感染部位分布 - ${query.filters.hospital} (${query.start}-${query.end})`, left: 55, top: 8, textStyle: { fontSize: 14, fontWeight: "normal" } },
        grid: { left: 55, right: 25, top: 85, bottom: 55, containLabel: true },
        legend: { type: "scroll", top: 40, right: 25, bottom: null, data: [...report.labels].reverse(), formatter: name => codes[report.labels.findIndex(label => label === name || chartText(label, query) === name)], itemWidth: 10, itemHeight: 10 },
        xAxis: { type: "category", data: report.years, name: "年度", nameLocation: "middle", nameGap: 28, axisLabel: { interval: 0, fontSize: 11 }, axisTick: { show: false } },
        yAxis: { type: "value", min: 0, max: 100, interval: 10, name: "百分比", nameLocation: "middle", nameGap: 42, axisLabel: { formatter: "{value}%" }, splitLine: { lineStyle: { color: "#eeeeee" } } },
        tooltip: { trigger: "item", confine: true, formatter: params => {
            const row = report.rows.find(candidate => candidate.year === report.years[params.dataIndex] && candidate.name === report.labels[params.seriesIndex]);
            return `${row.year} · ${row.hospital}<br>${row.site} · ${row.name}<br>占比：${row.value}%<br>感染個案數：${row.count}<br>總感染個案數：${row.total}`;
        } },
        series: report.labels.map((name, index) => ({ name, type: "bar", stack: "total", barCategoryGap: "18%", emphasis: { focus: "series" }, itemStyle: { color: colors[index] },
            label: { show: true, position: "inside", formatter: "{c}%", color: index === 0 ? "#ffffff" : "#17232d", fontSize: 11 },
            data: report.years.map(year => report.rows.find(row => row.year === year && row.name === name).value)
        })),
        media: [
            { query: { maxWidth: 650 }, option: { title: { left: 45, textStyle: { fontSize: 10 } }, grid: { left: 35, right: 10, top: 85, bottom: 70 }, xAxis: { axisLabel: { rotate: 45, fontSize: 9 } }, yAxis: { nameGap: 28, nameTextStyle: { fontSize: 10 } }, series: report.labels.map(() => ({ label: { fontSize: 8 } })) } },
            { option: { title: { left: 55, textStyle: { fontSize: 14 } }, grid: { left: 55, right: 25, top: 85, bottom: 55 }, xAxis: { axisLabel: { rotate: 0, fontSize: 11 } }, yAxis: { nameGap: 42, nameTextStyle: { fontSize: 12 } }, series: report.labels.map(() => ({ label: { fontSize: 11 } })) } }
        ]
    };
}

export function buildHaiDensityOptions(report, selected = {}) {
    const rows = report.rows;
    const siteDensity = ["site-density", "site-device", "device-density", "device-use", "icu-density", "icu-device"].includes(report.chart);
    const icuDevice = report.chart === "icu-device";
    const icuDensity = report.chart === "icu-density" || icuDevice;
    const deviceDensity = report.chart === "device-density";
    const deviceUse = report.chart === "device-use";
    const proportion = report.chart === "site-device" || deviceUse || (icuDevice && report.utilization);
    const unit = proportion ? "%" : "‰";
    const categoryRows = siteDensity ? rows : [...rows.slice(0, 3), null, ...rows.slice(3)];
    const categories = categoryRows.map(row => row?.name ?? "");
    const groups = siteDensity ? [...new Set(rows.map(row => row.group))] : [];
    const hospitalAxis = { type: "category", data: categories, triggerEvent: true, axisLabel: { interval: 0, fontSize: 11, formatter: name => name.replace("(ICU)", "").split(" / ")[0] }, axisTick: { show: false } };
    const maximum = proportion
        ? Math.min(100, Math.max(10, Math.ceil(Math.max(...rows.map(row => Math.max(row.high ?? 0, row.median ?? 0, row.average))) / 10) * 10))
        : Math.max(2, Math.ceil(Math.max(...rows.map(row => Math.max(row.high ?? 0, row.median ?? 0, row.average))) / 2) * 2);
    return {
        ...baseOption(),
        title: { text: icuDevice ? report.utilization ? "加護病房種類別導管使用比率" : "加護病房種類別導管感染密度" : icuDensity ? "加護病房種類別感染密度" : deviceUse ? "加護病房侵入性導管使用比率" : deviceDensity ? "加護病房侵入性導管相關感染密度" : proportion ? "加護病房感染部位與導管使用" : siteDensity ? "加護病房感染部位別醫療照護相關感染密度" : "全院及加護病房醫療照護相關感染密度", ...(icuDevice ? { subtext: report.device, subtextStyle: { fontSize: 11 } } : {}), left: "center", top: 4, textStyle: { fontSize: 14, fontWeight: "normal" } },
        grid: { left: 75, right: 30, top: 55, bottom: 80, show: true, borderColor: "#999999", borderWidth: 1 },
        legend: { show: false },
        xAxis: siteDensity ? [hospitalAxis, { type: "category", data: groups, position: "bottom", offset: 26, triggerEvent: true, axisLine: { show: false }, axisTick: { show: false }, axisLabel: { interval: 0, formatter: name => name.replace("感染", "") }, splitLine: { show: true, lineStyle: { color: "#dce2e7" } } }] : hospitalAxis,
        yAxis: { type: "value", min: 0, max: maximum, interval: proportion ? 10 : maximum <= 8 ? 1 : maximum <= 12 ? 2 : undefined, name: deviceUse || (icuDevice && report.utilization) ? "導管使用比率（%）" : deviceDensity ? "導管相關感染密度（‰）" : proportion ? "導管相關感染佔率（%）" : "醫療照護相關感染密度（‰）", nameLocation: "middle", nameGap: 48, splitLine: { lineStyle: { color: "#eeeeee" } } },
        graphic: siteDensity ? [] : [
            { type: "text", left: "28%", bottom: 16, style: { text: "全院", fill: "#334653", fontSize: 12 } },
            { type: "text", left: "73%", bottom: 16, style: { text: "ICU", fill: "#334653", fontSize: 12 } }
        ],
        tooltip: { trigger: "item", confine: true, formatter: params => {
            const row = categoryRows[params.dataIndex];
            if (!row) return "";
            return `${report.year} · ${row.name}${icuDevice ? ` · ${report.device} · ${report.utilization ? "使用比率" : "感染密度"}` : ""}<br>` + [["upper fence (P90)", row.high], ["q3", row.q3], ["mean", row.average], ["median", row.median], ["q1", row.q1], ["lower fence (P10)", row.low]].filter(([, value]) => value != null).map(([name, value]) => `${name}: ${Number(value).toFixed(2)} ${unit}`).join("<br>")
                + (icuDensity ? `<br>病房數: ${row.count}` + (row.count < 10 ? "<br>病房數小於 10，不提供百分位" : row.count < 20 ? "<br>病房數 10–19，僅提供中位數" : "") : "");
        } },
        series: [
            { id: "hai-density-boxes", type: "boxplot", boxWidth: [24, 72], itemStyle: { color: "#dddddd", borderColor: "#777777" }, data: categoryRows.map(row => !row || selected[row.name] === false || row.median == null ? "-" : { name: row.name, value: row.high == null ? Array(5).fill(row.median) : [row.low, row.q1, row.median, row.q3, row.high], ...(row.high == null ? { itemStyle: { borderColor: "#000000" } } : {}) }) },
            { id: "hai-density-means", type: "custom", silent: !icuDensity, tooltip: { show: icuDensity }, z: 5, data: categoryRows.map((row, index) => !row || selected[row.name] === false ? "-" : [index, row.average]), renderItem: (params, api) => {
                if (!Number.isFinite(api.value(1))) return;
                const point = api.coord([api.value(0), api.value(1)]);
                const width = Math.min(72, Math.max(24, api.size([1, 0])[0] * .5));
                return { type: "line", shape: { x1: point[0] - width / 2, y1: point[1], x2: point[0] + width / 2, y2: point[1] }, style: { stroke: "#ff0000", lineWidth: 1.5, lineDash: [6, 5] } };
            } },
            ...(icuDensity ? [{ id: "hai-density-medians", type: "custom", silent: true, tooltip: { show: false }, z: 4,
                data: categoryRows.map((row, index) => !row || row.median == null || selected[row.name] === false ? "-" : [index, row.median]),
                renderItem: (params, api) => {
                    if (!Number.isFinite(api.value(1))) return;
                    const point = api.coord([api.value(0), api.value(1)]);
                    const width = Math.min(72, Math.max(24, api.size([1, 0])[0] * .5));
                    return { type: "line", shape: { x1: point[0] - width / 2, y1: point[1], x2: point[0] + width / 2, y2: point[1] }, style: { stroke: "#000000", lineWidth: 1.5 } };
                }
            }] : [])
        ],
        media: [
            { query: { maxWidth: 650 }, option: { title: { textStyle: { fontSize: 11 } }, grid: { left: 55, right: 15, bottom: 110 }, xAxis: siteDensity ? [{ axisLabel: { rotate: 55, fontSize: 9 } }, { offset: 65, axisLabel: { fontSize: 11 } }] : { axisLabel: { rotate: 45, fontSize: 10 } }, yAxis: { nameGap: 35, nameTextStyle: { fontSize: 10 } } } },
            { option: { title: { textStyle: { fontSize: 14 } }, grid: { left: 75, right: 30, bottom: 80 }, xAxis: siteDensity ? [{ axisLabel: { rotate: 0, fontSize: 11 } }, { offset: 26, axisLabel: { fontSize: 12 } }] : { axisLabel: { rotate: 0, fontSize: 11 } }, yAxis: { nameGap: 48, nameTextStyle: { fontSize: 12 } } } }
        ]
    };
}

function haiRateAnnotations(report) {
    const definitions = [
        ["max", "max", 1, -12], ["upper fence", "high", -1, 10],
        ["q3", "q3", 1, -3], ["median", "median", -1, 0],
        ["q1", "q1", 1, -3], ["lower fence", "low", -1, -9],
        ["min", "min", 1, 10]
    ];
    return {
        id: "hai-annotations", type: "custom", silent: true, clip: false,
        animation: false, tooltip: { show: false }, z: 10,
        data: report.rows.flatMap((row, hospitalIndex) => definitions.map((definition, labelIndex) => [hospitalIndex, row[definition[1]], labelIndex])),
        renderItem: (params, api) => {
            const [label, , side, offset] = definitions[api.value(2)];
            const point = api.coord([api.value(0), api.value(1)]);
            const halfWidth = Math.min(100, Math.max(60, api.size([1, 0])[0] * .5)) / 2;
            const edge = point[0] + side * halfWidth;
            const textPosition = edge + side * 12;
            const textHeight = point[1] + offset;
            return { type: "group", children: [
                { type: "polyline", shape: { points: [[edge, point[1]], [edge + side * 6, point[1]], [textPosition, textHeight]] }, style: { stroke: "#999999", fill: null, lineWidth: 1 } },
                { type: "text", style: { x: textPosition, y: textHeight, text: `${label}: ${Number(Number(api.value(1)).toFixed(7))}`, align: side > 0 ? "left" : "right", verticalAlign: "middle", font: "10px Consolas, monospace", fill: "#52636f", backgroundColor: "#ffffff", borderColor: "#999999", borderWidth: 1, padding: [2, 4] } }
            ] };
        }
    };
}

export const clinicalAntibioticPanels = {
    "Escherichia coli": ["Ampicillin", "Co-trimoxazole", "Ciprofloxacin", "Levofloxacin", "Ceftriaxone", "Cefotaxime", "Ceftazidime", "Cefepime", "Imipenem", "Meropenem", "Ertapenem", "Doripenem"],
    "Klebsiella pneumoniae": ["Ampicillin", "Amoxicillin/Clavulanate", "Ciprofloxacin", "Levofloxacin", "Ceftriaxone", "Cefotaxime", "Ceftazidime", "Cefepime", "Imipenem", "Meropenem", "Ertapenem", "Amikacin"],
    "Staphylococcus aureus": ["Oxacillin", "Clindamycin", "Erythromycin", "Ciprofloxacin", "Gentamicin", "Co-trimoxazole", "Vancomycin", "Linezolid", "Daptomycin"],
    "Acinetobacter baumannii": ["Amikacin", "Ampicillin/Sulbactam", "Cefepime", "Ceftazidime", "Ciprofloxacin", "Gentamicin", "Imipenem", "Meropenem", "Tigecycline"],
    "Pseudomonas aeruginosa": ["Amikacin", "Cefepime", "Ceftazidime", "Ciprofloxacin", "Gentamicin", "Imipenem", "Meropenem", "Piperacillin/Tazobactam", "Tobramycin"]
};

export function clinicalSpecimens(organism, source) {
    return source !== "全部（CO+HO）" ? ["全部檢體"] : organism === "Acinetobacter baumannii" ? ["全部檢體", "血液"] : ["全部檢體", "血液", "尿液"];
}

export function clinicalResistanceData(query, years) {
    const organism = query.filters.organism;
    const labels = clinicalAntibioticPanels[organism] ?? [];
    const source = query.filters.source;
    const specimens = clinicalSpecimens(organism, source);
    const specimen = specimens.includes(query.filters.specimen) ? query.filters.specimen : specimens[0];
    const organismIndex = Math.max(0, Object.keys(clinicalAntibioticPanels).indexOf(organism));
    const base = [76, 46, 45, 47, 32, 34, 25, 20, 3, 3.5, 4, 2.5];
    const rows = years.flatMap(year => labels.map((name, index) => {
        const sourceScale = source === "社區相關感染（CO）" ? .6 : source === "醫療相關感染（HO）" ? .4 : 1;
        const specimenScale = specimen === "血液" ? .24 : specimen === "尿液" ? .42 : 1;
        const tested = Math.round((12500 + organismIndex * 877 + index * 131 + (year - 2019) * 307) * sourceScale * specimenScale);
        const target = Math.max(0, Math.min(100, base[index] + organismIndex * 4 + Math.sin((year - 2019) * .9 + index) * 3 +
            (sourceScale === .4 ? 6 : sourceScale === .6 ? -5 : 0) + (specimen === "血液" ? 2 : specimen === "尿液" ? -2 : 0)));
        const resistant = Math.round(tested * target / 100);
        return { year, name, organism, antibiotic: name, source, specimen, tested, resistant, value: resistant / tested * 100 };
    }));
    const colors = {
        Ampicillin: "#999999", "Co-trimoxazole": "#70ad47", Ciprofloxacin: "#a379aa", Levofloxacin: "#287b92",
        Ceftriaxone: "#b8c924", Cefotaxime: "#9cb5cf", Ceftazidime: "#cf8979", Cefepime: "#715e94",
        Imipenem: "#46566c", Meropenem: "#d5bf2c", Ertapenem: "#efc997", Doripenem: "#9c0134",
        "Amoxicillin/Clavulanate": "#33a2a0", Amikacin: "#7ab8bd", Oxacillin: "#b84837", Clindamycin: "#b67c3f",
        Erythromycin: "#3067a8", Gentamicin: "#884178", Vancomycin: "#587654", Linezolid: "#398e81",
        Daptomycin: "#273d4f", "Ampicillin/Sulbactam": "#dfaf51", Tigecycline: "#eb9bac", "Piperacillin/Tazobactam": "#bd3328", Tobramycin: "#518ca3"
    };
    return { kind: "clinical-resistance", unit: "%", years, labels, rows, colors, organism, source, specimen };
}

export function clinicalResistanceOptions(query, report) {
    const single = report.years.length === 1;
    const rows = single ? [...report.rows].sort((left, right) => right.value - left.value || left.name.localeCompare(right.name)) : report.rows;
    const period = single ? String(query.start) : `${query.start}-${query.end}`;
    const title = `${report.organism} (${period})\n${report.source} · ${report.specimen}`;
    const tooltip = { trigger: "item", confine: true, formatter: params => {
        const row = params.data.row;
        if (!row) return "";
        return `${row.year} · ${row.organism}<br>${row.source} · ${row.specimen}<br>${row.antibiotic}<br>抗藥性：${row.value.toFixed(1)}%<br>${query.english ? "n tested" : "檢驗數"}: ${row.tested.toLocaleString("en-US")}<br>${query.english ? "n resistant" : "抗藥株數"}: ${row.resistant.toLocaleString("en-US")}`;
    } };
    const options = {
        ...baseOption(),
        title: { text: title, left: "center", textStyle: { fontSize: 13 } },
        tooltip,
        grid: single ? { left: 210, right: 65, top: 85, bottom: 65 } : { left: 70, right: 275, top: 80, bottom: 65 },
        legend: single ? { show: false } : { type: "plain", orient: "vertical", right: 10, top: 85, bottom: null, textStyle: { fontSize: 11 }, tooltip: { show: true } },
        xAxis: single ? { type: "value", name: "抗藥性（%）", nameLocation: "middle", nameGap: 35, min: 0, max: 100, interval: 25, axisLabel: { formatter: value => `${Math.round(value)}%` } }
            : { type: "category", data: report.years, name: "年度", nameLocation: "middle", nameGap: 32, boundaryGap: false, axisLabel: { interval: 0 } },
        yAxis: single ? { type: "category", data: rows.map(row => row.name), inverse: true, axisLabel: { fontSize: 11 } }
            : { type: "value", name: "抗藥性（%）", nameLocation: "middle", nameGap: 45, min: 0, max: 100, interval: 10, axisLabel: { formatter: value => `${Math.round(value)}%` } },
        series: single ? [{ type: "bar", barMaxWidth: 20, itemStyle: { color: "#ce9e78" }, label: { show: true, position: "right", fontSize: 10, formatter: params => `${params.value.toFixed(1)}%` }, data: rows.map(row => ({ value: row.value, row })) }]
            : report.labels.map(name => ({ name, type: "line", symbol: "circle", symbolSize: 7, connectNulls: false, itemStyle: { color: report.colors[name] }, emphasis: { focus: "series" }, data: report.years.map(year => { const row = report.rows.find(candidate => candidate.year === year && candidate.name === name); return { value: row?.value ?? null, row }; }) }))
    };
    return { baseOption: options, media: [{ query: { maxWidth: 650 }, option: {
        title: { text: `${report.organism}\n${period} · ${report.source}\n${report.specimen}`, textStyle: { fontSize: 11 } },
        grid: single ? { left: 155, right: 45, top: 95, bottom: 65 } : { left: 58, right: 15, top: 95, bottom: 125 },
        legend: single ? { show: false } : { type: "scroll", orient: "horizontal", left: 8, right: 8, top: "84%", bottom: null, textStyle: { fontSize: 10, width: 155, overflow: "truncate" } },
        xAxis: single ? { nameTextStyle: { fontSize: 10 }, axisLabel: { fontSize: 9 } } : { axisLabel: { rotate: 45, fontSize: 9 }, nameGap: 42 },
        yAxis: single ? { axisLabel: { fontSize: 9 } } : { nameGap: 40, nameTextStyle: { fontSize: 10 } }
    } }, { option: { title: options.title, grid: options.grid, legend: options.legend, xAxis: options.xAxis, yAxis: options.yAxis } }] };
}

export function susceptibilityData(query) {
    const allGroups = [
        ["Aerobic Gram Positive", ["Enterococcus faecalis", "Enterococcus faecium", "Staphylococcus aureus", "Listeria monocytogenes"]],
        ["Aerobic Gram Negative – Enterobacterales", ["Escherichia coli", "Klebsiella pneumoniae", "Proteus mirabilis"]],
        ["Aerobic Gram Negative – Non Enterobacterales", ["Pseudomonas aeruginosa", "Acinetobacter baumannii"]],
        ["Anaerobes", ["Bacteroides fragilis", "Clostridium perfringens"]]
    ];
    const groups = allGroups.filter(([group]) => !query.filters.group || query.filters.group === "全部分群" || query.filters.group === group);
    const columns = ["Oxacillin", "Ampicillin", "Amoxicillin/Clavulanate", "Piperacillin/Tazobactam", "Ceftriaxone", "Ceftazidime", "Meropenem", "Ertapenem", "Clindamycin", "Ciprofloxacin", "Nitrofurantoin", "Trimethoprim/Sulfamethoxazole", "Gentamicin", "Tobramycin", "Amikacin", "Vancomycin", "Linezolid", "Daptomycin"];
    const allNames = allGroups.flatMap(([, names]) => names);
    const levels = ["全國（不分醫療層級）", "醫學中心", "區域醫院", "地區醫院"];
    const levelIndex = Math.max(0, levels.indexOf(query.filters.level));
    const weights = [51, 79, 91, 74, 79, 99.5, 99.7, 66, 17, 81, 74, 89, 88, 98, 100, 64, 98, 93, 0];
    const rows = groups.flatMap(([group, names]) => names.flatMap(name => columns.map((antibiotic, columnIndex) => {
        const organismIndex = allNames.indexOf(name);
        const index = organismIndex * columns.length + columnIndex;
        const status = index % 23 === 0 ? "intrinsic" : index % 17 === 0 ? "not-reported" : "tested";
        const tested = status === "tested" ? Math.round((8000 + organismIndex * 317 + columnIndex * 197 + (query.start - 2019) * 109) * [1, .45, .35, .2][levelIndex]) : null;
        const target = Math.max(0, Math.min(100, weights[(organismIndex * 3 + columnIndex) % weights.length] + (query.start - 2024) * .6 - levelIndex * 1.3));
        const susceptible = tested === null ? null : Math.round(tested * target / 100);
        return { year: query.start, level: query.filters.level, group, name, antibiotic, status, tested, susceptible, value: tested === null ? null : susceptible / tested * 100 };
    })));
    return { kind: "susceptibility-heatmap", unit: "%", years: [query.start], groups, columns, labels: groups.flatMap(([, names]) => names), rows };
}

export function isolateAlluvialData(query, years) {
    const labels = specimenOrganisms.filter(name => !(query.hidden ?? []).includes(name));
    const totals = [603463, 591201, 628659, 653415, 729812, 755833];
    const weights = [34, 15, 12, 10, 3, 4, 6, 2, 1, 1, 12];
    const sourceView = query.filters.view === "感染來源";
    const filter = sourceView ? query.filters.source : query.filters.specimen;
    const scale = sourceView ? filter === "社區相關感染（CO）" ? .62 : filter === "醫療相關感染（HO）" ? .38 : 1
        : ({ "血液": .16, "尿液": .3, "痰液": .24, "膿/傷口": .13, "糞便": .04 }[filter] ?? 1);
    const rows = [], annualTotals = {};
    for (const year of years) {
        const index = Math.max(0, Math.min(5, year - 2019));
        const total = Math.round(totals[index] * scale);
        const amounts = weights.map((weight, organismIndex) => weight * (1 + Math.sin(index * .65 + organismIndex) * .12) *
            (scale === 1 ? 1 : 1 + Math.cos(organismIndex + scale * 6) * .28));
        const sum = amounts.reduce((accumulator, amount) => accumulator + amount, 0);
        const counts = amounts.map(amount => Math.floor(amount / sum * total));
        counts[counts.length - 1] += total - counts.reduce((accumulator, count) => accumulator + count, 0);
        const ranked = specimenOrganisms.filter(name => name !== "Other").sort((left, right) => counts[specimenOrganisms.indexOf(right)] - counts[specimenOrganisms.indexOf(left)]);
        annualTotals[year] = total;
        specimenOrganisms.forEach((name, organismIndex) => {
            if (labels.includes(name)) rows.push({ year, name, value: counts[organismIndex], total, rank: name === "Other" ? null : ranked.indexOf(name) + 1,
                percent: counts[organismIndex] / total * 100, view: query.filters.view, selection: filter });
        });
    }
    const colors = ["#3187b8", "#a9c6e7", "#ff8b20", "#ffbb76", "#eb6267", "#b3d99c", "#57ae52", "#da96ab", "#af9ac4", "#dcbece", "#b9a8cd"];
    return { kind: "isolate-alluvial", unit: "n", years, labels, rows, annualTotals,
        colors: Object.fromEntries(specimenOrganisms.map((name, index) => [name, colors[index]])) };
}

function alluvialOptions(report) {
    const nodes = report.rows.slice().sort((left, right) => left.year - right.year || right.value - left.value).map(row => ({ name: `${row.year}|${row.name}`, depth: report.years.indexOf(row.year), itemStyle: { color: color(row.name, report.labels.indexOf(row.name)) }, row }));
    const links = report.rows.filter(row => row.year < report.years.at(-1)).map(row => ({ source: `${row.year}|${row.name}`, target: `${row.year + 1}|${row.name}`, value: Math.min(row.value, report.rows.find(next => next.year === row.year + 1 && next.name === row.name).value), lineStyle: { color: color(row.name, report.labels.indexOf(row.name)), opacity: .4 }, row }));
    return { ...baseOption(), legend: { show: false }, tooltip: { trigger: "item", confine: true, formatter: params => { const row = params.data.row; return `${row.year} · ${row.name}<br>排名：${row.rank}<br>${row.value.toFixed(1)} ${report.unit}<br>占比：${row.percent}%`; } }, graphic: report.years.map((year, index) => ({ type: "text", left: `${5 + index / Math.max(1, report.years.length - 1) * 86}%`, top: 8, style: { text: String(year), fill: "#52636f", fontSize: 12 } })), series: [{ type: "sankey", left: "5%", right: "8%", top: 45, bottom: 20, nodeWidth: 14, nodeGap: 9, layoutIterations: 0, emphasis: { focus: "trajectory" }, label: { show: report.years.length < 8, formatter: params => params.name.split("|")[1], fontSize: 10 }, data: nodes, links }] };
}

function heatmapOptions(report) {
    const rowLabels = report.groups.flatMap(([group, names]) => [group, ...names]);
    const data = report.rows.map(row => ({ value: [report.columns.indexOf(row.antibiotic), rowLabels.indexOf(row.name), row.value ?? -1], row, itemStyle: row.value === null ? { color: "#d9dfe3" } : undefined }));
    return { ...baseOption(), grid: { left: 300, right: 20, top: 100, bottom: 70 }, legend: { show: false }, tooltip: { trigger: "item", confine: true, formatter: params => { const row = params.data.row; return `${row.name}<br>${row.antibiotic}<br>敏感性：${row.value === null ? "未檢驗／未提供" : `${row.value}%`}<br>檢驗數：${row.tested ?? "—"}<br>敏感株數：${row.susceptible ?? "—"}`; } }, xAxis: { type: "category", data: report.columns, position: "top", axisLabel: { rotate: 35, fontSize: 11 }, splitArea: { show: true } }, yAxis: { type: "category", data: rowLabels, inverse: true, axisLabel: { fontSize: 11, formatter: value => report.groups.some(([group]) => group === value) ? `{group|${value}}` : value, rich: { group: { fontWeight: "bold", color: "#226b9e", fontSize: 10 } } }, splitArea: { show: true } }, visualMap: { min: 0, max: 100, calculable: true, orient: "horizontal", left: "center", bottom: 0, inRange: { color: ["#b64946", "#f1c875", "#61a77d", "#247654"] } }, series: [{ type: "heatmap", data, label: { show: true, fontSize: 11, formatter: params => params.value[2] < 0 ? "—" : `${params.value[2]}%` }, emphasis: { itemStyle: { borderColor: "#263d48", borderWidth: 2 } } }] };
}

function correlationData(query, years) {
    const organism = query.filters.organism;
    const antibioticClass = organism === "VRE" ? "Glycopeptides" : "Carbapenems";
    const atc = organism === "VRE" ? ["A07AA09", "J01XA01", "J01XA02"] : ["J01DH02", "J01DH03", "J01DH04", "J01DH51"];
    const did = [14, 16, 18, 20, 22, 24, 25, 27, 29, 32, 33];
    const resistance = [3.5, 3, 4.2, 6.8, 7.1, 8.4, 8.5, 9.2, 10.4, 12, 13.5];
    return { kind: "correlation", unit: "DID", years, labels: [antibioticClass], organism, antibioticClass, atc, rows: years.map(year => {
        const index = Math.max(0, Math.min(did.length - 1, year - 2015));
        return { year, name: antibioticClass, organism, antibioticClass, atc: atc.join(", "), value: did[index] * (organism === "VRE" ? .35 : organism === "CRE" ? 1.1 : 1), resistance: resistance[index] * (organism === "VRE" ? 1.4 : organism === "CRE" ? .8 : 1) };
    }) };
}

export function regressionStatistics(rows) {
    const pairs = rows.filter(row => Number.isFinite(row.value) && Number.isFinite(row.resistance));
    if (pairs.length < 2) return null;
    const meanX = pairs.reduce((sum, row) => sum + row.value, 0) / pairs.length;
    const meanY = pairs.reduce((sum, row) => sum + row.resistance, 0) / pairs.length;
    const covariance = pairs.reduce((sum, row) => sum + (row.value - meanX) * (row.resistance - meanY), 0);
    const varianceX = pairs.reduce((sum, row) => sum + (row.value - meanX) ** 2, 0);
    const varianceY = pairs.reduce((sum, row) => sum + (row.resistance - meanY) ** 2, 0);
    if (varianceX === 0) return null;
    const slope = covariance / varianceX;
    const correlation = varianceY === 0 ? null : Math.max(-1, Math.min(1, covariance / Math.sqrt(varianceX * varianceY)));
    return { count: pairs.length, slope, intercept: meanY - slope * meanX, correlation, rSquared: correlation === null ? null : correlation ** 2 };
}

export function correlationOptions(query, report, focused = false) {
    const rows = report.rows.filter(row => Number.isFinite(row.value) && Number.isFinite(row.resistance));
    const stats = regressionStatistics(rows);
    const bounds = (values, percentage = false) => {
        const low = Math.min(...values), high = Math.max(...values);
        const padding = Math.max((high - low) * .12, .5);
        return { min: focused ? Math.max(0, Math.floor(low - padding)) : 0, max: percentage ? Math.min(100, Math.ceil(high + padding)) : Math.ceil(high + padding) };
    };
    const hue = report.organism === "VRE" ? "#487d70" : "#2e6886";
    const equation = stats ? `y = ${stats.slope.toFixed(3)}x ${stats.intercept < 0 ? "-" : "+"} ${Math.abs(stats.intercept).toFixed(3)}\nr = ${stats.correlation?.toFixed(4) ?? "N/A"} · R² = ${stats.rSquared?.toFixed(4) ?? "N/A"} · n = ${stats.count}` : "Regression: N/A";
    const xBounds = rows.length ? bounds(rows.map(row => row.value)) : { min: 0, max: 1 };
    const yBounds = rows.length ? bounds(rows.map(row => row.resistance), true) : { min: 0, max: 1 };
    const options = {
        ...baseOption(),
        animation: false,
        title: { text: `${report.organism} · ${report.antibioticClass} (${query.start}-${query.end})`, left: "center", textStyle: { fontSize: 13 } },
        graphic: { elements: [{ id: "correlation-result", type: "text", right: 35, top: 48, style: { text: equation, fontSize: 12, lineHeight: 19, fill: "#334653", align: "right" } }] },
        grid: { left: 80, right: 30, top: 100, bottom: 110 },
        legend: { type: "plain", data: [report.antibioticClass, "回歸線"], left: "center", top: null, bottom: 12, textStyle: { fontSize: 11 } },
        xAxis: { type: "value", name: `${report.antibioticClass} DID`, nameLocation: "middle", nameGap: 35, ...xBounds, axisLabel: { formatter: value => Number(value).toFixed(1) } },
        yAxis: { type: "value", name: `${report.organism} 抗藥性（%）`, nameLocation: "middle", nameGap: 50, ...yBounds },
        tooltip: { trigger: "item", confine: true, formatter: params => {
            const row = params.data.row;
            return row ? `${row.year} · ${row.organism}<br>${row.antibioticClass}<br>DID：${row.value.toFixed(1)}<br>抗藥性：${row.resistance.toFixed(1)}%` : "";
        } },
        series: [
            { name: report.antibioticClass, type: "scatter", symbolSize: 12, itemStyle: { color: hue }, data: rows.map((row, index) => ({ value: [row.value, row.resistance], row, itemStyle: { color: hue, opacity: .35 + index / Math.max(1, rows.length - 1) * .65 } })) },
            { name: "回歸線", type: "line", symbol: "none", silent: true, tooltip: { show: false }, itemStyle: { color: hue }, lineStyle: { color: hue, type: "dotted", width: 2 }, data: stats ? [Math.min(...rows.map(row => row.value)), Math.max(...rows.map(row => row.value))].map(value => [value, stats.slope * value + stats.intercept]) : [] }
        ]
    };
    return { baseOption: options, media: [{ query: { maxWidth: 650 }, option: {
        grid: { left: 65, right: 20, top: 110, bottom: 110 },
        yAxis: { ...options.yAxis, nameGap: 40, nameTextStyle: { fontSize: 10 } },
        xAxis: { ...options.xAxis, nameGap: 35, nameTextStyle: { fontSize: 11 }, axisLabel: { fontSize: 9 } },
        graphic: { elements: [{ id: "correlation-result", type: "text", right: 20, top: 45, style: { text: equation, fontSize: 10, lineHeight: 18, fill: "#334653", align: "right" } }] },
        title: { ...options.title, text: `${report.organism} · ${report.antibioticClass}\n${query.start}-${query.end}`, textStyle: { fontSize: 12 } },
        legend: { ...options.legend, textStyle: { fontSize: 10 } }
    } }, { option: { title: options.title, grid: options.grid, xAxis: options.xAxis, yAxis: options.yAxis, graphic: options.graphic, legend: options.legend } }] };
}

function scatterOptions(report) {
    const points = report.rows.map(row => [row.value, row.resistance, row.year]);
    const count = points.length;
    const meanX = points.reduce((sum, point) => sum + point[0], 0) / count;
    const meanY = points.reduce((sum, point) => sum + point[1], 0) / count;
    const covariance = points.reduce((sum, point) => sum + (point[0] - meanX) * (point[1] - meanY), 0);
    const varianceX = points.reduce((sum, point) => sum + (point[0] - meanX) ** 2, 0);
    const varianceY = points.reduce((sum, point) => sum + (point[1] - meanY) ** 2, 0);
    const slope = covariance / varianceX;
    const correlation = covariance / Math.sqrt(varianceX * varianceY);
    const bounds = [Math.min(...points.map(point => point[0])), Math.max(...points.map(point => point[0]))];
    return { ...baseOption(), title: { text: `r = ${correlation.toFixed(3)} · R² = ${(correlation ** 2).toFixed(3)}`, left: "center", textStyle: { fontSize: 14 } }, tooltip: { trigger: "item", confine: true, formatter: params => `${params.value[2] ?? "回歸線"}<br>DID：${Number(params.value[0]).toFixed(1)}<br>抗藥性：${Number(params.value[1]).toFixed(1)}%` }, xAxis: { type: "value", name: "使用量密度（DID）", nameLocation: "middle", nameGap: 35 }, yAxis: { type: "value", name: "抗藥性（%）" }, series: [{ name: report.labels[0], type: "scatter", symbolSize: 12, data: points, label: { show: true, position: "top", formatter: params => String(params.value[2]) }, itemStyle: { color: "#267d79" } }, { name: "回歸線", type: "line", symbol: "none", data: bounds.map(value => [value, meanY + slope * (value - meanX)]), lineStyle: { color: "#b14b3c", type: "dashed" } }] };
}

let regionsPromise;
async function loadRegions(engine) {
    regionsPromise ??= fetch(new URL("../data/COUNTY_MOI_1090820.json", import.meta.url)).then(response => { if (!response.ok) throw new Error("Unable to load Taiwan map"); return response.json(); }).then(geo => {
        engine.registerMap("amr-six-regions", createRegionGeoJson(geo));
    }).catch(error => { regionsPromise = undefined; throw error; });
    return regionsPromise;
}

export function createRegionGeoJson(geo) {
    const features = Object.entries(regionCounties).map(([name, counties]) => ({ type: "Feature", properties: { name }, geometry: { type: "MultiPolygon", coordinates: geo.features.filter(feature => counties.includes(feature.properties.name)).flatMap(feature => feature.geometry.type === "Polygon" ? [feature.geometry.coordinates] : feature.geometry.coordinates) } }));
    return { type: "FeatureCollection", features };
}

const mdroColors = { CRE: "#46752d", "CR E. coli": "#277f82", CRKP: "#4472c4", CRAB: "#9c0134", CRPA: "#bf9000", VRE: "#6f2ea0", "VR E. faecium": "#46566c", MRSA: "#ed7d31" };

function mdroTitle(query, region) {
    return `${query.filters.organism} · ${query.filters.hospital}\n${region ?? "全國"} (${query.start}-${query.end})`;
}

export function mdroTrend(query, report, region = null, selected = {}) {
    const rows = report.years.map(year => {
        const annual = report.rows.filter(row => row.year === year && (!region || row.name === region));
        const count = annual.reduce((sum, row) => sum + row.count, 0);
        const previousCount = annual.reduce((sum, row) => sum + row.previousCount, 0);
        const value = count ? annual.reduce((sum, row) => sum + row.count * row.value, 0) / count : null;
        const previous = previousCount >= 20 ? annual.reduce((sum, row) => sum + row.previousCount * row.previous, 0) / previousCount : null;
        return { year, name: region ?? "全國", count, value, previous, hospital: query.filters.hospital, organism: query.filters.organism };
    });
    const axis = (name, values) => {
        const visible = values.filter(Number.isFinite);
        const maximum = Math.max(1, ...visible);
        return { type: "value", name, min: 0, max: name === "菌株數" ? Math.ceil(maximum * 1.15) : Math.min(100, Math.ceil(maximum * 1.15)), minInterval: 1, nameTextStyle: { align: name === "菌株數" ? "left" : "right" }, axisLabel: { formatter: value => String(Math.round(value)) } };
    };
    const hue = mdroColors[query.filters.organism] ?? "#46752d";
    return {
        yAxis: [axis("菌株數", selected["菌株數"] === false ? [] : rows.map(row => row.count)), axis("抗藥性（%）", selected["抗藥性"] === false ? [] : rows.filter(row => row.count >= 20).map(row => row.value))],
        series: [
            { id: "mdro-count", name: "菌株數", type: "bar", barMaxWidth: 30, itemStyle: { color: hue, opacity: .6 }, data: rows.map(row => ({ value: row.count, row })) },
            { id: "mdro-resistance", name: "抗藥性", type: "line", yAxisIndex: 1, symbolSize: 7, connectNulls: false, itemStyle: { color: hue }, data: rows.map(row => ({ value: row.count < 20 ? null : row.value, row })) }
        ]
    };
}

function mdroTooltip(params) {
    const row = params.data?.row;
    if (!row) return "";
    const heading = `${row.year} · ${row.name}<br>${row.hospital} · ${row.organism}<br>菌株數：${row.count}`;
    if (row.count < 20) return `${heading}<br>少於 20 株，不具代表性`;
    const delta = row.previous === null || row.previousCount < 20 ? null : row.value - row.previous;
    const change = delta === null ? "無前一年資料" : Math.abs(delta) < .05 ? "持平" : `<span style="color:${delta > 0 ? "#b64946" : "#247654"}">${delta > 0 ? "↑" : "↓"} ${Math.abs(delta).toFixed(1)} 個百分點</span>`;
    return `${heading}<br>抗藥性：${row.value.toFixed(0)}%<br>較前一年：${change}`;
}

function mapOptions(query, report) {
    const trend = mdroTrend(query, report);
    return {
        baseOption: {
            ...baseOption(),
            timeline: { axisType: "category", data: report.years, bottom: 0, left: 15, right: 15, autoPlay: false, playInterval: 1600, label: { fontSize: 10 } },
            title: { text: mdroTitle(query), left: 15, textStyle: { fontSize: 13 }, subtextStyle: { fontSize: 11 } },
            grid: { left: "51%", right: 45, top: 90, bottom: 140, containLabel: true },
            legend: { data: ["菌株數", "抗藥性"], left: "center", bottom: 65 },
            tooltip: { trigger: "item", confine: true, formatter: mdroTooltip },
            visualMap: { seriesIndex: 0, dimension: 0, type: "piecewise", selectedMode: false, left: 12, bottom: 102, orient: "horizontal", itemWidth: 12, itemHeight: 10, itemGap: 8, textStyle: { fontSize: 10 }, pieces: [
                { value: -1, label: "少於 20 株（白色）", color: "#ffffff" },
                { gte: 0, lte: 2, label: "≤2%", color: "#dceaf0" },
                { gt: 2, lte: 4, label: ">2–4%", color: "#b4cbdc" },
                { gt: 4, lte: 6, label: ">4–6%", color: "#8e94bf" },
                { gt: 6, lte: 8, label: ">6–8%", color: "#8575a7" },
                { gt: 8, lte: 10, label: ">8–10%", color: "#76528f" },
                { gt: 10, label: ">10%", color: "#681d77" }
            ] },
            graphic: { elements: [{ id: "mdro-bands", type: "text", left: 12, bottom: 132, style: { text: "級距說明", fontSize: 11, fill: "#334653" } }] },
            xAxis: { type: "category", data: report.years, axisLabel: { interval: 0, rotate: report.years.length > 6 ? 45 : 0, fontSize: 10 } },
            yAxis: trend.yAxis,
            series: [{ id: "mdro-map", type: "map", map: "amr-six-regions", boundingCoords: [[119.8, 25.5], [122.1, 21.8]], left: "9%", top: 70, width: "22%", height: "55%", label: { show: true, fontSize: 10 }, itemStyle: { borderColor: "#53616d", borderWidth: 1 }, emphasis: { label: { show: true }, itemStyle: { borderWidth: 2 } } }, ...trend.series]
        },
        options: report.years.map(year => ({ title: { subtext: `${year} 年 · 示意資料` }, series: [{ id: "mdro-map", data: report.rows.filter(row => row.year === year).map(row => ({ name: row.name, value: row.count < 20 ? -1 : row.value, row })) }] })),
        media: [{ query: { maxWidth: 650 }, option: {
            title: { left: 10, textStyle: { fontSize: 12 } },
            series: [{ id: "mdro-map", left: "2%", top: 85, width: "43%", height: "30%", label: { show: false }, emphasis: { label: { show: false } } }],
            grid: { left: 12, right: 12, top: "48%", bottom: 155, containLabel: true },
            visualMap: { left: "auto", right: 10, top: 115, bottom: "auto", orient: "vertical", itemGap: 8 },
            graphic: { elements: [{ id: "mdro-bands", type: "text", left: null, right: 10, top: 88, bottom: null, style: { text: "級距說明", fontSize: 11, fill: "#334653" } }] }, legend: { bottom: 58, textStyle: { fontSize: 10 } },
            timeline: { left: 5, right: 5, label: { fontSize: 9, rotate: 45 } },
            xAxis: { axisLabel: { rotate: 45, fontSize: 9 } }, yAxis: [{ nameTextStyle: { fontSize: 10 } }, { nameTextStyle: { fontSize: 10 } }]
        } }, { option: { grid: { left: "51%", right: 45, top: 90, bottom: 140, containLabel: true }, visualMap: { left: 12, right: "auto", top: "auto", bottom: 102, orient: "horizontal" }, graphic: { elements: [{ id: "mdro-bands", type: "text", left: 12, right: null, top: "73%", bottom: null, style: { text: "級距說明", fontSize: 11, fill: "#334653" } }] }, series: [{ id: "mdro-map", left: "9%", top: 70, width: "22%", height: "55%", label: { show: true }, emphasis: { label: { show: true } } }] } }]
    };
}

export function mdroFacetData(query, years) {
    const levels = ["醫學中心", "區域醫院", "地區醫院", "全國"];
    const labels = levels.filter(level => (query.levels ?? levels).includes(level));
    const source = query.filters.source;
    const indicators = ["CRAB", "CRE", "CR E. coli", "CRKP", "CRPA", "MRSA", "VRE", "VR Enterococcus faecalis", "VR Enterococcus faecium"];
    const organismIndex = Math.max(0, indicators.indexOf(query.filters.organism));
    const rows = [];
    for (const year of years) {
        const yearIndex = Math.max(0, Math.min(5, year - 2019));
        const all = levels.slice(0, 3).map((name, levelIndex) => {
            const partitions = ["CO", "HO"].map((category, sourceIndex) => {
                const count = Math.round(([4400, 5600, 900][levelIndex] + sourceIndex * [2600, 1000, -200][levelIndex]) *
                    [1, .94, 1.03, 1.05, 1.08, 1.1][yearIndex] * (1 + organismIndex * .07) + yearIndex * levelIndex * 180);
                const rate = Math.max(.01, Math.min(.95, [.4, .48, .67][levelIndex] + sourceIndex * .17 +
                    [0, .02, .045, .065, .045, -.01][yearIndex] - organismIndex * .025));
                const resistant = Math.round(count * rate);
                const intermediate = Math.min(count - resistant, Math.round(count * (.03 + levelIndex * .005)));
                return { category, count, resistant, intermediate, susceptible: count - resistant - intermediate };
            });
            const active = source === "社區相關感染（CO）" ? [partitions[0]] : source === "醫療相關感染（HO）" ? [partitions[1]] : partitions;
            const count = active.reduce((sum, part) => sum + part.count, 0);
            const resistant = active.reduce((sum, part) => sum + part.resistant, 0);
            const intermediate = active.reduce((sum, part) => sum + part.intermediate, 0);
            return { year, name, level: name, organism: query.filters.organism, source, count, co: partitions[0].count, ho: partitions[1].count,
                susceptible: count - resistant - intermediate, intermediate, resistant, nonsusceptible: resistant + intermediate, value: resistant / count * 100 };
        });
        const national = { ...all[0], name: "全國", level: "全國" };
        for (const key of ["count", "co", "ho", "susceptible", "intermediate", "resistant", "nonsusceptible"]) national[key] = all.reduce((sum, row) => sum + row[key], 0);
        national.value = national.resistant / national.count * 100;
        rows.push(...[...all, national].filter(row => labels.includes(row.name)));
    }
    return { kind: "mdro-facets", years, labels, rows, source, organism: query.filters.organism,
        categories: source === "全部（CO+HO）" ? ["CO", "HO"] : ["S", "I+R"] };
}

export function mdroFacetOptions(query, report, focusedYear = null, selected = {}) {
    const colors = { "醫學中心": "#4472c4", "區域醫院": "#ed7d31", "地區醫院": "#999999", "全國": "#e4af25" };
    const legendSelection = Object.fromEntries(Object.entries(selected).map(([name, visible]) => [chartText(name, query), visible]));
    const facets = report.labels.filter(name => name !== "全國");
    if (!facets.length && report.labels.includes("全國")) facets.push("全國");
    const upperRows = report.years.flatMap(year => facets.map(level => report.rows.find(row => row.year === year && row.name === level)));
    const categories = upperRows.map(row => `${row.year}|${row.name}`);
    const barValue = (row, category) => category === "CO" ? row.co : category === "HO" ? row.ho : category === "S" ? row.susceptible : row.nonsusceptible;
    const tooltip = { trigger: "item", confine: true, formatter: params => {
        const row = params.data?.row;
        if (!row) return "";
        return `${row.year} · ${row.level}<br>${row.organism}<br>${row.source}<br>` + (params.seriesType === "bar"
            ? `${params.data.category}: ${params.value.toLocaleString("en-US")} ${query.english ? "isolates" : "株"}`
            : `抗藥性：${row.value.toFixed(1)}%<br>${query.english ? "n resistant / n tested" : "抗藥株數／檢驗數"}: ${row.resistant.toLocaleString("en-US")} / ${row.count.toLocaleString("en-US")}`);
    } };
    const options = {
        ...baseOption(), animation: false,
        title: [{ text: `${report.organism} · ${report.source}`, left: "center", top: 0, textStyle: { fontSize: 13 } },
            { text: query.english ? "Isolate count (n)" : "菌株數（n）", left: 65, top: 40, textStyle: { fontSize: 12 } },
            { text: query.english ? "Resistance trend (%)" : "抗藥性趨勢（%）", left: 65, top: "54%", textStyle: { fontSize: 12 } }],
        tooltip,
        grid: [{ left: 65, right: 25, top: 88, height: "30%" }, { left: 65, right: 25, top: "65%", bottom: 55 }],
        legend: [{ data: report.categories, selected: legendSelection, left: "center", top: 45, bottom: null },
            { data: report.labels, selected: legendSelection, left: "center", top: "59%", bottom: null, textStyle: { fontSize: 11 } }],
        xAxis: [{ type: "category", data: categories, triggerEvent: true, axisTick: { alignWithLabel: true }, axisLabel: { interval: 0, fontSize: 9, lineHeight: 11, rotate: query.english ? 60 : 0, formatter: value => {
            const level = String(value).split("|")[1];
            return query.english ? chartText(level, query) : [...level].join("\n");
        } } },
            { type: "category", gridIndex: 1, data: report.years, triggerEvent: true, name: "年度", nameLocation: "middle", nameGap: 30, boundaryGap: false, axisLabel: { interval: 0, fontSize: 10 } },
            { type: "category", gridIndex: 0, data: report.years.map(String), triggerEvent: true, position: "bottom", offset: query.english ? 90 : 60, boundaryGap: true, axisLine: { show: false }, axisTick: { show: false }, axisLabel: { interval: 0, fontSize: 11, fontWeight: "bold" }, splitLine: { show: false } }],
        yAxis: [{ type: "value", name: "n", min: 0, max: Math.ceil(Math.max(1, ...upperRows.map(row => row.count)) / 1000) * 1000, axisLabel: { fontSize: 10 } },
            { type: "value", gridIndex: 1, name: "抗藥性（%）", nameLocation: "middle", nameGap: 43, min: 0, max: 100, interval: 20, axisLabel: { formatter: value => `${value}%`, fontSize: 10 } }],
        series: report.categories.map((category, index) => ({ name: category, type: "bar", stack: "counts", barMaxWidth: 28,
            itemStyle: { color: index === 0 ? "#93b8d2" : "#365c89" }, emphasis: { focus: "none", itemStyle: { opacity: 1, borderWidth: 0 } },
            data: upperRows.map(row => ({ value: barValue(row, category), row, category, itemStyle: { opacity: !focusedYear || row.year === focusedYear ? 1 : .35, color: index === 0 ? ({ "醫學中心": "#93b8d2", "區域醫院": "#eba67c", "地區醫院": "#b9b9b9", "全國": "#ecd789" }[row.name]) : colors[row.name] } }))
        })).concat(report.labels.map(name => ({ name, type: "line", xAxisIndex: 1, yAxisIndex: 1, symbol: "circle", symbolSize: 7, connectNulls: false,
            itemStyle: { color: colors[name] }, emphasis: { focus: "series" },
            data: report.years.map(year => { const row = report.rows.find(row => row.year === year && row.name === name); return { value: row.value, row, symbolSize: year === focusedYear ? 13 : 7, itemStyle: year === focusedYear ? { borderWidth: 2, borderColor: "#234837" } : undefined }; })
        })))
    };
    return { baseOption: options, media: [{ query: { maxWidth: 650 }, option: {
        title: [{ ...options.title[0], text: `${report.organism}\n${report.source}`, textStyle: { fontSize: 11 } }, { ...options.title[1], left: 55, top: 60, textStyle: { fontSize: 11 } }, { ...options.title[2], left: 55, textStyle: { fontSize: 11 } }],
        grid: [{ left: 55, right: 15, top: 115, height: "25%" }, { left: 55, right: 15, top: "65%", bottom: 55 }],
        legend: [{ ...options.legend[0], top: 85, textStyle: { fontSize: 10 } }, { ...options.legend[1], type: "scroll", left: 8, right: 8, textStyle: { fontSize: 10 } }],
        xAxis: [{ ...options.xAxis[0], axisLabel: { ...options.xAxis[0].axisLabel, fontSize: 8, rotate: query.english ? 90 : 0 } }, options.xAxis[1], { ...options.xAxis[2], offset: query.english ? 90 : 60 }],
        yAxis: [options.yAxis[0], { ...options.yAxis[1], nameGap: 37, nameTextStyle: { fontSize: 10 } }]
    } }, { option: { title: options.title, grid: options.grid, legend: options.legend, xAxis: options.xAxis, yAxis: options.yAxis } }] };
}

function facetOptions(query, report) {
    const categories = query.filters.source === "全部（CO+HO）" ? ["CO", "HO"] : ["S", "I+R"];
    const facetWidth = 96 / report.labels.length;
    const grids = report.labels.map((_, index) => ({ left: `${3 + index * facetWidth}%`, width: `${facetWidth - 3}%`, top: 65, height: "33%", containLabel: true }));
    grids.push({ left: 55, right: 25, top: "58%", bottom: 85, containLabel: true });
    const series = report.labels.flatMap((level, index) => categories.map((category, categoryIndex) => ({ name: category, type: "bar", xAxisIndex: index, yAxisIndex: index, stack: level, itemStyle: { color: categoryIndex === 0 ? "#70a9bb" : "#d89867" }, emphasis: { focus: "series" }, data: report.years.map(year => { const row = report.rows.find(row => row.name === level && row.year === year); const first = Math.round(row.count * row.share); return categoryIndex === 0 ? first : row.count - first; }) })));
    const trendIndex = report.labels.length;
    series.push(...report.labels.map((level, index) => ({ name: level, type: "line", xAxisIndex: trendIndex, yAxisIndex: trendIndex, itemStyle: { color: palette[index] }, data: report.years.map(year => report.rows.find(row => row.name === level && row.year === year).value), emphasis: { focus: "series" } })));
    return { ...baseOption(), graphic: report.labels.map((name, index) => ({ type: "text", left: `${7 + index * facetWidth}%`, top: 20, style: { text: name, fill: "#334653", fontSize: 12 } })), grid: grids, xAxis: grids.map((_, index) => ({ type: "category", gridIndex: index, data: report.years, axisLabel: { interval: 0, rotate: index < trendIndex ? 60 : 0, fontSize: 10 } })), yAxis: grids.map((_, index) => ({ type: "value", gridIndex: index, name: index === trendIndex ? "抗藥性（%）" : "n", max: index === trendIndex ? 100 : undefined, interval: index === trendIndex ? 10 : undefined })), series };
}

function mdroYearBand(chart, report, year) {
    if (!report.years.includes(year)) return [];
    const positions = report.years.map(value => chart.convertToPixel({ xAxisIndex: 1 }, String(value)));
    const center = positions[report.years.indexOf(year)];
    const width = positions.length > 1 ? Math.min(36, Math.abs(positions[1] - positions[0]) * .5) : 30;
    const top = chart.convertToPixel({ yAxisIndex: 1 }, 100);
    const bottom = chart.convertToPixel({ yAxisIndex: 1 }, 0);
    return [{ id: "mdro-year-band", type: "rect", silent: true, z: 0, shape: { x: center - width / 2, y: top, width, height: bottom - top }, style: { fill: "#69a478", opacity: .2 } }];
}

export function mdroExportRows(report, selected = {}) {
    const facets = report.labels.filter(name => name !== "全國");
    if (!facets.length && report.labels.includes("全國")) facets.push("全國");
    return report.rows.flatMap(row => [
        ...(facets.includes(row.name) ? report.categories.filter(category => selected[category] !== false).map(category => ({ ...row, panel: "count", category, unit: "n", value: category === "CO" ? row.co : category === "HO" ? row.ho : category === "S" ? row.susceptible : row.nonsusceptible })) : []),
        ...(selected[row.name] !== false ? [{ ...row, panel: "resistance", category: "R", unit: "%" }] : [])
    ]);
}

export async function exportChart(host, format) {
    const state = instances.get(host);
    if (!state) return;
    if (format === "csv") {
        const filters = Object.entries(state.query.filters ?? {}).map(([key, value]) => `${key}: ${chartText(value, state.query)}`).join("; ");
        const visibleRows = state.report.kind === "mdro-facets" ? mdroExportRows(state.report, state.legendSelected) : state.report.rows.filter(row => state.legendSelected[row.name] !== false && state.legendSelected[row.antibiotic] !== false && (!state.focusRegion || row.name === state.focusRegion));
        const keys = Array.from(new Set(visibleRows.flatMap(row => Object.keys(row))));
        const rows = [[chartText("資料性質", state.query), chartText("篩選條件", state.query), ...keys], ...visibleRows.map(row => [chartText("示意資料，非官方統計", state.query), filters, ...keys.map(key => chartText(row[key] ?? "", state.query))])];
        const csv = "\uFEFF" + rows.map(row => row.map(value => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\r\n");
        download(new Blob([csv], { type: "text/csv;charset=utf-8" }), `DEMO-${state.query.family}-${state.query.topic}.csv`);
        return;
    }
    const svgUrl = state.chart.getDataURL({ type: "svg", backgroundColor: "#fff" });
    if (format === "png") {
        const image = new Image();
        image.src = svgUrl;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = state.chart.getWidth() * 2;
        canvas.height = state.chart.getHeight() * 2;
        const context = canvas.getContext("2d");
        context.fillStyle = "#fff";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/png"));
        if (blob) download(blob, `DEMO-${state.query.family}-${state.query.topic}.png`);
        return;
    }
    const link = document.createElement("a");
    link.href = svgUrl;
    link.download = `DEMO-${state.query.family}-${state.query.topic}.${format}`;
    link.click();
}

export function dispose(host) {
    const state = instances.get(host);
    if (!state) return;
    state.observer.disconnect();
    state.chart.dispose();
    instances.delete(host);
}

function download(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const animalReference = [
    {
        Ceftiofur: [[24,18,18,20,4,2,5,9,5,11,10,12,16], [23,32,26,42,16,8,12,16,11,8,8,17,17]],
        Amoxicillin: [[87,85,87,84,87,82,82,83,85,86,85,88,91], [98,98,97,96,94,88,91,90,95,93,95,96,99]],
        Enrofloxacin: [[7,7,7,6,4,3,3,4,3,3,2,3,1], [22,15,43,29,5,8,8,9,13,12,11,10,10]],
        Oxytetracycline: [[94,96,94,97,89,89,88,91,88,88,90,88,93], [99,100,98,100,100,96,96,96,94,93,97,97,100]]
    },
    {
        Amoxicillin: [[3,17,4,1,13,8,13,17,3,4,8,12,23], [4,35,3,1,14,7,8,8,3,6,6,17,27]],
        Ceftiofur: [[96,95,100,97,93,98,97,96,96,94,94,98,98], [98,100,99,100,98,100,100,98,100,94,100,99,100]],
        Enrofloxacin: [[5,5,8,4,4,4,4,5,4,4,4,4,5], [6,5,10,3,5,3,3,2,5,5,4,4,5]],
        Oxytetracycline: [[91,94,88,89,93,90,90,88,86,86,90,93,96], [98,96,100,100,99,96,97,97,99,96,99,99,100]],
        Tylosin: [[68,65,67,71,55,73,76,79,75,72,76,85,94], [97,96,97,98,84,95,96,96,98,92,97,99,99]],
        Vancomycin: [[1,1,2,1,1,1,1,1,1,1,1,1,1], [2,1,2,1,1,1,1,1,1,1,1,1,1]]
    }
];

function animalReportData(query) {
    const years = Array.from({ length: query.end - query.start + 1 }, (_, index) => query.start + index);
    const reference = animalReference[query.organism];
    return {
        kind: "one-health-animal", years, labels: Object.keys(reference),
        rows: ["豬", "雞"].flatMap((animal, animalIndex) => Object.entries(reference).flatMap(([name, values]) => years.map(year => ({ year, animal, name, value: values[animalIndex][year - 101] }))))
    };
}

function animalOptions(report) {
    const colors = { Ceftiofur: "#9174b2", Amoxicillin: "#49a65b", Enrofloxacin: "#c77bb7", Oxytetracycline: "#25549c", Tylosin: "#303030", Vancomycin: "#f36b9c" };
    const symbols = { Ceftiofur: "triangle", Amoxicillin: "diamond", Enrofloxacin: "triangle", Oxytetracycline: "circle", Tylosin: "rect", Vancomycin: "rect" };
    const grids = [{ left: 55, right: "54%", top: 60, bottom: 110 }, { left: "58%", right: 40, top: 60, bottom: 110 }];
    const titles = [{ text: "家畜（豬）", left: 55, top: 12, backgroundColor: "#d9efed", padding: [8, 14] }, { text: "家禽（雞）", left: "58%", top: 12, backgroundColor: "#e1efd8", padding: [8, 14] }];
    const axes = report.years.map(String);
    return {
        baseOption: {
            ...baseOption(), title: titles, grid: grids,
            legend: { data: report.labels, bottom: 12, left: "center", type: "plain", textStyle: { fontSize: 11 } },
            tooltip: { trigger: "axis", confine: true, formatter: params => `民國 ${params[0].axisValue} 年 · ${params[0].data.animal}<br>` + params.map(param => `${param.marker}${param.seriesName}：${param.value.toFixed(1)}%`).join("<br>") },
            xAxis: grids.map((_, index) => ({ type: "category", gridIndex: index, data: axes, boundaryGap: false, name: "（年）", nameGap: 8, axisLabel: { interval: 0, fontSize: 10 }, axisTick: { show: false } })),
            yAxis: grids.map((_, index) => ({ type: "value", gridIndex: index, min: 0, max: 100, interval: 20, name: "抗藥性（%）", nameLocation: "middle", nameGap: 35, nameTextStyle: { fontSize: 11 }, splitLine: { show: false } })),
            series: ["豬", "雞"].flatMap((animal, animalIndex) => report.labels.map(name => ({ name, type: "line", xAxisIndex: animalIndex, yAxisIndex: animalIndex, symbol: symbols[name], symbolSize: 5, lineStyle: { width: 1.5 }, itemStyle: { color: colors[name] }, emphasis: { focus: "series" }, data: report.years.map(year => { const row = report.rows.find(row => row.animal === animal && row.name === name && row.year === year); return { value: row.value, animal }; }) })))
        },
        media: [
            { query: { maxWidth: 650 }, option: { title: [{ left: 50, top: 8 }, { left: 50, top: "48%" }], grid: [{ left: 50, right: 40, top: 60, height: "28%", bottom: "auto" }, { left: 50, right: 40, top: "58%", height: "28%", bottom: "auto" }], legend: { bottom: 0, itemGap: 8, textStyle: { fontSize: 10 } }, xAxis: [{ axisLabel: { interval: 0, rotate: 45 } }, { axisLabel: { interval: 0, rotate: 45 } }] } },
            { option: { title: titles, grid: grids, xAxis: [{ axisLabel: { rotate: 0 } }, { axisLabel: { rotate: 0 } }] } }
        ]
    };
}

function qualityOptions(query, report) {
    const colors = ["#5782c3", "#bd504c", "#94b950"];
    const symbols = ["diamond", "rect", "triangle"];
    const options = {
        ...baseOption(),
        grid: { left: 75, right: query.levels ? 160 : 45, top: 45, bottom: 65, containLabel: true },
        legend: query.levels ? { orient: "vertical", right: 0, top: "middle" } : { show: false },
        xAxis: { type: "category", data: report.years.map(year => `${year}年`), boundaryGap: true, axisTick: { show: false }, axisLabel: { interval: 0 } },
        yAxis: { type: "value", min: query.primaryCare ? .5 : 3, max: query.primaryCare ? .7 : query.levels ? 7.5 : 7, interval: query.primaryCare ? .05 : query.levels ? .5 : 1, axisLabel: { formatter: value => `${value.toFixed(2)}%` }, splitLine: { lineStyle: { color: "#b5b5b5" } } },
        tooltip: { trigger: "axis", confine: true, formatter: params => `${params[0].name}<br>` + params.map(param => `${param.marker}${param.seriesName}：${Number(param.value).toFixed(2)}%`).join("<br>") },
        series: report.labels.map((name, index) => ({ name, type: "line", symbol: symbols[index], symbolSize: 8, lineStyle: { width: 2 }, itemStyle: { color: colors[index] }, label: { show: !query.levels, position: "top", formatter: params => `${Number(params.value).toFixed(2)}%` }, data: report.years.map(year => report.rows.find(row => row.year === year && row.name === name).value) }))
    };
    return { baseOption: options, media: [
        { query: { maxWidth: 600 }, option: { grid: { left: 20, right: 20, bottom: query.levels ? 85 : 55 }, legend: query.levels ? { orient: "horizontal", left: "center", right: "auto", top: "auto", bottom: 8 } : { show: false } } },
        { option: { grid: options.grid, legend: options.legend } }
    ] };
}

function horizontalOptions(report) {
    return { ...baseOption(), legend: { show: false }, grid: { left: 200, right: 45, top: 30, bottom: 40 }, tooltip: { trigger: "axis", confine: true }, xAxis: { type: "value", name: report.unit, min: 0, max: report.unit === "%" ? 100 : undefined, interval: report.unit === "%" ? 10 : undefined }, yAxis: { type: "category", data: report.labels, inverse: true }, series: [{ type: "bar", label: { show: true, position: "right", formatter: `{c} ${report.unit}` }, data: report.rows.map((row, index) => ({ value: row.value, itemStyle: { color: color(row.name, index) } })) }] };
}