let enginePromise;

export async function loadD3() {
    if (globalThis.d3) return globalThis.d3;
    enginePromise ??= new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = new URL("../lib/d3/d3.min.js", import.meta.url).href;
        script.onload = () => resolve(globalThis.d3);
        script.onerror = () => { enginePromise = undefined; reject(new Error("Unable to load D3")); };
        document.head.append(script);
    });
    return enginePromise;
}

export function contrastText(background) {
    const rgb = background.replace("#", "").match(/.{2}/g).map(value => parseInt(value, 16) / 255);
    const luminance = rgb.map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4)
        .reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0);
    return (luminance + .05) / .05 >= 1.05 / (luminance + .05) ? "#000000" : "#ffffff";
}

export async function renderConsumption(host, query, report, buildLayout, colors, translate, selectionChanged) {
    const d3 = await loadD3();
    const selected = {};
    let focused = null;
    let chartWidth = 0;
    let chartHeight = 0;
    host.replaceChildren();
    const viewport = document.createElement("div");
    viewport.style.cssText = "width:100%;height:100%;overflow-x:auto;overflow-y:hidden;position:relative;";
    host.append(viewport);
    const tooltip = document.createElement("div");
    tooltip.style.cssText = "position:fixed;display:none;pointer-events:none;z-index:1500;background:#fff;border:1px solid #7899a8;padding:10px;box-shadow:0 2px 6px #0002;font:12px Noto Sans TC,sans-serif;max-width:280px;";
    host.append(tooltip);

    function focus(name) {
        focused = focused === name ? null : name;
        report.labels.forEach(label => { selected[label] = !focused || label === focused; });
        selectionChanged({ ...selected });
        draw();
    }

    function showTooltip(event, row) {
        tooltip.replaceChildren();
        for (const text of [
            `${row.year} · ${row.atc}`,
            translate(row.name, query),
            `${translate(row.route, query)} · ${translate(row.visit, query)}`,
            `${translate(row.region, query)} · ${translate(row.level, query)}`,
            `${row.unit}: ${row.value.toFixed(1)}`
        ]) {
            const line = document.createElement("div");
            line.textContent = text;
            tooltip.append(line);
        }
        tooltip.style.display = "block";
        const bounds = tooltip.getBoundingClientRect();
        tooltip.style.left = `${Math.max(8, Math.min(event.clientX + 15, innerWidth - bounds.width - 8))}px`;
        tooltip.style.top = `${Math.max(8, Math.min(event.clientY + 15, innerHeight - bounds.height - 8))}px`;
    }

    function draw() {
        tooltip.style.display = "none";
        viewport.replaceChildren();
        chartWidth = Math.max(740, host.clientWidth, report.years.length * (report.unit === "DDD" ? 115 : 65) + 125);
        chartHeight = Math.max(480, host.clientHeight);
        const margin = { left: report.unit === "DDD" ? 100 : 65, right: 25, top: 55, bottom: 130 };
        const innerWidth = chartWidth - margin.left - margin.right;
        const innerHeight = chartHeight - margin.top - margin.bottom;
        const layout = buildLayout(report, selected);
        const x = d3.scalePoint().domain(report.years).range([8, innerWidth - 8]);
        const y = d3.scaleLinear().domain([0, layout.maximum || 1]).nice(5).range([innerHeight, 0]);
        const svg = d3.select(viewport).append("svg")
            .attr("xmlns", "http://www.w3.org/2000/svg")
            .attr("width", chartWidth).attr("height", chartHeight)
            .attr("viewBox", `0 0 ${chartWidth} ${chartHeight}`)
            .style("background", "#fff")
            .style("font-family", "Noto Sans TC, sans-serif");
        svg.append("rect").attr("width", chartWidth).attr("height", chartHeight).attr("fill", "#fff");
        svg.append("text").attr("x", chartWidth / 2).attr("y", 18)
            .attr("text-anchor", "middle").attr("font-size", 13)
            .attr("fill", "#334653").text(`${query.filters.atc} · ${report.unit} (${query.start}-${query.end})`);
        const plot = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);
        const yAxis = plot.append("g").call(d3.axisLeft(y).ticks(5).tickFormat(d3.format(".1f")).tickSize(-innerWidth));
        yAxis.selectAll("line").attr("stroke", "#e1e5e8");
        yAxis.select(".domain").attr("stroke", "#7d7d7d");
        yAxis.selectAll("text").attr("font-size", 11).attr("fill", "#334653");
        svg.append("text").attr("transform", `translate(18,${margin.top + innerHeight / 2}) rotate(-90)`)
            .attr("text-anchor", "middle").attr("font-size", 12).text(report.unit);
        const xAxis = plot.append("g").attr("transform", `translate(0,${innerHeight + 8})`)
            .call(d3.axisBottom(x).tickSize(4).tickPadding(8));
        xAxis.select(".domain").attr("stroke", "#7d7d7d");
        xAxis.selectAll("text").attr("font-size", 10).attr("fill", "#334653");
        for (const year of report.years) {
            const total = layout.segments.filter(segment => segment.row.year === year).reduce((sum, segment) => sum + segment.row.value, 0);
            plot.append("text").attr("x", x(year)).attr("y", -12)
                .attr("text-anchor", "middle").attr("font-size", 10)
                .attr("font-weight", 600).text(`${total.toFixed(1)} ${report.unit}`);
        }
        const area = d3.area().curve(d3.curveBumpX)
            .x(segment => x(segment.row.year))
            .y0(segment => y(segment.low)).y1(segment => y(segment.high));
        const names = report.labels.filter(name => selected[name] !== false);
        plot.append("g").selectAll("path").data(names).join("path")
            .attr("class", "amr-consumption-ribbon")
            .attr("data-drug", name => name)
            .attr("d", name => area(layout.segments.filter(segment => segment.row.name === name)))
            .attr("fill", name => colors[name]).attr("opacity", .2)
            .attr("stroke", "#f8f8f8").style("cursor", "pointer")
            .on("click", (_, name) => focus(name))
            .on("pointermove", (event, name) => {
                const position = d3.pointer(event, plot.node())[0];
                const year = report.years.reduce((closest, candidate) => Math.abs(x(candidate) - position) < Math.abs(x(closest) - position) ? candidate : closest);
                showTooltip(event, report.rows.find(row => row.year === year && row.name === name));
            }).on("pointerleave", () => { tooltip.style.display = "none"; });
        plot.append("g").selectAll("rect").data(layout.segments).join("rect")
            .attr("class", "amr-consumption-bar")
            .attr("data-drug", segment => segment.row.name)
            .attr("data-year", segment => segment.row.year)
            .attr("x", segment => x(segment.row.year) - 8)
            .attr("y", segment => y(segment.high))
            .attr("width", 16).attr("height", segment => y(segment.low) - y(segment.high))
            .attr("fill", segment => colors[segment.row.name]).attr("stroke", "#f8f8f8")
            .style("cursor", "pointer")
            .on("click", (_, segment) => focus(segment.row.name))
            .on("pointermove", (event, segment) => showTooltip(event, segment.row))
            .on("pointerleave", () => { tooltip.style.display = "none"; });
        const firstYear = layout.segments.filter(segment => segment.yearIndex === 0 && y(segment.low) - y(segment.high) > 15);
        plot.append("g").selectAll("text").data(firstYear).join("text")
            .attr("class", "amr-consumption-label")
            .attr("x", x(report.years[0]) + 16)
            .attr("y", segment => (y(segment.low) + y(segment.high)) / 2)
            .attr("dominant-baseline", "middle").attr("font-size", 11)
            .attr("fill", "#111").style("pointer-events", "none")
            .text(segment => segment.row.name === "Other" ? query.english ? "Other non-top-10 antimicrobials" : "其他非前十名抗生素" : segment.row.name);
        let legendX = margin.left;
        let legendY = chartHeight - 85;
        for (const name of report.labels) {
            const label = translate(name, query);
            const width = Math.min(260, label.length * 6 + 30);
            if (legendX + width > chartWidth - 20) { legendX = margin.left; legendY += 23; }
            const legend = svg.append("g").attr("class", "amr-consumption-legend")
                .attr("data-drug", name).attr("transform", `translate(${legendX},${legendY})`)
                .attr("role", "button").attr("tabindex", 0)
                .attr("aria-label", label).attr("aria-pressed", selected[name] !== false ? "true" : "false")
                .style("cursor", "pointer").attr("opacity", selected[name] === false ? .35 : 1);
            const toggle = () => {
                const restoreFocus = document.activeElement === legend.node();
                selected[name] = selected[name] === false;
                focused = null;
                selectionChanged({ ...selected });
                draw();
                if (restoreFocus) [...viewport.querySelectorAll(".amr-consumption-legend")].find(node => node.dataset.drug === name)?.focus();
            };
            legend.on("click", toggle).on("keydown", event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); toggle(); } });
            legend.append("title").text(label);
            legend.append("rect").attr("width", 12).attr("height", 12).attr("fill", colors[name]);
            legend.append("text").attr("x", 17).attr("y", 10).attr("font-size", 10)
                .attr("fill", "#334653").text(label.length > 37 ? `${label.slice(0, 34)}...` : label);
            legendX += width;
        }
    }

    draw();
    return {
        resize: draw,
        focus,
        toggleSelection: name => { selected[name] = selected[name] === false; focused = null; selectionChanged({ ...selected }); draw(); },
        dispose: () => host.replaceChildren(),
        getWidth: () => chartWidth,
        getHeight: () => chartHeight,
        getDataURL: () => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(viewport.querySelector("svg")))}`
    };
}