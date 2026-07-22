class DashboardStatistics {

    static render(lista) {

        const db = lista.length;

        if (db === 0) {

            return `

<h2 class="statisticsTitle">

    <i class="fa-solid fa-chart-simple"></i>

    Jelenlegi piaci áttekintés

</h2>

<div class="dashboardCards">

    <div class="premiumStatCard">

        <div class="premiumIcon blue">
            <i class="fa-solid fa-house"></i>
        </div>

        <div class="premiumInfo">

            <span>Ingatlanok</span>

            <h2>${db}</h2>

        </div>

    </div>

    <div class="premiumStatCard">

        <div class="premiumIcon green">
            <i class="fa-solid fa-sack-dollar"></i>
        </div>

        <div class="premiumInfo">

            <span>Átlag ár</span>

            <h2>${Math.round(atlagAr).toLocaleString()} €</h2>

        </div>

    </div>

    <div class="premiumStatCard">

        <div class="premiumIcon orange">
            <i class="fa-solid fa-ruler-combined"></i>
        </div>

        <div class="premiumInfo">

            <span>Átlag m²</span>

            <h2>${atlagNm.toFixed(1)}</h2>

        </div>

    </div>

    <div class="premiumStatCard">

        <div class="premiumIcon purple">
            <i class="fa-solid fa-chart-column"></i>
        </div>

        <div class="premiumInfo">

            <span>Átlag €/m²</span>

            <h2>${Math.round(atlagArNm)}</h2>

        </div>

    </div>

    <div class="premiumStatCard">

        <div class="premiumIcon emerald">
            <i class="fa-solid fa-arrow-down"></i>
        </div>

        <div class="premiumInfo">

            <span>Minimum €/m²</span>

            <h2>${Math.round(minArNm)}</h2>

        </div>

    </div>

    <div class="premiumStatCard">

        <div class="premiumIcon red">
            <i class="fa-solid fa-arrow-up"></i>
        </div>

        <div class="premiumInfo">

            <span>Maximum €/m²</span>

            <h2>${Math.round(maxArNm)}</h2>

        </div>

    </div>

</div>

`;

        }

        const atlagAr =
            lista.reduce((s, i) => s + i.ar, 0) / db;

        const atlagNm =
            lista.reduce((s, i) => s + i.nm, 0) / db;

        const atlagArNm =
            lista.reduce((s, i) => s + i.arNm, 0) / db;

        const minArNm =
            Math.min(...lista.map(i => i.arNm));

        const maxArNm =
            Math.max(...lista.map(i => i.arNm));

        return `

<h2 class="mb-4">
    📈 Jelenlegi piaci áttekintés
</h2>

<div class="row g-3">

    <div class="col-lg-4 col-md-6">
        <div class="card shadow border-0 h-100">
            <div class="card-body text-center">
                <div style="font-size:40px;">🏠</div>
                <h6 class="text-muted mt-2">Ingatlanok</h6>
                <h2>${db}</h2>
            </div>
        </div>
    </div>

    <div class="col-lg-4 col-md-6">
        <div class="card shadow border-0 h-100">
            <div class="card-body text-center">
                <div style="font-size:40px;">💶</div>
                <h6 class="text-muted mt-2">Átlag ár</h6>
                <h2>${Math.round(atlagAr).toLocaleString()} €</h2>
            </div>
        </div>
    </div>

    <div class="col-lg-4 col-md-6">
        <div class="card shadow border-0 h-100">
            <div class="card-body text-center">
                <div style="font-size:40px;">📐</div>
                <h6 class="text-muted mt-2">Átlag m²</h6>
                <h2>${atlagNm.toFixed(1)}</h2>
            </div>
        </div>
    </div>

    <div class="col-lg-4 col-md-6">
        <div class="card shadow border-0 h-100">
            <div class="card-body text-center">
                <div style="font-size:40px;">💰</div>
                <h6 class="text-muted mt-2">Átlag €/m²</h6>
                <h2>${Math.round(atlagArNm)}</h2>
            </div>
        </div>
    </div>

    <div class="col-lg-4 col-md-6">
        <div class="card shadow border-0 h-100">
            <div class="card-body text-center">
                <div style="font-size:40px;">🟢</div>
                <h6 class="text-muted mt-2">Minimum €/m²</h6>
                <h2>${Math.round(minArNm)}</h2>
            </div>
        </div>
    </div>

    <div class="col-lg-4 col-md-6">
        <div class="card shadow border-0 h-100">
            <div class="card-body text-center">
                <div style="font-size:40px;">🔴</div>
                <h6 class="text-muted mt-2">Maximum €/m²</h6>
                <h2>${Math.round(maxArNm)}</h2>
            </div>
        </div>
    </div>

</div>

<hr class="my-4">

`;

    }

}