class UIManager {

    static selectedIngatlan = null;

    static showDetails(ingatlan) {

        UIManager.selectedIngatlan = ingatlan;

        document.getElementById("detailId").innerText = ingatlan.id;
        document.getElementById("detailAr").innerText = ingatlan.ar.toLocaleString() + " €";
        document.getElementById("detailNm").innerText = ingatlan.nm + " nm";
        document.getElementById("detailSzoba").innerText = ingatlan.szobak;
        document.getElementById("detailEmelet").innerText = ingatlan.emelet;
        document.getElementById("detailAllapot").innerText = ingatlan.allapot;
        document.getElementById("detailLink").href = ingatlan.link;

    }

    static setActiveMenu(id){

        document.querySelectorAll(".sidebarBtn").forEach(btn=>{

            btn.classList.remove("active");

        });

        document.getElementById(id).classList.add("active");

    }

    static initMenu() {


        // Ingatlanok

        document.getElementById("menuIngatlanok").onclick = () => {

            UIManager.setActiveMenu("menuIngatlanok");

            PageManager.show("pageDashboard");

        };

        // Statisztikák

        document.getElementById("menuStatisztika").onclick = () => {

            UIManager.setActiveMenu("menuStatisztika");

            PageManager.show("pageStatistics");

            StatisticsManager.loadCurrent();

            setTimeout(() => {

                document.getElementById("pageStatistics").scrollIntoView({

                    behavior:"smooth",

                    block:"start"

                });

            },100);

        };

        // Új ingatlan

        document.getElementById("menuUj").onclick = () => {

            UIManager.setActiveMenu("menuUj");

            PageManager.show("pageNew");

            NewPropertyMap.refresh();

        };

        // ===== Törlés =====

        document.getElementById("btnDelete").onclick = () => {

            if (!UIManager.selectedIngatlan) {

                alert("Nincs kiválasztott ingatlan!");

                return;

            }

            if (!confirm("Biztosan törölni szeretnéd ezt az ingatlant?")) {

                return;

            }

            fetch("/api/ingatlanok/" + UIManager.selectedIngatlan.id, {

                method:"DELETE"

            })

            .then(r=>r.json())

            .then(()=>{

                alert("Ingatlan törölve!");

                DataManager.ingatlanok =
                    DataManager.ingatlanok.filter(x=>x.id!==UIManager.selectedIngatlan.id);

                DataManager.szurtIngatlanok =
                    DataManager.szurtIngatlanok.filter(x=>x.id!==UIManager.selectedIngatlan.id);

                TableManager.remove(UIManager.selectedIngatlan);

                DashboardManager.load(DataManager.szurtIngatlanok);

                MapManager.load(DataManager.szurtIngatlanok);

                UIManager.selectedIngatlan=null;

            });

        };

        // ===== Szerkesztés =====

        document.getElementById("btnEdit").onclick = () => {

            if (!UIManager.selectedIngatlan) {

                alert("Nincs kiválasztott ingatlan!");

                return;

            }

            const i = UIManager.selectedIngatlan;

            document.getElementById("ujLink").value=i.link;
            document.getElementById("ujAr").value=i.ar;
            document.getElementById("ujNm").value=i.nm;
            document.getElementById("ujSzobak").value=i.szobak;

            const emelet=String(i.emelet||"").split("/");

            document.getElementById("ujEmelet").value=emelet[0]||"";
            document.getElementById("ujOsszEmelet").value=emelet[1]||"";

            document.getElementById("ujAllapot").value=i.allapot;
            document.getElementById("ujX").value=i.x;
            document.getElementById("ujY").value=i.y;

            NewPropertyManager.editId=i.id;

            UIManager.setActiveMenu("menuUj");

            PageManager.show("pageNew");

            setTimeout(()=>{

                NewPropertyMap.refresh();

            },300);

        };

    }

}