const MAX_IMAGE_SIZE = 1.5 * 1024 * 1024;
const CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME?.trim();
const UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET?.trim();

function setReactInputValue(input, value) {
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value"
  )?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

async function uploadToCloudinary(file) {
  if (!CLOUD_NAME || !UPLOAD_PRESET) {
    throw new Error("CLOUDINARY_NOT_CONFIGURED");
  }

  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", UPLOAD_PRESET);
  formData.append("folder", "bringo/products");

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${encodeURIComponent(CLOUD_NAME)}/image/upload`,
    { method: "POST", body: formData }
  );

  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.secure_url) {
    throw new Error(data?.error?.message || "UPLOAD_FAILED");
  }

  return data.secure_url;
}

function enhanceProductImageField() {
  if (window.location.pathname !== "/products") return;

  document.querySelectorAll("form.form label").forEach((label) => {
    const textInput = label.querySelector('input[type="text"]');
    if (!textInput || label.dataset.imageUploadReady === "true") return;
    if (!label.textContent?.includes("رابط الصورة")) return;

    label.dataset.imageUploadReady = "true";
    label.childNodes.forEach((node) => {
      if (node.nodeType === Node.TEXT_NODE && node.textContent?.includes("رابط الصورة")) {
        node.textContent = "صورة المنتج";
      }
    });

    textInput.style.display = "none";
    textInput.setAttribute("aria-hidden", "true");

    const picker = document.createElement("input");
    picker.type = "file";
    picker.accept = "image/png,image/jpeg,image/webp";
    picker.className = "product-image-picker";

    const hint = document.createElement("small");
    hint.className = "product-image-hint";
    hint.textContent = CLOUD_NAME && UPLOAD_PRESET
      ? "اختر صورة المنتج وسيتم رفعها تلقائيًا (JPG / PNG / WEBP - بحد أقصى 1.5MB)"
      : "أضف VITE_CLOUDINARY_CLOUD_NAME و VITE_CLOUDINARY_UPLOAD_PRESET في Vercel لتفعيل رفع الصور";

    const status = document.createElement("small");
    status.className = "product-image-hint";
    status.style.display = "none";

    const preview = document.createElement("img");
    preview.className = "product-image-preview";
    preview.alt = "معاينة صورة المنتج";
    if (textInput.value) {
      preview.src = textInput.value;
      preview.style.display = "block";
    }

    picker.addEventListener("change", async () => {
      const file = picker.files?.[0];
      if (!file) return;
      if (!file.type.startsWith("image/")) {
        window.alert("اختار صورة صحيحة للمنتج");
        picker.value = "";
        return;
      }
      if (file.size > MAX_IMAGE_SIZE) {
        window.alert("صورة المنتج يجب أن تكون أقل من 1.5MB");
        picker.value = "";
        return;
      }

      picker.disabled = true;
      status.style.display = "block";
      status.textContent = "جاري رفع الصورة...";

      try {
        const imageUrl = await uploadToCloudinary(file);
        setReactInputValue(textInput, imageUrl);
        preview.src = imageUrl;
        preview.style.display = "block";
        status.textContent = "تم رفع الصورة ✓ احفظ المنتج لتظهر في التطبيق";
      } catch (error) {
        console.error("Product image upload failed", error);
        status.textContent = "تعذر رفع الصورة";
        if (error?.message === "CLOUDINARY_NOT_CONFIGURED") {
          window.alert("Cloudinary غير مُعد بعد. أضف Cloud Name و Upload Preset في Environment Variables على Vercel.");
        } else {
          window.alert(`تعذر رفع الصورة: ${error?.message || "حاول مرة أخرى"}`);
        }
        picker.value = "";
      } finally {
        picker.disabled = false;
      }
    });

    label.appendChild(picker);
    label.appendChild(hint);
    label.appendChild(status);
    label.appendChild(preview);
  });
}

const observer = new MutationObserver(enhanceProductImageField);
observer.observe(document.documentElement, { childList: true, subtree: true });
window.addEventListener("popstate", enhanceProductImageField);
queueMicrotask(enhanceProductImageField);
