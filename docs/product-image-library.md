# Bringo shared supermarket image library

Provider integration uses the existing Firebase Realtime Database and existing product image field (\`image\`). No Firebase Storage is required.

## Schema

Admin writes approved entries to \`catalogProducts/{id}\`:

\`\`\`json
{
  "nameAr": "اسم المنتج",
  "brand": "الماركة",
  "size": "330 مل",
  "barcode": "optional-real-barcode",
  "imageUrl": "https://res.cloudinary.com/...",
  "imageStatus": "approved",
  "imageSource": "supplier",
  "imageLicense": "permission-reference",
  "category": "beverages"
}
\`\`\`

A provider can select an approved image from the shared library inside the product form. The selected URL is saved in the EXISTING \`products/{id}/image\` field, and \`catalogProductId\` is saved to retain provenance. Existing products, images, Excel import and Cloudinary upload continue to work.

### Security and data quality

- Only a trusted admin backend should write \`catalogProducts\`. Provider permissions should be read-only on this node.
- The current provider frontend uses a custom password-in-RTDB login flow. It does NOT establish a Firebase Authentication security identity. Restricting product writes per merchant will require a separately planned authentication/rules migration; the image-library UI alone cannot fix this.
- Approve products only after checking exact brand, variant, pack size, and barcode where available. Keep license/permission metadata. Do not scrape copyrighted product pack photos without authorization.
- Product-specific photos take precedence over library suggestions; provider can still upload a custom image with the existing uploader.
- The catalog may be empty until an admin imports approved images. This PR adds selection only; it doesn't invent or import 500 real product photos.
- The current Cloudinary direct browser upload requires a configured unsigned preset. Restrict presets with allowed formats, file size, folder, account monitoring and moderation where possible. For production-grade provider authorization, replace it with signed uploads from a secure backend.
