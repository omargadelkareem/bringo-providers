const MAX_IMAGE_SIZE = 1.5 * 1024 * 1024;
const CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME?.trim();
const UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET?.trim();

function setReactInputValue(input, value) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function getImageSource(value) {
  const image = String(value || "").trim();
  if (!image) return { label: "لا توجد صورة", type: "empty" };
  if (image.startsWith("https://res.cloudinary.com/") || image.startsWith("http://res.cloudinary.com/")) return { label: "صورة المنتج", type: "cloudinary" };
  if (image.startsWith("data:image") || (!image.startsWith("http") && image.length > 500)) return { label: "صورة محفوظة", type: "base64" };
  if (image.startsWith("http")) return { label: "رابط صورة", type: "external" };
  return { label: "صورة محفوظة", type: "stored" };
}

async function copyText(value) {
  const text = String(value || "").trim();
  if (!text) return false;
  try { await navigator.clipboard.writeText(text); return true; }
  catch (_) {
    const textarea = document.createElement("textarea");
    textarea.value = text; textarea.style.position = "fixed"; textarea.style.opacity = "0";
    document.body.appendChild(textarea); textarea.select();
    const copied = document.execCommand("copy"); textarea.remove(); return copied;
  }
}

async function uploadToCloudinary(file) {
  if (!CLOUD_NAME || !UPLOAD_PRESET) throw new Error("CLOUDINARY_NOT_CONFIGURED");
  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", UPLOAD_PRESET);
  formData.append("folder", "bringo/products");
  const response = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(CLOUD_NAME)}/image/upload`, { method: "POST", body: formData });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.secure_url) throw new Error(data?.error?.message || "UPLOAD_FAILED");
  return data.secure_url;
}

function enhanceProductImageField() {
  if (window.location.pathname !== "/products") return;
  document.querySelectorAll("form.form label").forEach((label) => {
    const textInput = label.querySelector('input[type="text"]');
    if (!textInput || label.dataset.imageUploadReady === "true" || !label.textContent?.includes("رابط الصورة")) return;
    label.dataset.imageUploadReady = "true";
    label.childNodes.forEach((node) => {
      if (node.nodeType === Node.TEXT_NODE && node.textContent?.includes("رابط الصورة")) node.textContent = "صورة المنتج";
    });
    textInput.style.display = "none"; textInput.setAttribute("aria-hidden", "true");

    const picker = document.createElement("input");
    picker.type = "file"; picker.accept = "image/png,image/jpeg,image/webp"; picker.className = "product-image-picker";
    const hint = document.createElement("small");
    hint.className = "product-image-hint";
    hint.textContent = "اختر صورة المنتج (JPG / PNG / WEBP - بحد أقصى 1.5MB)";
    const status = document.createElement("small");
    status.className = "product-image-hint"; status.style.display = "none";

    const sourceRow = document.createElement("div");
    sourceRow.style.display = "flex"; sourceRow.style.alignItems = "center"; sourceRow.style.gap = "8px"; sourceRow.style.flexWrap = "wrap"; sourceRow.style.marginTop = "8px";
    const sourceBadge = document.createElement("span");
    sourceBadge.style.fontSize = "12px"; sourceBadge.style.fontWeight = "700"; sourceBadge.style.padding = "5px 9px"; sourceBadge.style.borderRadius = "999px"; sourceBadge.style.background = "#f3f4f6";
    const copyButton = document.createElement("button");
    copyButton.type = "button"; copyButton.textContent = "نسخ رابط الصورة"; copyButton.style.border = "1px solid #ddd"; copyButton.style.background = "white"; copyButton.style.borderRadius = "8px"; copyButton.style.padding = "5px 9px"; copyButton.style.cursor = "pointer"; copyButton.style.fontSize = "12px";
    const updateSourceUi = () => {
      const source = getImageSource(textInput.value);
      sourceBadge.textContent = `الحالة: ${source.label}`;
      copyButton.style.display = textInput.value?.trim() ? "inline-block" : "none";
      copyButton.disabled = source.type === "base64" || source.type === "stored";
    };
    copyButton.addEventListener("click", async () => {
      const copied = await copyText(textInput.value); const oldText = copyButton.textContent;
      copyButton.textContent = copied ? "تم النسخ ✓" : "تعذر النسخ";
      setTimeout(() => { copyButton.textContent = oldText; }, 1500);
    });
    sourceRow.appendChild(sourceBadge); sourceRow.appendChild(copyButton);

    const preview = document.createElement("img");
    preview.className = "product-image-preview"; preview.alt = "معاينة صورة المنتج";
    if (textInput.value) { preview.src = textInput.value; preview.style.display = "block"; }
    updateSourceUi();

    picker.addEventListener("change", async () => {
      const file = picker.files?.[0]; if (!file) return;
      if (!file.type.startsWith("image/")) { window.alert("من فضلك اختر صورة صحيحة للمنتج."); picker.value = ""; return; }
      if (file.size > MAX_IMAGE_SIZE) { window.alert("حجم الصورة كبير. اختر صورة أقل من 1.5MB."); picker.value = ""; return; }
      picker.disabled = true; status.style.display = "block"; status.textContent = "جاري رفع الصورة...";
      try {
        const imageUrl = await uploadToCloudinary(file);
        setReactInputValue(textInput, imageUrl); preview.src = imageUrl; preview.style.display = "block"; updateSourceUi();
        status.textContent = "تم رفع الصورة بنجاح ✓ احفظ المنتج لإتمام التعديل";
      } catch (error) {
        console.error("Product image upload failed", error);
        status.textContent = "تعذر رفع الصورة حاليًا. حاول مرة أخرى بعد قليل.";
        window.alert("تعذر رفع الصورة حاليًا. حاول مرة أخرى بعد قليل، وإذا استمرت المشكلة تواصل مع دعم Bringo.");
        picker.value = "";
      } finally { picker.disabled = false; }
    });

    label.appendChild(picker); label.appendChild(hint); label.appendChild(status); label.appendChild(sourceRow); label.appendChild(preview);
  });
}

const observer = new MutationObserver(enhanceProductImageField);
observer.observe(document.documentElement, { childList: true, subtree: true });
window.addEventListener("popstate", enhanceProductImageField);
queueMicrotask(enhanceProductImageField);
