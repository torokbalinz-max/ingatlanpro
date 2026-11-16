// ============================================================
//  Szövegek (27. változat): az átrendezett menük (főmenü, fiók,
//  munkaterület, admin)
// ============================================================

(() => {

    const V27 = {
        hu: {
            navStats: "Statisztikák",
            // ---- Fiókom: hat pont ----
            acNav_kereseseim: "Kereséseim",
            acDesc_kereseseim: "Az elmentett szűréseid és a feladott keresési igényeid – szólunk, ha valami illik rájuk.",
            acNav_ugyek: "Megtekintések és ajánlatok",
            acDesc_ugyek: "Az időpont-kéréseid, a visszaigazolt megtekintések és az ajánlataid.",
            acDesc_beall: "Profil és jelszó, értesítési beállítások, csomagod és számláid.",
            acHelloText2: "Minden, ami a tiéd, egy helyen. Válaszd ki, mit szeretnél.",
            // ---- Admin: öt modul ----
            // ---- Munkaterület: öt pont ----
            wsNav5_ma: "Ma",
            adminModPartners: "Partnerek",
            adminTabInvoicing: "Számlázás",
            admBackToSite: "Vissza az oldalra"
        },
        ro: {
            navStats: "Statistici",
            acNav_kereseseim: "Căutările mele",
            acDesc_kereseseim: "Căutările salvate și cererile publicate – te anunțăm când apare ceva potrivit.",
            acNav_ugyek: "Vizionări și oferte",
            acDesc_ugyek: "Cererile de programare, vizionările confirmate și ofertele tale.",
            acDesc_beall: "Profil și parolă, setări notificări, pachetul și facturile tale.",
            acHelloText2: "Tot ce e al tău, într-un singur loc. Alege ce vrei să faci.",
            wsNav5_ma: "Azi",
            adminModPartners: "Parteneri",
            adminTabInvoicing: "Facturare",
            admBackToSite: "Înapoi la site"
        },
        en: {
            navStats: "Statistics",
            acNav_kereseseim: "My searches",
            acDesc_kereseseim: "Your saved searches and wanted ads – we tell you when something matches.",
            acNav_ugyek: "Viewings & offers",
            acDesc_ugyek: "Your viewing requests, confirmed viewings and your offers.",
            acDesc_beall: "Profile & password, notification settings, your plan and invoices.",
            acHelloText2: "Everything that is yours, in one place. Pick what you need.",
            wsNav5_ma: "Today",
            adminModPartners: "Partners",
            adminTabInvoicing: "Invoicing",
            admBackToSite: "Back to the site"
        }
    };

    Object.keys(V27).forEach(nyelv => { I18N_STRINGS[nyelv] = Object.assign(I18N_STRINGS[nyelv] || {}, V27[nyelv]); });

})();
