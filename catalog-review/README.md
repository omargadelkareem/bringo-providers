# Bringo product catalog intake

This workflow deliberately separates **discovery**, **human review**, **Cloudinary upload**, and **Firebase import**.

1. Run `node scripts/collect-openfoodfacts.mjs` with Node.js 18+. This fetches candidate food product records associated with Egypt from Open Food Facts and saves `catalog-review/candidates.json`. These are *unverified leads*, not approved products. Coverage varies, especially for non-food items and imported goods.
2. Review each candidate's barcode, Arabic name, brand, size, package image and license/permission. Open Food Facts database content and individual photographs can have different reuse obligations; do not assume all photos are freely reusable. Source attribution, applicable license conditions and permission records must be retained.
3. Upload only permitted and verified images to Cloudinary, using an authorized workflow. In a copy named `catalog-review/approved.json`, set `reviewStatus: "approved"`, `imageUrl` to the uploaded Cloudinary HTTPS URL, and `imageLicense` to the actual permission/license evidence. Do not put Cloudinary API secrets in frontend code or this repository.
4. Run `node scripts/prepare-catalog-import.mjs catalog-review/approved.json`. This outputs `catalog-review/firebase-import.json` with the `catalogProducts` child map. Import only through a trusted admin account/backend with appropriate RTDB rules, not the provider frontend.
5. Provider picker displays entries with `imageStatus: "approved"`. Each store chooses its own price and stock.

No price data is guessed. No real product images are bundled or uploaded automatically. Do not publish pending/unreviewed candidates.

The importer produces a **child map**, not a database root object. Import under `catalogProducts`, never at the RTDB root. Check backups and rules first.
