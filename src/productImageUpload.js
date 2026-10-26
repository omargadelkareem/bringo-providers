const MAX_IMAGE_SIZE = 1.5 * 1024 * 1024;

function setReactInputValue(input, value) {
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value"
  )?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
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
    hint.textContent = "اختر صورة من الجهاز (JPG / PNG / WEBP - بحد أقصى 1.5MB)";

    const preview = document.createElement("img");
    preview.className = "product-image-preview";
    preview.alt = "معاينة صورة المنتج";
    if (textInput.value) {
      preview.src = textInput.value;
      preview.style.display = "block";
    }

    picker.addEventListener("change", () => {
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

      const reader = new FileReader();
      reader.onload = () => {
        const value = String(reader.result || "");
        setReactInputValue(textInput, value);
        preview.src = value;
        preview.style.display = "block";
      };
      reader.onerror = () => window.alert("تعذر قراءة الصورة");
      reader.readAsDataURL(file);
    });

    label.appendChild(picker);
    label.appendChild(hint);
    label.appendChild(preview);
  });
}

const observer = new MutationObserver(enhanceProductImageField);
observer.observe(document.documentElement, { childList: true, subtree: true });
window.addEventListener("popstate", enhanceProductImageField);
queueMicrotask(enhanceProductImageField);
