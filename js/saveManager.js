class SaveManager {

    static init() {

        document.getElementById("btnSave").addEventListener("click", () => {

            const ujIngatlan = {

                link: document.getElementById("ujLink").value,

                ar: Number(document.getElementById("ujAr").value),

                nm: Number(document.getElementById("ujNm").value),

                szobak: Number(document.getElementById("ujSzobak").value),

                emelet: document.getElementById("ujEmelet").value,

                allapot: document.getElementById("ujAllapot").value,

                x: Number(document.getElementById("ujX").value),

                y: Number(document.getElementById("ujY").value)

            };

            console.log(ujIngatlan);

        });

    }

}