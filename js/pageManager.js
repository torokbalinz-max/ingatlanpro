class PageManager {

    static show(page){

        document.getElementById("pageDashboard").style.display = "none";
        document.getElementById("pageNew").style.display = "none";
        document.getElementById("pageStatistics").style.display = "none";

        document.getElementById(page).style.display = "block";

    }

}