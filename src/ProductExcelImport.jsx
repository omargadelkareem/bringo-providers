import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import * as XLSX from "xlsx";
import { push, ref, set } from "firebase/database";
import { db } from "./firebase";
import { useAuth } from "./context";

const aliases = {
  name: ["name", "اسم المنتج", "productName", "المنتج", "الاسم"],
  brand: ["brand", "البراند", "الماركة"],
  price: ["price", "السعر"],
  oldPrice: ["oldPrice", "السعر قبل الخصم", "old_price"],
  image: ["image", "الصورة", "imageUrl", "رابط الصورة"],
  stock: ["stock", "الكمية", "المخزون"],
  unit: ["unit", "الوحدة"],
  menuCategoryName: ["menuCategoryName", "قسم المنيو", "القسم", "category"],
  description: ["description", "الوصف"],
  isAvailable: ["isAvailable", "متاح", "available"],
  isBestSeller: ["isBestSeller", "الأكثر طلبًا", "bestSeller"],
  isOffer: ["isOffer", "عرض", "offer"],
};

function value(row, keys) {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null && String(row[key]).trim() !== "") return row[key];
  }
  return "";
}

function boolValue(v, fallback = false) {
  if (v === "" || v === undefined || v === null) return fallback;
  if (typeof v === "boolean") return v;
  const x = String(v).trim().toLowerCase();
  return ["true", "1", "yes", "y", "نعم", "متاح", "صح"].includes(x);
}

function normalizeRow(row, index) {
  const name = String(value(row, aliases.name) || "").trim();
  const price = Number(value(row, aliases.price));
  const stockRaw = value(row, aliases.stock);
  const oldPriceRaw = value(row, aliases.oldPrice);
  const product = {
    name,
    brand: String(value(row, aliases.brand) || "").trim(),
    price,
    oldPrice: oldPriceRaw === "" ? null : Number(oldPriceRaw),
    image: String(value(row, aliases.image) || "").trim(),
    stock: stockRaw === "" ? 999 : Number(stockRaw),
    unit: String(value(row, aliases.unit) || "قطعة").trim(),
    menuCategoryName: String(value(row, aliases.menuCategoryName) || "عام").trim(),
    description: String(value(row, aliases.description) || "").trim(),
    isAvailable: boolValue(value(row, aliases.isAvailable), true),
    isBestSeller: boolValue(value(row, aliases.isBestSeller), false),
    isOffer: boolValue(value(row, aliases.isOffer), false),
    _row: index + 2,
  };
  const errors = [];
  if (!name) errors.push("اسم المنتج مطلوب");
  if (!Number.isFinite(price) || price <= 0) errors.push("السعر غير صحيح");
  if (!Number.isFinite(product.stock) || product.stock < 0) errors.push("المخزون غير صحيح");
  if (product.oldPrice !== null && !Number.isFinite(product.oldPrice)) errors.push("السعر القديم غير صحيح");
  return { product, errors };
}

export default function ProductExcelImport() {
  const { store } = useAuth();
  const [target, setTarget] = useState(null);
  const [rows, setRows] = useState([]);
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let timer;
    const findTarget = () => {
      const el = document.querySelector(".products");
      setTarget(el || null);
      if (!el) timer = setTimeout(findTarget, 200);
    };
    if (window.location.pathname.includes("/products")) findTarget();
    const onNav = () => setTimeout(findTarget, 50);
    window.addEventListener("popstate", onNav);
    return () => { clearTimeout(timer); window.removeEventListener("popstate", onNav); };
  }, []);

  if (!target || !store?.id) return null;

  const valid = rows.filter(x => x.errors.length === 0);
  const invalid = rows.filter(x => x.errors.length > 0);

  async function readExcel(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json(sheet, { defval: "" });
      const parsed = json.map(normalizeRow);
      setRows(parsed);
      setFileName(file.name);
    } catch (err) {
      console.error(err);
      alert("تعذر قراءة ملف Excel. تأكد أن الملف بصيغة xlsx أو xls.");
      setRows([]);
      setFileName("");
    } finally {
      e.target.value = "";
    }
  }

  async function importProducts() {
    if (!valid.length) return;
    if (!confirm(`سيتم إضافة ${valid.length} منتج إلى ${store.name}. متابعة؟`)) return;
    setBusy(true);
    try {
      const createdAt = Date.now();
      await Promise.all(valid.map(async ({ product }) => {
        const q = push(ref(db, "products"));
        const { _row, ...clean } = product;
        await set(q, {
          id: q.key,
          ...clean,
          storeId: store.id,
          storeName: store.name,
          storeType: store.type || "",
          createdAt,
          updatedAt: createdAt,
        });
      }));
      alert(`تم استيراد ${valid.length} منتج بنجاح`);
      setRows([]);
      setFileName("");
    } catch (err) {
      console.error(err);
      alert("حدث خطأ أثناء حفظ المنتجات. حاول مرة أخرى.");
    } finally {
      setBusy(false);
    }
  }

  return createPortal(
    <section className="panel excel-import-panel">
      <div className="excel-import-head">
        <div>
          <h2>إضافة المنتجات من Excel</h2>
          <p>ارفع ملف المنتجات مرة واحدة بدل إضافة كل منتج يدويًا.</p>
        </div>
        <label className="excel-file-button">
          اختيار ملف Excel
          <input type="file" accept=".xlsx,.xls" onChange={readExcel} />
        </label>
      </div>

      <div className="excel-columns">
        الأعمدة المدعومة: <b>اسم المنتج</b>، <b>السعر</b>، الكمية، الوحدة، القسم، الوصف، الصورة، متاح، الأكثر طلبًا، عرض.
      </div>

      {fileName && <div className="excel-file-name">الملف: <b>{fileName}</b></div>}

      {rows.length > 0 && <>
        <div className="excel-summary">
          <span>إجمالي الصفوف <b>{rows.length}</b></span>
          <span className="excel-ok">صالحة <b>{valid.length}</b></span>
          <span className={invalid.length ? "excel-bad" : ""}>بها أخطاء <b>{invalid.length}</b></span>
        </div>

        <div className="excel-preview">
          <table>
            <thead><tr><th>الصف</th><th>المنتج</th><th>القسم</th><th>السعر</th><th>الحالة</th></tr></thead>
            <tbody>
              {rows.slice(0, 12).map(({ product, errors }) => <tr key={product._row}>
                <td>{product._row}</td>
                <td>{product.name || "-"}</td>
                <td>{product.menuCategoryName}</td>
                <td>{Number.isFinite(product.price) ? product.price : "-"}</td>
                <td>{errors.length ? <span className="excel-error-text">{errors.join("، ")}</span> : <span className="excel-success-text">جاهز</span>}</td>
              </tr>)}
            </tbody>
          </table>
          {rows.length > 12 && <small>معاينة أول 12 صف فقط — سيتم استيراد كل الصفوف الصحيحة.</small>}
        </div>

        <div className="excel-actions">
          <button type="button" className="excel-clear" onClick={() => { setRows([]); setFileName(""); }} disabled={busy}>إلغاء</button>
          <button type="button" className="excel-import" onClick={importProducts} disabled={busy || !valid.length}>{busy ? "جاري الاستيراد..." : `استيراد ${valid.length} منتج`}</button>
        </div>
      </>}
    </section>,
    target
  );
}
