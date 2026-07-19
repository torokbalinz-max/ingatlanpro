class UIManager {
    static selectedIngatlan = null;

    static showDetails(ingatlan){
        UIManager.selectedIngatlan = ingatlan;

        document.getElementById("detailId").innerText = ingatlan.id;

        document.getElementById("detailAr").innerText =
            ingatlan.ar.toLocaleString() + " €";

        document.getElementById("detailNm").innerText =
            ingatlan.nm + " nm";

        document.getElementById("detailSzoba").innerText =
            ingatlan.szobak;

        document.getElementById("detailEmelet").innerText =
            ingatlan.emelet;

        document.getElementById("detailAllapot").innerText =
            ingatlan.allapot;

        document.getElementById("detailLink").href =
            ingatlan.link;

    }
    static initMenu(){

    document.getElementById("menuDashboard").onclick=()=>{

        PageManager.show("pageDashboard");

    };
    document.getElementById("menuIngatlanok").onclick = () => {

    PageManager.show("pageDashboard");

};
document.getElementById("menuStatisztika").onclick = () => {

    PageManager.show("pageStatistics");

    StatisticsManager.loadCurrent();

};

    document.getElementById("menuUj").onclick = () => {

    PageManager.show("pageNew");

    NewPropertyMap.refresh();

};
document.getElementById("btnDelete").onclick = () => {

    if (!UIManager.selectedIngatlan) {

        alert("Nincs kiválasztott ingatlan!");

        return;

    }

    if (!confirm("Biztosan törölni szeretnéd ezt az ingatlant?")) {

        return;

    }
    
    const aktualisOldal = TableManager.grid.paginationGetCurrentPage();

    fetch(
        "/api/ingatlanok/" + UIManager.selectedIngatlan.id,
        {
            method: "DELETE"
        }
    )
    .then(r => r.json())
    .then(() => {

    alert("Ingatlan törölve!");

    DataManager.ingatlanok =
        DataManager.ingatlanok.filter(
            x => x.id !== UIManager.selectedIngatlan.id
        );

    TableManager.remove(UIManager.selectedIngatlan);

    DashboardManager.load(DataManager.ingatlanok);

    UIManager.selectedIngatlan = null;

});

};
document.getElementById("btnEdit").onclick = () => {

    if (!UIManager.selectedIngatlan) {

        alert("Nincs kiválasztott ingatlan!");

        return;

    }

    const i = UIManager.selectedIngatlan;

    document.getElementById("ujLink").value = i.link;
document.getElementById("ujAr").value = i.ar;
document.getElementById("ujNm").value = i.nm;
document.getElementById("ujSzobak").value = i.szobak;

const emelet = String(i.emelet || "").split("/");

document.getElementById("ujEmelet").value = emelet[0] || "";
document.getElementById("ujOsszEmelet").value = emelet[1] || "";

document.getElementById("ujAllapot").value = i.allapot;
document.getElementById("ujX").value = i.x;
document.getElementById("ujY").value = i.y;

    NewPropertyManager.editId = i.id;

    PageManager.show("pageNew");

setTimeout(() => {
    NewPropertyMap.refresh();
}, 300);

};
}


}
