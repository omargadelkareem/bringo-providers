/**
 * Converts a manually reviewed catalog JSON into Firebase RTDB REST import JSON.
 * Usage: node scripts/prepare-catalog-import.mjs catalog-review/approved.json
 * Only records explicitly marked approved, with an HTTPS Cloudinary image URL,
 * and a source license/permission reference are included.
 */
import { readFile, mkdir, writeFile } from "node:fs/promises";
const input = process.argv[2];
if (!input) throw new Error("Pass reviewed JSON path, e.g. catalog-review/approved.json");
const records = JSON.parse(await readFile(input, "utf8"));
if (!Array.isArray(records)) throw new Error("Input must be a JSON array");
const output = {};
let rejected = 0;
for (const p of records) {
  const barcode = String(p.barcode || "").trim();
  const imageUrl = String(p.imageUrl || "").trim();
  const permission = String(p.imageLicense || "").trim();
  const approved = p.reviewStatus === "approved";
  if (!approved || !/^\d{8,14}$/.test(barcode) || !/^https:\/\/res\.cloudinary\.com\//i.test(imageUrl) || !permission || !(p.nameAr || p.name)) {
    rejected++; continue;
  }
  const id = "barcode_" + barcode;
  if (output[id]) { rejected++; continue; }
  output[id] = {
    barcode, nameAr: String(p.nameAr || ""), name: String(p.name || ""),
    brand: String(p.brand || ""), size: String(p.size || ""),
    category: String(p.category || "general"),
    imageUrl, imageStatus: "approved",
    imageSource: String(p.imageSource || ""), imageLicense: permission,
    sourceProductUrl: String(p.sourceProductUrl || ""),
    updatedAt: Date.now()
  };
}
await mkdir("catalog-review", { recursive: true });
await writeFile("catalog-review/firebase-import.json", JSON.stringify(output, null, 2) + "\n");
console.log("Ready for admin import:", Object.keys(output).length, "Rejected/not yet approved:", rejected);
