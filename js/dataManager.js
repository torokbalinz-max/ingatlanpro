class DataManager {

    static ingatlanok = [];

    static toNumber(value) {

        if (value === null || value === undefined) return 0;

        return Number(
            String(value)
                .replace(/\s/g, "")
                .replace(",", ".")
                .replace("€", "")
        ) || 0;

    }

    static init() {

        console.log("DataManager indul...");

        fetch("http://localhost:3000/api/ingatlanok")

            .then(response => {

                console.log("HTTP státusz:", response.status);

                if (!response.ok) {
                    throw new Error("Szerver hiba: " + response.status);
                }

                return response.json();

            })

            .then(rows => {

                console.log("Beolvasott ingatlanok:", rows);

                DataManager.ingatlanok = rows;

                DashboardManager.load(DataManager.ingatlanok);

                TableManager.load(DataManager.ingatlanok);

                MapManager.load(DataManager.ingatlanok);

            })

            .catch(err => {

                console.error("DataManager hiba:", err);
                alert(err);

            });

    }

}