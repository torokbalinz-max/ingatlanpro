class NewPropertyManager {

    static editId = null;

    static init() {

        document.getElementById("btnSave").onclick = () => {

            console.log("Mentés gomb megnyomva");

            const adat = {

                link: document.getElementById("ujLink").value,

                ar: Number(document.getElementById("ujAr").value),

                nm: Number(document.getElementById("ujNm").value),

                arNm:
                    Number(document.getElementById("ujAr").value) /
                    Number(document.getElementById("ujNm").value),

                szobak: Number(document.getElementById("ujSzobak").value),

                emelet:
                    document.getElementById("ujEmelet").value +
                    "/" +
                    document.getElementById("ujOsszEmelet").value,

                allapot: document.getElementById("ujAllapot").value,

                eladva: false,

                x: Number(document.getElementById("ujX").value),

                y: Number(document.getElementById("ujY").value)

            };

            const url =
                NewPropertyManager.editId == null
                    ? "http://localhost:3000/api/ingatlanok"
                    : "http://localhost:3000/api/ingatlanok/" + NewPropertyManager.editId;

            const method =
                NewPropertyManager.editId == null
                    ? "POST"
                    : "PUT";

            fetch(url, {

                method: method,

                headers: {
                    "Content-Type": "application/json"
                },

                body: JSON.stringify(adat)

            })

            .then(response => response.json())

            .then(valasz => {

                console.log(valasz);

                alert("Mentés sikeres!");

                NewPropertyManager.editId = null;

                DataManager.init();

                PageManager.show("pageDashboard");

            })

            .catch(err => {

                console.error(err);

                alert("Hiba történt a mentés során!");

            });

        };

    }

}