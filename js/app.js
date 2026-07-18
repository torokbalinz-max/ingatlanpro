document.addEventListener("DOMContentLoaded", () => {

    console.log("IngatlanPro indult");
    
    UIManager.initMenu();

    DataManager.init();

    FilterManager.init();
    
    NewPropertyMap.init();
    
    NewPropertyManager.init();
});