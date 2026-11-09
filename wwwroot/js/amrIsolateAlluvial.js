import { loadD3 } from "./amrConsumptionChart.js";

export async function renderIsolateAlluvial(host, query, report, translate) {
    const d3 = await loadD3();
    host.replaceChildren();
    const viewport = document.createElement("div");
    viewport.style.cssText = "width:100%;height:100%;overflow-x:auto;overflow-y:hidden;";
    host.append(viewport);
    let width, height, svg;

    function draw() {
        viewport.replaceChildren();
        width = Math.max(host.clientWidth, (report.years.length - 1) * 134 + 100, 520);
        height = Math.max(host.clientHeight, 480);
        const margin = { left: 75, right: 25, top: 95, bottom: 65 };
        const plotHeight = height - margin.top - margin.bottom;
        const maximum = Math.max(1, ...report.years.map(year => report.rows.filter(row => row.year === year).reduce((sum, row) => sum + row.value, 0)));
        const x = d3.scalePoint().domain(report.years).range([margin.left, width - margin.right]);
        const y = d3.scaleLinear().domain([0, maximum]).range([height - margin.bottom, margin.top]);
        const segments = [];
        for (const year of report.years) {
            let low = 0;
            const rankedRows = report.rows.filter(row => row.year === year)
                .sort((left, right) => (right.rank ?? Infinity) - (left.rank ?? Infinity));
            for (const row of rankedRows) {
                segments.push({ row, low, high: low + row.value });
                low += row.value;
            }
        }
        svg = d3.select(viewport).append("svg").attr("xmlns", "http://www.w3.org/2000/svg")
            .attr("width", width).attr("height", height).attr("viewBox", `0 0 ${width} ${height}`)
            .style("font-family", "Noto Sans TC, sans-serif").attr("role", "group").attr("aria-label", translate("臨床分離菌株數監測", query));
        svg.append("rect").attr("width", width).attr("height", height).attr("fill", "#fff");
        const bands = svg.append("g");
        const area = d3.area().x(segment => x(segment.row.year)).y0(segment => y(segment.low)).y1(segment => y(segment.high)).curve(d3.curveBumpX);
        bands.selectAll("path").data(report.labels).join("path").attr("class", "amr-isolate-ribbon")
            .attr("data-organism", name => name).attr("d", name => area(segments.filter(segment => segment.row.name === name)))
            .attr("fill", name => report.colors[name]).attr("opacity", .55);
        const nodes = svg.append("g").selectAll("rect").data(segments).join("rect")
            .attr("class", "amr-isolate-node").attr("data-organism", segment => segment.row.name)
            .attr("x", segment => x(segment.row.year) - 5).attr("y", segment => y(segment.high))
            .attr("width", 10).attr("height", segment => Math.max(0, y(segment.low) - y(segment.high)))
            .attr("fill", segment => report.colors[segment.row.name]).attr("tabindex", 0).attr("role", "img")
            .attr("aria-label", segment => `${segment.row.year} ${segment.row.name}: ${segment.row.value}`);
        for (const year of report.years) {
            svg.append("text").attr("x", x(year)).attr("y", 30).attr("text-anchor", "middle")
                .attr("font-size", 11).attr("fill", "#52636f").text(`${report.annualTotals[year].toLocaleString("en-US")} ${query.english ? "isolates" : "株"}`);
            svg.append("text").attr("x", x(year)).attr("y", height - 42).attr("text-anchor", "middle").attr("font-size", 12).text(year);
        }
        svg.append("text").attr("x", width - 8).attr("y", 50).attr("text-anchor", "end").attr("font-size", 11).text(query.english ? "Total isolates" : "總數");
        svg.append("text").attr("x", (margin.left + width - margin.right) / 2).attr("y", height - 12)
            .attr("text-anchor", "middle").attr("font-size", 12).text(query.english ? "Year" : "年份");
        svg.append("text").attr("transform", `translate(22,${margin.top + plotHeight / 2}) rotate(-90)`)
            .attr("text-anchor", "middle").attr("font-size", 12).text(query.english ? "Isolate count" : "菌株數");
        const labels = svg.append("g");
        let previousLabel = -Infinity;
        const labelPositions = segments.filter(segment => segment.row.year === report.years.at(-1)).reverse().map(segment => {
            const center = (y(segment.low) + y(segment.high)) / 2;
            const labelY = Math.max(center, previousLabel + 20);
            previousLabel = labelY;
            return { segment, center, labelY };
        });
        let nextLabel = height - margin.bottom + 6;
        for (const position of [...labelPositions].reverse()) {
            position.labelY = Math.min(position.labelY, nextLabel - 20);
            nextLabel = position.labelY;
        }
        for (const { segment, center, labelY } of labelPositions) {
            const lastX = x(segment.row.year);
            labels.append("path").attr("d", `M${lastX - 6},${center} H${lastX - 18} L${lastX - 29},${labelY}`)
                .attr("fill", "none").attr("stroke", "#52636f").attr("stroke-width", 1).attr("data-organism", segment.row.name);
            labels.append("text").attr("x", lastX - 32).attr("y", labelY + 3).attr("text-anchor", "end")
                .attr("font-size", 12).attr("font-weight", 500).attr("fill", "#000").attr("data-organism", segment.row.name).text(segment.row.name);
        }
        const annotations = svg.append("g").attr("pointer-events", "none");
        function focus(name) {
            bands.selectAll("path").attr("opacity", candidate => !name ? .55 : candidate === name ? .85 : .09);
            nodes.attr("opacity", segment => !name || segment.row.name === name ? 1 : .14);
            labels.selectAll("[data-organism]").attr("opacity", function () { return !name || this.getAttribute("data-organism") === name ? 1 : .2; });
            annotations.selectAll("*").remove();
            if (!name) return;
            for (const segment of segments.filter(candidate => candidate.row.name === name)) {
                const row = segment.row;
                const left = x(row.year) - 67;
                const top = Math.max(45, y(segment.high) - 67);
                const group = annotations.append("g").attr("class", "amr-isolate-tooltip").attr("transform", `translate(${left},${top})`);
                group.append("rect").attr("width", 134).attr("height", 61).attr("rx", 4).attr("fill", "#fff1e8").attr("stroke", "#d3bba7");
                const texts = [`${row.year} · ${query.english ? "Rank" : "排名"}: ${row.rank ?? "Other"}`,
                    `${query.english ? "Isolates" : "菌株數"}: ${row.value.toLocaleString("en-US")}`,
                    `${query.english ? "Share" : "百分比"}: ${row.percent.toFixed(2)}%`];
                texts.forEach((text, index) => group.append("text").attr("x", 7).attr("y", 15 + index * 17).attr("font-size", 10).attr("fill", "#334653").text(text));
            }
        }
        bands.selectAll("path").on("pointerenter", (_, name) => focus(name)).on("pointerleave", () => focus(null));
        nodes.on("pointerenter focus", (_, segment) => focus(segment.row.name)).on("pointerleave blur", () => focus(null))
            .on("keydown", event => { if (event.key === "Escape") focus(null); });
    }
    draw();
    return {
        resize: draw,
        dispose: () => host.replaceChildren(),
        getWidth: () => width,
        getHeight: () => height,
        getDataURL: () => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(svg.node()))}`
    };
}