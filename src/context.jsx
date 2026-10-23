// src/context.jsx
import { createContext, useContext, useEffect, useState } from "react";
import { get, ref } from "firebase/database";
import { db } from "./firebase";

const AuthContext = createContext(null);
const SESSION_KEY = "bringo_provider_session";

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [provider, setProvider] = useState(null);
  const [store, setStore] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => { restoreSession(); }, []);

  function clearAuthState() {
    localStorage.removeItem(SESSION_KEY);
    setUser(null); setProvider(null); setStore(null);
  }

  function applyAuthData({ providerId, providerData, storeId, storeData }) {
    setUser({ id: providerId, email: providerData.email || "" });
    setProvider({ ...providerData, id: providerId, storeId });
    setStore({ ...storeData, id: storeId });
  }

  async function loadAccount(providerId, fallbackStoreId = "") {
    const providerSnapshot = await get(ref(db, `providerUsers/${providerId}`));
    if (!providerSnapshot.exists()) throw new Error("حساب مقدم الخدمة غير موجود");

    const providerData = providerSnapshot.val();
    if (providerData?.isActive === false) throw new Error("تم إيقاف حساب مقدم الخدمة");

    const storeId = String(providerData?.storeId || fallbackStoreId || "").trim();
    if (!storeId) throw new Error("الحساب غير مربوط بمتجر");

    const storeSnapshot = await get(ref(db, `stores/${storeId}`));
    if (!storeSnapshot.exists()) throw new Error("المتجر المرتبط بالحساب غير موجود");

    const storeData = storeSnapshot.val();
    if (storeData?.isActive === false) throw new Error("تم إيقاف المتجر من الإدارة");

    return { providerId, providerData, storeId, storeData };
  }

  async function restoreSession() {
    try {
      setLoading(true); setError("");
      const raw = localStorage.getItem(SESSION_KEY);
      if (!raw) { clearAuthState(); return; }
      const session = JSON.parse(raw);
      if (!session?.providerId) { clearAuthState(); return; }
      applyAuthData(await loadAccount(session.providerId, session.storeId));
    } catch (e) {
      clearAuthState();
      setError(e?.message || "تعذر استعادة جلسة تسجيل الدخول");
    } finally { setLoading(false); }
  }

  async function login(email, password) {
    try {
      setLoading(true); setError("");
      const e = String(email || "").trim().toLowerCase();
      const p = String(password || "").trim();
      if (!e || !p) throw new Error("اكتب البريد وكلمة المرور");

      const snap = await get(ref(db, "providerUsers"));
      const all = snap.val() || {};
      const matches = Object.entries(all)
        .filter(([,v]) =>
          String(v?.email || "").trim().toLowerCase() === e &&
          String(v?.password || "").trim() === p
        )
        .sort((a,b) => Number(b[1]?.createdAt || 0) - Number(a[1]?.createdAt || 0));

      if (!matches.length) throw new Error("البريد الإلكتروني أو كلمة المرور غير صحيحة");

      let selected = null;
      for (const [providerId, providerData] of matches) {
        if (providerData?.isActive === false) continue;
        try { selected = await loadAccount(providerId, providerData?.storeId); break; }
        catch (_) {}
      }
      if (!selected) throw new Error("لا يوجد متجر صالح مرتبط بهذا الحساب");

      localStorage.setItem(SESSION_KEY, JSON.stringify({
        providerId: selected.providerId,
        storeId: selected.storeId,
        loggedAt: Date.now(),
      }));
      applyAuthData(selected);
      return true;
    } catch (e) {
      clearAuthState();
      setError(e?.message || "بيانات الدخول غير صحيحة");
      throw e;
    } finally { setLoading(false); }
  }

  function logout() { clearAuthState(); setError(""); }

  return <AuthContext.Provider value={{
    user, provider, store, loading, error, login, logout
  }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
