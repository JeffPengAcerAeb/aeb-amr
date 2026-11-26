const reports = new Map();

async function readJson(file, source = "amr-preview") {
    if (source !== "amr-preview" && source !== "amr-one") throw new Error("Unknown AMR site source");
    const url = new URL(`../data/${source}/${file}.json`, import.meta.url);
    const response = await fetch(url, { cache: "no-store", headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`Unable to load ${url.pathname}: HTTP ${response.status}`);
    const data = await response.json();
    if (!data || typeof data !== "object") throw new Error(`Invalid JSON dataset: ${file}`);
    return data;
}

export async function loadSite(source = "amr-preview") {
    const data = await readJson("site", source);
    if (data.SchemaVersion !== 1) throw new Error("Unsupported AMR site JSON schema");
    return data;
}

export function reportKey(query) {
    const selectors = { ...query.filters };
    if (query.family === "au" && query.topic === 0) selectors.metric = query.metric ?? "DID";
    if (query.family === "ar" && query.topic === 1) selectors.year = query.start;
    if (query.family === "one-health-animal") selectors.organism = query.organism;
    return JSON.stringify(Object.entries(selectors).sort(([a], [b]) => a.localeCompare(b, "en")));
}

export function selectReport(dataset, query) {
    if (dataset.schemaVersion !== 1 || !dataset.reports) throw new Error("Invalid AMR report JSON schema");
    const entry = dataset.reports[reportKey(query)];
    if (!entry || !Array.isArray(entry.rowColumns) || !Array.isArray(entry.values) || !Array.isArray(entry.years))
        throw new Error(`No JSON report for ${query.family}/${query.topic ?? query.organism}: ${reportKey(query)}`);
    const { rowDefaults, rowColumns, values, ...metadata } = entry;
    const years = query.family === "ar" && query.topic === 3 && query.years?.length
        ? [...new Set(query.years)].sort((a, b) => a - b)
        : Array.from({ length: query.end - query.start + 1 }, (_, index) => query.start + index);
    if (years.some(year => !entry.years.includes(year))) throw new Error("Requested years are not available in the JSON report");
    const report = { ...metadata, years, rows: values.map(values => {
        if (!Array.isArray(values) || values.length !== rowColumns.length) throw new Error("Invalid JSON report row");
        return { ...rowDefaults, ...Object.fromEntries(rowColumns.map((key, index) => [key, values[index]])) };
    }).filter(row => years.includes(row.year)) };
    if (report.kind === "isolate-alluvial") {
        report.labels = report.labels.filter(name => !(query.hidden ?? []).includes(name));
        report.rows = report.rows.filter(row => report.labels.includes(row.name));
        report.annualTotals = Object.fromEntries(years.map(year => [year, report.annualTotals[year]]));
    }
    if (report.kind === "mdro-facets") {
        report.labels = report.labels.filter(name => (query.levels ?? report.labels).includes(name));
        report.rows = report.rows.filter(row => report.labels.includes(row.name));
    }
    if (report.kind === "organism-trend") {
        report.labels = [...new Set(report.rows.map(row => row.name))].sort((a, b) => {
            const rank = name => report.rows.find(row => row.year === query.end && row.name === name)?.rank ?? Infinity;
            return rank(a) - rank(b) || a.localeCompare(b);
        });
    }
    if (report.kind === "one-health-animal" && query.animal !== undefined) {
        if (query.animal !== "豬" && query.animal !== "雞") throw new Error("Unknown animal selection");
        report.animals = [query.animal];
        report.rows = report.rows.filter(row => row.animal === query.animal);
    }
    return report;
}

export async function loadReport(query) {
    const file = query.family === "one-health-animal" ? query.family
        : `${query.family}-${query.topic}${query.family === "au" && query.topic === 0 ? "-" + query.filters.atc : ""}`;
    if (!/^(amr-[0-3]|ar-[0-3]|au-[12]|au-0-(J01|A07AA|P01AB|J02|D01B)|one-health-animal)$/.test(file))
        throw new Error(`Unknown AMR JSON report: ${file}`);
    let pending = reports.get(file);
    if (!pending) {
        pending = readJson(file).catch(error => { reports.delete(file); throw error; });
        reports.set(file, pending);
    }
    return selectReport(await pending, query);
}
