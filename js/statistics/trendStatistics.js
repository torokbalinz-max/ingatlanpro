class TrendStatistics {

    static load() {

        fetch("/api/statistics/trend")

.then(r => r.json())

.then(lista => {

    const from =
        document.getElementById("trendFrom").value;

    const to =
        document.getElementById("trendTo").value;

    const type =
        document.getElementById("trendType").value;
        let chartLabel = "";

switch(type){

    case "avg_price_nm":
        chartLabel = "Átlag €/m²";
        break;

    case "avg_price":
        chartLabel = "Átlag ár (€)";
        break;

    case "property_count":
        chartLabel = "Ingatlanok száma";
        break;

}

    let adatok = lista;

    if(from){

        adatok =
            adatok.filter(x =>
                x.created_at >= from
            );

    }

    if(to){

        adatok =
            adatok.filter(x =>
                x.created_at <= to + "T23:59:59"
            );

    }

    const labels =
        adatok.map(x =>
            new Date(x.created_at).toLocaleDateString()
        );

    const values =
        adatok.map(x =>
            Number(x[type])
        );

    if (
    window.trendChart &&
    typeof window.trendChart.destroy === "function"
) {

    window.trendChart.destroy();

}

    window.trendChart = new Chart(

        document.getElementById("trendChart"),

        {

            type:"line",

            data:{

                labels,

                datasets:[

                    {

                        label: chartLabel,

                        data:values,

                        borderWidth:3,

                        tension:0.35,

                        fill:false

                    }

                ]

            },

            options:{

                responsive:true,

                interaction:{

                    intersect:false,

                    mode:"index"

                }

            }

        }

    );

});
document.getElementById("trendFrom").onchange = () => {

    TrendStatistics.load();

};

document.getElementById("trendTo").onchange = () => {

    TrendStatistics.load();

};

document.getElementById("trendType").onchange = () => {

    TrendStatistics.load();

};

    }

}