// ============================================================
//  Képek lekicsinyítése feltöltés előtt (gyorsabb, kisebb)
// ============================================================

class ImageTools {

    static MAX_SIZE = 1600;
    static QUALITY = 0.82;

    static resize(file) {

        return new Promise((resolve, reject) => {

            if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
                reject(new Error("bad_type"));
                return;
            }

            const reader = new FileReader();

            reader.onload = () => {

                const img = new Image();

                img.onload = () => {

                    const arany = Math.min(1, ImageTools.MAX_SIZE / Math.max(img.width, img.height));
                    const w = Math.round(img.width * arany);
                    const h = Math.round(img.height * arany);

                    const canvas = document.createElement("canvas");
                    canvas.width = w;
                    canvas.height = h;

                    const ctx = canvas.getContext("2d");
                    ctx.fillStyle = "#fff";
                    ctx.fillRect(0, 0, w, h);
                    ctx.drawImage(img, 0, 0, w, h);

                    resolve(canvas.toDataURL("image/jpeg", ImageTools.QUALITY));

                };

                img.onerror = () => reject(new Error("bad_image"));
                img.src = reader.result;

            };

            reader.onerror = () => reject(new Error("read_error"));
            reader.readAsDataURL(file);

        });

    }

}
