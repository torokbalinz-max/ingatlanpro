class DashboardStatistics {

    static render(lista) {

        const db = lista.length;

        const atlagAr = db > 0
            ? lista.reduce((s, i) => s + i.ar, 0) / db
            : 0;

        const atlagNm = db > 0
            ? lista.reduce((s, i) => s + i.nm, 0) / db
            : 0;

        const atlagArNm = db > 0
            ? lista.reduce((s, i) => s + i.arNm, 0) / db
            : 0;

        const minArNm = db > 0
            ? Math.min(...lista.map(i => i.arNm))
            : 0;

        const maxArNm = db > 0
            ? Math.max(...lista.map(i => i.arNm))
            : 0;

        return `

<h2 class="mb-4">
    ${I18n.t("dashOverviewTitle")}
</h2>

<div class="row g-3">

    <div class="col-lg-4 col-md-6">
        <div class="card shadow border-0 h-100">
            <div class="card-body text-center">
                <div style="font-size:40px;">🏠</div>
                <h6 class="text-muted mt-2">${I18n.t("dashLabelCount")}</h6>
                <h2>${db}</h2>
            </div>
        </div>
    </div>

    <div class="col-lg-4 col-md-6">
        <div class="card shadow border-0 h-100">
            <div class="card-body text-center">
                <div style="font-size:40px;">💶</div>
                <h6 class="text-muted mt-2">${I18n.t("dashLabelAvgPrice")}</h6>
                <h2>${Math.round(atlagAr).toLocaleString()} €</h2>
            </div>
        </div>
    </div>

    <div class="col-lg-4 col-md-6">
        <div class="card shadow border-0 h-100">
            <div class="card-body text-center">
                <div style="font-size:40px;">📐</div>
                <h6 class="text-muted mt-2">${I18n.t("dashLabelAvgNm")}</h6>
                <h2>${atlagNm.toFixed(1)}</h2>
            </div>
        </div>
    </div>

    <div class="col-lg-4 col-md-6">
        <div class="card shadow border-0 h-100">
            <div class="card-body text-center">
                <div style="font-size:40px;">💰</div>
                <h6 class="text-muted mt-2">${I18n.t("dashLabelAvgPriceNm")}</h6>
                <h2>${Math.round(atlagArNm)}</h2>
            </div>
        </div>
    </div>

    <div class="col-lg-4 col-md-6">
        <div class="card shadow border-0 h-100">
            <div class="card-body text-center">
                <div style="font-size:40px;">🟢</div>
                <h6 class="text-muted mt-2">${I18n.t("dashLabelMinPriceNm")}</h6>
                <h2>${Math.round(minArNm)}</h2>
            </div>
        </div>
    </div>

    <div class="col-lg-4 col-md-6">
        <div class="card shadow border-0 h-100">
            <div class="card-body text-center">
                <div style="font-size:40px;">🔴</div>
                <h6 class="text-muted mt-2">${I18n.t("dashLabelMaxPriceNm")}</h6>
                <h2>${Math.round(maxArNm)}</h2>
            </div>
        </div>
    </div>

</div>

<hr class="my-4">

`;

    }

}