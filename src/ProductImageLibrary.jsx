import { useEffect, useMemo, useState } from "react";
import { onValue, ref } from "firebase/database";
import { db } from "./firebase";
import "./productImageLibrary.css";

const normalize = (value) => String(value || "").trim().toLocaleLowerCase("ar-EG").replace(/[أإآ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه").replace(/\s+/g, " ");
function items(data) {
  return Object.entries(data || {}).map(([id, value]) => ({ id, ...value })).filter(item => item.imageStatus === "approved" && /^https:\/\//i.test(item.imageUrl || item.image || ""));
}
export default function ProductImageLibrary({ onSelect, onClose }) {
  const [products, setProducts] = useState([]);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState(false);
  useEffect(() => {
    const unsubscribe = onValue(ref(db, "catalogProducts"), snap => {
      setProducts(items(snap.val()));
      setBusy(false);
      setError(false);
    }, () => { setBusy(false); setError(true); });
    return () => unsubscribe();
  }, []);
  const filtered = useMemo(() => {
    const q = normalize(query);
    return products.filter(item => !q || [item.nameAr, item.name, item.brand, item.barcode, item.size].some(value => normalize(value).includes(q))).slice(0, 60);
  }, [products, query]);
  return <div className="bringo-library-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="bringo-library-dialog" role="dialog" aria-modal="true" aria-label="مكتبة صور برينجو">
      <header className="bringo-library-header"><div><h3>مكتبة صور برينجو</h3><p>اختار صورة منتج معتمدة من المكتبة المشتركة</p></div><button type="button" onClick={onClose} aria-label="إغلاق">×</button></header>
      <input autoFocus className="bringo-library-search" placeholder="ابحث باسم المنتج أو الماركة أو الباركود" value={query} onChange={e => setQuery(e.target.value)} />
      {busy ? <p className="bringo-library-state">جاري تحميل الصور...</p> : error ? <p className="bringo-library-state">تعذر تحميل المكتبة. تحقق من الاتصال وصلاحية القراءة.</p> : filtered.length ? <div className="bringo-library-grid">{filtered.map(item => {
        const image = item.imageUrl || item.image;
        return <button type="button" className="bringo-library-product" key={item.id} onClick={() => { onSelect({ image, catalogProductId: item.id }); onClose(); }}>
          <img src={image} alt={item.nameAr || item.name || "صورة منتج"} loading="lazy" />
          <strong>{item.nameAr || item.name || "منتج"}</strong><small>{[item.brand, item.size].filter(Boolean).join(" · ")}</small>
        </button>;
      })}</div> : <p className="bringo-library-state">{products.length ? "مفيش منتج مطابق لبحثك" : "مكتبة المنتجات لسه فاضية. الأدمن هيضيف الصور المعتمدة هنا."}</p>}
      <footer className="bringo-library-footer">{filtered.length} صورة ظاهرة من أصل {products.length} صورة معتمدة</footer>
    </section>
  </div>;
}
