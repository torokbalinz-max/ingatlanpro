class DashboardStatistics {

    static render(lista) {

        const db = lista.length;

        if (db === 0) {

            return `
                <div class="alert alert-warning">
                    Nincs adat.
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