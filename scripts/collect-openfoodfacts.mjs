/**
 * Collects candidate product records from Open Food Facts for human review.
 * Usage: node scripts/collect-openfoodfacts.mjs
 * No records are published to Firebase or Cloudinary by this script.
 */
import { mkdir, writeFile } from "node:fs/promises";
const categories = [
  ["beverages", "en:beverages", 30],
  ["dairy", "en:dairies", 30],
  ["snacks", "en:snacks", 30],
  ["groceries", "en:groceries", 30],
  ["breakfast", "en:breakfasts", 20],
  ["cleaning", "en:cleaning-products", 20],
];
const output = [];
const seen = new Set();
for (const [category, tag, pageSize] of categories) {
  const url = new URL("https://world.openfoodfacts.org/cgi/search.pl");
  url.searchParams.set("search_simple", "1");
  url.searchParams.set("action", "process");
  url.searchParams.set("json", "1");
  url.searchParams.set("page_size", String(pageSize));
  url.searchParams.set("tagtype_0", "countries");
  url.searchParams.set("tag_contains_0", "contains");
  url.searchParams.set("tag_0", "egypt");
  url.searchParams.set("tagtype_1", "categories");
  url.searchParams.set("tag_contains_1", "contains");
  url.searchParams.set("tag_1", tag);
  url.searchParams.set("fields", "code,product_name,product_name_ar,brands,quantity,image_front_url,image_url,categories_tags,countries_tags");
  try {
    const response = await fetch(url, { headers: { "User-Agent": "BringoCatalogResearch/0.1 (product-image-catalog review)", Accept: "application/json" } });
    if (!response.ok) throw new Error("HTTP " + response.status);
    const data = await response.json();
    for (const product of data.products || []) {
      const barcode = String(product.code || "").trim();
      const imageUrl = product.image_front_url || product.image_url;
      if (!barcode || !/^https:\/\//.test(imageUrl || "") || seen.has(barcode)) continue;
      const name = String(product.product_name_ar || product.product_name || "").trim();
      if (!name) continue;
      seen.add(barcode);
      output.push({
        barcode, nameAr: product.product_name_ar || "", name,
        brand: product.brands || "", size: product.quantity || "",
        category, sourceImageUrl: imageUrl,
        imageSource: "Open Food Facts",
        sourceProductUrl: "https://world.openfoodfacts.org/product/" + encodeURIComponent(barcode),
        reviewStatus: "pending",
        notes: "Check barcode, variant, package, image license and reuse permissions before approval"
      });
    }
  } catch (error) {
    console.warn("Failed category", category, error.message);
  }
}
await mkdir("catalog-review", { recursive: true });
await writeFile("catalog-review/candidates.json", JSON.stringify(output, null, 2) + "\n");
console.log("Collected", output.length, "candidate records for human review (not approved or uploaded).");
