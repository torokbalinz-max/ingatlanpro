// ============================================================
//  Grafikon-segéd a piaci elemzéshez (Chart.js)
// ============================================================

class ChartStatistics {

    static charts = [];

    static PALETTE = ["#1f6f5c", "#c2410c", "#f97316", "#9333ea", "#eab308", "#0891b2", "#dc2626", "#64748b", "#db2777", "#65a30d"];

    static destroy() {
        ChartStatistics.charts.forEach(c => c.destroy());
        ChartStatistics.charts = [];
    }

    static applyTheme() {

        const dark = document.documentElement.getAttribute("data-bs-theme") === "dark";

        Chart.defaults.color = dark ? "#cbd5e1" : "#475569";
        Chart.defaults.borderColor = dark ? "rgba(148,163,184,0.18)" : "rgba(15,23,42,0.08)";
        Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
        Chart.defaults.locale = Utils.locale();

    }

    // Vízszintes oszlopdiagram: átlag €/m² kategóriánként, a darabszám a tooltipben
    static bar(canvasId, rows, opts = {}) {

        const el = document.getElementById(canvasId);
        if (!el) return;

        ChartStatistics.applyTheme();

        const chart = new Chart(el, {
            type: "bar",
            data: {
                labels: rows.map(r => r.label),
                datasets: [{
                    label: opts.label || I18n.t("statsColAvgPriceNm"),
                    data: rows.map(r => Math.round(r.value)),
                    backgroundColor: rows.map((r, idx) => opts.single ? Utils.accent() : ChartStatistics.PALETTE[idx % ChartStatistics.PALETTE.length]),
                    borderRadius: 6,
                    maxBarThickness: 34
                }]
            },
            options: {
                indexAxis: opts.horizontal === false ? "x" : "y",
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: ctx => {
                                const r = rows[ctx.dataIndex];
                                const main = opts.format ? opts.format(ctx.parsed[opts.horizontal === false ? "y" : "x"]) : Utils.eurNm(ctx.raw);
                                return r.count !== undefined
                                    ? `${main} · ${r.count} ${I18n.t("pcsWord")}`
                                    : main;
                            }
                        }
                    }
                },
                scales: {
                    x: { beginAtZero: true },
                    y: { beginAtZero: true, grid: { display: false } }
                }
            }
        });

        ChartStatistics.charts.push(chart);

    }

    static line(canvasId, labels, values, label, format) {

        const el = document.getElementById(canvasId);
        if (!el) return;

        ChartStatistics.applyTheme();

        const chart = new Chart(el, {
            type: "line",
            data: {
                labels,
                datasets: [{
                    label,
                    data: values,
                    borderColor: Utils.accent(),
                    backgroundColor: "rgba(37,99,235,0.12)",
                    fill: true,
                    borderWidth: 3,
                    tension: 0.3,
                    pointRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: { callbacks: { label: ctx => format ? format(ctx.raw) : ctx.raw } }
                },
                scales: { y: { beginAtZero: false } }
            }
        });

        ChartStatistics.charts.push(chart);

    }

}
