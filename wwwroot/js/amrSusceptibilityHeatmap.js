import { loadD3, contrastText } from "./amrConsumptionChart.js";

export const susceptibilityColors = ["#9e0522", "#c22a26", "#cc4f25", "#d67324", "#e09823", "#eabc22", "#f5e121", "#b8c924", "#7cb228", "#409b2b", "#04842f", "#004b23"];
export const susceptibilityThresholds = [50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 99.01];

export function susceptibilityLabel(row) {
    if (row.status === "intrinsic") return "-";
    if (!Number.isFinite(row.value)) return "";
    if (row.value === 100) return "100";
    if (row.value > 99) return ">99";
    if (row.value > 0 && row.value < 1) return "<1";
    return String(Math.round(row.value));
}

export async function renderSusceptibilityHeatmap(host, query, report, translate) {
    const d3 = await loadD3();
    const text = (chinese, english) => query.english ? english : chinese;
    const originalHeight = host.style.height;
    host.replaceChildren();
    const viewport = document.createElement("div");
    viewport.style.cssText = "width:100%;height:100%;overflow-x:auto;overflow-y:hidden;";
    host.append(viewport);
    const tooltip = document.createElement("div");
    tooltip.setAttribute("role", "tooltip");
    tooltip.className = "amr-susceptibility-tooltip";
    tooltip.style.cssText = "position:fixed;display:none;pointer-events:none;z-index:1500;background:#fff;border:1px solid #8a969c;padding:10px;box-shadow:0 2px 6px #0002;font:12px Noto Sans TC,sans-serif;max-width:310px;";
    host.append(tooltip);
    const color = d3.scaleThreshold().domain(susceptibilityThresholds).range(susceptibilityColors);
    let width, height, svg;

    function hide() { tooltip.style.display = "none"; }

    function show(event, row, element) {
        tooltip.replaceChildren();
        for (const line of [
            `${row.year} · ${translate(row.level, query)}`,
            `${text("菌株名", "Organism")}: ${row.name}`,
            `${text("抗生素", "Antibiotic")}: ${row.antibiotic}`,
            `${text("檢驗數", "n tested")}: ${row.tested === null ? "N/A" : row.tested.toLocaleString("en-US")}`,
            `${text("敏感株數", "n susceptible")}: ${row.susceptible === null ? "N/A" : row.susceptible.toLocaleString("en-US")}`,
            row.status === "intrinsic" ? text("本質抗藥性", "Intrinsically resistant") : row.value === null ? text("未測試／未報告", "Not tested/reported") : `${text("敏感性", "Susceptibility")}: ${row.value.toFixed(2)}%`
        ]) {
            const node = document.createElement("div");
            node.textContent = line;
            tooltip.append(node);
        }
        tooltip.style.display = "block";
        const bounds = element.getBoundingClientRect(), size = tooltip.getBoundingClientRect();
        const left = Number.isFinite(event.clientX) && event.type !== "focus" ? event.clientX : bounds.right;
        const top = Number.isFinite(event.clientY) && event.type !== "focus" ? event.clientY : bounds.top;
        tooltip.style.left = `${Math.max(8, Math.min(left + 12, innerWidth - size.width - 8))}px`;
        tooltip.style.top = `${Math.max(8, Math.min(top + 12, innerHeight - size.height - 8))}px`;
    }

    function draw() {
        hide();
        viewport.replaceChildren();
        const margin = { left: 220, top: 190, right: 80 };
        const cellWidth = Math.max(28, Math.min(36, (host.clientWidth - margin.left - margin.right) / report.columns.length));
        const cellHeight = 30, groupHeight = 30;
        const positions = new Map(), headers = [];
        let cursor = margin.top;
        for (const [group, names] of report.groups) {
            headers.push({ group, top: cursor });
            cursor += groupHeight;
            for (const name of names) { positions.set(name, cursor); cursor += cellHeight; }
        }
        width = Math.max(host.clientWidth, margin.left + report.columns.length * cellWidth + margin.right);
        height = Math.max(480, cursor + 115);
        host.style.height = `${height}px`;
        svg = d3.select(viewport).append("svg").attr("xmlns", "http://www.w3.org/2000/svg")
            .attr("width", width).attr("height", height).attr("viewBox", `0 0 ${width} ${height}`)
            .style("font-family", "Noto Sans TC, sans-serif").attr("role", "group").attr("aria-label", translate("臨床分離菌株敏感性圖譜分析", query));
        svg.append("rect").attr("width", width).attr("height", height).attr("fill", "#fff");
        report.columns.forEach((antibiotic, index) => svg.append("text")
            .attr("transform", `translate(${margin.left + index * cellWidth + 20},${margin.top - 8}) rotate(-60)`)
            .attr("font-size", 11).attr("fill", "#263b45").text(antibiotic));
        headers.forEach(header => svg.append("text").attr("class", "amr-susceptibility-group")
            .attr("x", 12).attr("y", header.top + 21).attr("font-size", 13).attr("font-weight", 700).text(header.group));
        for (const name of report.labels) svg.append("text").attr("x", margin.left - 8).attr("y", positions.get(name) + 20)
            .attr("text-anchor", "end").attr("font-size", 13).attr("font-style", "italic").text(name);
        const cells = svg.append("g").selectAll("g").data(report.rows).join("g").attr("class", "amr-susceptibility-cell")
            .attr("data-organism", row => row.name).attr("data-antibiotic", row => row.antibiotic);
        cells.append("rect").attr("x", row => margin.left + report.columns.indexOf(row.antibiotic) * cellWidth)
            .attr("y", row => positions.get(row.name)).attr("width", cellWidth - 2).attr("height", cellHeight - 2)
            .attr("fill", row => row.status === "intrinsic" ? "#bfbfbf" : row.value === null ? "#fff" : color(row.value))
            .attr("stroke", "#667078").attr("stroke-width", .8).attr("tabindex", 0).attr("role", "button")
            .attr("aria-label", row => `${row.name}, ${row.antibiotic}: ${row.value === null ? row.status : row.value.toFixed(2) + '%'}`)
            .on("pointerenter pointermove focus click", function (event, row) { d3.select(this).attr("stroke-width", 2); show(event, row, this); })
            .on("pointerleave blur", function () { d3.select(this).attr("stroke-width", .8); hide(); })
            .on("keydown", function (event, row) { if (event.key === "Escape") hide(); if (event.key === "Enter" || event.key === " ") { event.preventDefault(); show(event, row, this); } });
        cells.append("text").attr("x", row => margin.left + report.columns.indexOf(row.antibiotic) * cellWidth + (cellWidth - 2) / 2)
            .attr("y", row => positions.get(row.name) + (cellHeight - 2) / 2).attr("text-anchor", "middle").attr("dominant-baseline", "central")
            .attr("font-size", 12).attr("pointer-events", "none")
            .attr("fill", row => contrastText(row.status === "intrinsic" ? "#bfbfbf" : row.value === null ? "#ffffff" : color(row.value)))
            .text(susceptibilityLabel);
        const legendX = margin.left, legendY = cursor + 42, legendWidth = Math.min(42, report.columns.length * cellWidth / susceptibilityColors.length);
        svg.append("text").attr("x", legendX).attr("y", cursor + 22).attr("font-size", 12).attr("font-weight", 600).text(text("敏感性（%）", "Susceptibility (%)"));
        const legendLabels = ["0-49", "50", "55", "60", "65", "70", "75", "80", "85", "90", "95", ">99"];
        susceptibilityColors.forEach((fill, index) => {
            svg.append("text").attr("x", legendX + index * legendWidth + legendWidth / 2).attr("y", legendY - 5).attr("text-anchor", "middle").attr("font-size", 10).text(legendLabels[index]);
            svg.append("rect").attr("x", legendX + index * legendWidth).attr("y", legendY).attr("width", legendWidth).attr("height", 15).attr("fill", fill);
        });
        for (const [index, fill, label] of [[0, "#bfbfbf", text("本質抗藥性", "Intrinsically resistant")], [1, "#fff", text("未測試／未報告", "Not tested/reported")]]) {
            svg.append("rect").attr("x", legendX + index * 230).attr("y", legendY + 30).attr("width", 13).attr("height", 13).attr("fill", fill).attr("stroke", "#667078");
            svg.append("text").attr("x", legendX + index * 230 + 20).attr("y", legendY + 41).attr("font-size", 11).text(label);
        }
    }
    viewport.addEventListener("scroll", hide);
    draw();
    return { resize: draw, dispose: () => { viewport.removeEventListener("scroll", hide); host.replaceChildren(); host.style.height = originalHeight; }, getWidth: () => width, getHeight: () => height,
        getDataURL: () => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(svg.node()))}` };
}