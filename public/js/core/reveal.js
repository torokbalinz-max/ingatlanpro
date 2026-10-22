// ============================================================
//  Görgetésre finoman beúszó szakaszok (csak kinézet)
//  A már látható elemekhez nem nyúl (nincs villanás); aki a
//  csökkentett mozgást kérte, annál a CSS kikapcsolja.
// ============================================================

(() => {

    if (!("IntersectionObserver" in window)) return;

    const SEL = ".homeSection, .homeStats, .homeHelpStrip, .pathCard";

    const io = new IntersectionObserver(bejegyzesek => {
        bejegyzesek.forEach(e => {
            if (!e.isIntersecting) return;
            e.target.classList.add("isIn");
            io.unobserve(e.target);
        });
    }, { rootMargin: "0px 0px -8% 0px" });

    const atnez = () => {
        document.querySelectorAll(SEL).forEach(el => {
            if (el.dataset.rv) return;
            const r = el.getBoundingClientRect();
            if (!r.height) return;                       // rejtett oldalon: majd ha látszik
            el.dataset.rv = "1";
            if (r.top < window.innerHeight) return;      // már látszik: marad, ahogy van
            el.classList.add("ipReveal");
            io.observe(el);
        });
    };

    let var_ = false;
    const utemez = () => {
        if (var_) return;
        var_ = true;
        requestAnimationFrame(() => { var_ = false; atnez(); });
    };

    new MutationObserver(utemez).observe(document.body, { childList: true, subtree: true });
    window.addEventListener("scroll", utemez, { passive: true });
    atnez();

})();
