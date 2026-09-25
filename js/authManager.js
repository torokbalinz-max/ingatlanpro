// ============================================================
//  Ki van bejelentkezve: admin vagy sima felhasználó
// ============================================================

class AuthManager {

    static szerep = "user";
    static felhasznalo = null;

    static isAdmin() {
        return AuthManager.szerep === "admin";
    }

    static load() {

        return fetch("/api/me")
            .then(r => r.json())
            .then(me => {
                AuthManager.szerep = me.szerep || "user";
                AuthManager.felhasznalo = me.felhasznalo || null;
            })
            .catch(() => { AuthManager.szerep = "user"; })
            .then(() => AuthManager.apply());

    }

    // Csak adminnak szóló elemek megjelenítése / elrejtése
    static apply() {

        const admin = AuthManager.isAdmin();

        document.body.classList.toggle("is-admin", admin);

        document.querySelectorAll(".admin-only").forEach(el => {
            el.hidden = !admin;
        });

    }

}
