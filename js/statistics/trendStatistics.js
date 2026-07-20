class TrendStatistics {

    static load() {

        fetch("/api/statistics/trend")

.then(r => r.json())

.then(lista => {

    console.log(lista);

});

    }

}