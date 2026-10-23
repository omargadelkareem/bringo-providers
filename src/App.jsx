import {
  Navigate, NavLink, Outlet, Route, Routes, useParams
} from "react-router-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bell, Boxes, ClipboardList, LayoutDashboard, LogOut, Menu,
  PackageCheck, Settings, Store, WalletCards, X, Bike, Phone,
  MapPin, CheckCircle2, Clock3, UserRound, Banknote
} from "lucide-react";
import { onValue, push, ref, remove, set, update } from "firebase/database";
import { db } from "./firebase";
import { useAuth } from "./context";
import { S, labels, money, date, normalizeStatus, isAccounting } from "./orders";

const now = () => Date.now();

function items(order) {
  return Array.isArray(order?.items) ? order.items : Object.values(order?.items || {});
}
function num(...values) {
  for (const v of values) {
    const n = Number(v);
    if (Number.isFinite(n) && n !== 0) return n;
  }
  return 0;
}
function productsTotal(o) {
  const direct = num(o?.subtotal,o?.productsTotal,o?.itemsTotal,o?.cartTotal);
  if (direct > 0) return direct;
  const calculated = items(o).reduce((s,x)=>s+Number(x?.quantity||x?.qty||1)*Number(x?.price||x?.unitPrice||0),0);
  if (calculated > 0) return calculated;
  return Math.max(0,Number(o?.total||0)-Number(o?.deliveryFee||0)+Number(o?.discount||0));
}
function deliveryFee(o){ return num(o?.deliveryFee,o?.shippingFee); }
function grandTotal(o){ return num(o?.total,o?.grandTotal,o?.finalTotal) || Math.max(0,productsTotal(o)+deliveryFee(o)-Number(o?.discount||0)); }
function sameDay(ts,d=new Date()){ if(!ts)return false;const x=new Date(Number(ts));return x.toDateString()===d.toDateString(); }

function Guard({children}) {
  const {user,store,loading,error}=useAuth();
  if(loading)return <div className="screen-center"><div className="loader"/></div>;
  if(!user)return <Navigate to="/login"/>;
  if(error||!store)return <div className="screen-center"><div className="state"><h2>تعذر فتح الحساب</h2><p>{error}</p></div></div>;
  return children;
}

function Login(){
  const{user,login}=useAuth();
  const[email,setEmail]=useState("");
  const[password,setPassword]=useState("");
  const[err,setErr]=useState("");
  const[busy,setBusy]=useState(false);
  if(user)return <Navigate to="/"/>;
  async function go(e){
    e.preventDefault();
    try{setBusy(true);setErr("");await login(email,password)}
    catch(e){setErr(e?.message||"بيانات الدخول غير صحيحة")}
    finally{setBusy(false)}
  }
  return <div className="login">
    <section className="login-brand"><div className="brand-mark">b<span/></div><h1>Bringo Provider</h1><p>كل دورة الطلب من الاستلام حتى التسوية في مكان واحد.</p></section>
    <form onSubmit={go} className="login-card"><small>لوحة مقدم الخدمة</small><h2>أهلاً بعودتك</h2>{err&&<div className="err">{err}</div>}
      <label>البريد الإلكتروني<input type="email" value={email} onChange={e=>setEmail(e.target.value)} required/></label>
      <label>كلمة المرور<input type="password" value={password} onChange={e=>setPassword(e.target.value)} required/></label>
      <button disabled={busy}>{busy?"جاري الدخول...":"دخول"}</button>
    </form>
  </div>;
}

function Layout(){
  const{store,provider,logout}=useAuth();
  const[open,setOpen]=useState(false);
  useNewOrderNotifications(store);
  const nav=[
    ["/","نظرة عامة",LayoutDashboard],
    ["/orders/new","طلبات جديدة",Bell],
    ["/orders/preparing","قيد التجهيز",ClipboardList],
    ["/orders/ready","جاهزة والطيار",PackageCheck],
    ["/orders/history","سجل الطلبات",Boxes],
    ["/products","المنتجات",Store],
    ["/settlements","التسويات",WalletCards],
    ["/settings","الإعدادات",Settings],
  ];
  async function toggle(){
    const next=store.isOpen===false;
    await update(ref(db,`stores/${store.id}`),{isOpen:next,acceptsOrders:next,updatedAt:now()});
  }
  return <div className="shell">
    <aside className={open?"open":""}>
      <header><div className="brand"><div className="brand-mark small">b<span/></div><b>Bringo</b></div><button className="icon-btn close" onClick={()=>setOpen(false)}><X/></button></header>
      <div className="store-card"><div className="store-icon"><Store/></div><div><b>{store.name}</b><small>{store.type||"متجر Bringo"}</small></div></div>
      <nav>{nav.map(([to,label,I])=><NavLink key={to} to={to} end={to==="/"} onClick={()=>setOpen(false)}><I size={19}/><span>{label}</span></NavLink>)}</nav>
      <button className="logout" onClick={logout}><LogOut size={19}/>تسجيل الخروج</button>
    </aside>
    <main>
      <div className="topbar">
        <button className="icon-btn menu" onClick={()=>setOpen(true)}><Menu/></button>
        <div className="welcome"><b>أهلاً، {provider?.name||"مقدم الخدمة"}</b><small>{store.name} • البيانات محدثة لحظيًا</small></div>
        <button className={`store-toggle ${store.isOpen===false?"closed":""}`} onClick={toggle}><span/>{store.isOpen===false?"المتجر مغلق":"المتجر مفتوح"}</button>
      </div>
      <div className="content"><Outlet/></div>
    </main>
    {open&&<button className="shade" onClick={()=>setOpen(false)}/>}
  </div>;
}

function useOrders(){
  const{store}=useAuth();
  const[orders,setOrders]=useState([]);
  const[loading,setLoading]=useState(true);
  useEffect(()=>{
    if(!store?.id){setOrders([]);setLoading(false);return;}
    setLoading(true);
    return onValue(ref(db,"orders"),snap=>{
      const data=snap.val()||{};
      const list=Object.entries(data)
        .map(([id,v])=>({id,...(v||{}),status:normalizeStatus(v||{})}))
        .filter(o => {
          const orderStoreId = String(
            o.storeId ?? o.store?.id ?? o.providerStoreId ?? ""
          ).trim();
          const currentStoreId = String(store.id ?? store.storeId ?? "").trim();
          return orderStoreId === currentStoreId;
        })
        .sort((a,b)=>Number(b.createdAt||b.updatedAt||0)-Number(a.createdAt||a.updatedAt||0));
      setOrders(list);setLoading(false);
    },()=>setLoading(false));
  },[store?.id]);
  return{orders,loading};
}

async function writeStatus(order,status,extra={}){
  const t=now();
  // status + orderStatus are both written intentionally because the current
  // Driver app still supports both fields.
  return update(ref(db,`orders/${order.id}`),{
    status,
    orderStatus:status,
    ...extra,
    updatedAt:t,
  });
}

function useNewOrderNotifications(store){
  const initialized=useRef(false);
  const known=useRef(new Set());
  useEffect(()=>{
    if(!store?.id)return;
    const ordersRef=ref(db,"orders");
    return onValue(ordersRef,s=>{
      const list=Object.entries(s.val()||{})
        .map(([id,v])=>({id,...v}))
        .filter(o=>String(o.storeId ?? o.store?.id ?? o.providerStoreId ?? "").trim() ===
          String(store.id ?? store.storeId ?? "").trim() &&
          normalizeStatus(o) === S.PENDING);
      const ids=new Set(list.map(o=>o.id));
      if(!initialized.current){known.current=ids;initialized.current=true;return;}
      const fresh=list.filter(o=>!known.current.has(o.id));
      known.current=ids;
      fresh.forEach(o=>{
        try{
          const C=window.AudioContext||window.webkitAudioContext;if(C){const c=new C(),osc=c.createOscillator(),g=c.createGain();osc.frequency.value=880;g.gain.value=.08;osc.connect(g);g.connect(c.destination);osc.start();osc.stop(c.currentTime+.35)}
        }catch{}
        if("Notification"in window&&Notification.permission==="granted"){
          new Notification("طلب جديد على Bringo",{body:`طلب #${o.id.slice(-6).toUpperCase()} • ${money(o.total)}`});
        }
      });
    });
  },[store?.id]);
}

function DriverBox({order}) {
  const status = normalizeStatus(order);
  const driverName = String(order.driverName || "").trim();
  const driverPhone = String(order.driverPhone || "").trim();
  const driverId = String(order.driverId || order.driverKey || "").trim();
  const hasDriver = Boolean(driverId || driverName || driverPhone);

  if (status === S.DONE) {
    return (
      <div className="driver-box completed-driver">
        <div className="driver-avatar"><CheckCircle2 /></div>
        <div>
          <small>التوصيل</small>
          <b>تم تسليم الطلب للعميل</b>
          <span>
            {driverName
              ? `تم التوصيل بواسطة ${driverName}`
              : "تم إغلاق رحلة التوصيل بنجاح"}
          </span>
        </div>
        {driverPhone && (
          <a className="mini-action" href={`tel:${driverPhone}`}>
            <Phone size={17} />
          </a>
        )}
      </div>
    );
  }

  if ([S.PICKED, S.WAY].includes(status)) {
    return (
      <div className="driver-box">
        <div className="driver-avatar"><Bike /></div>
        <div>
          <small>حالة التوصيل</small>
          <b>{status === S.PICKED ? "استلم الطيار الطلب" : "الطلب في الطريق للعميل"}</b>
          <span>{driverName || "طيار Bringo"}{driverPhone ? ` • ${driverPhone}` : ""}</span>
        </div>
        {driverPhone && (
          <a className="mini-action" href={`tel:${driverPhone}`}>
            <Phone size={17} />
          </a>
        )}
      </div>
    );
  }

  if (hasDriver || status === S.ASSIGNED) {
    return (
      <div className="driver-box">
        <div className="driver-avatar"><Bike /></div>
        <div>
          <small>الطيار المسؤول</small>
          <b>{driverName || "تم قبول الطلب بواسطة طيار"}</b>
          <span>{driverPhone || "الطيار متجه لاستلام الطلب"}</span>
        </div>
        {driverPhone && (
          <a className="mini-action" href={`tel:${driverPhone}`}>
            <Phone size={17} />
          </a>
        )}
      </div>
    );
  }

  if (status === S.READY) {
    return (
      <div className="driver-box waiting">
        <div className="driver-avatar"><Clock3 /></div>
        <div>
          <small>الطيار</small>
          <b>الطلب متاح للطيارين</b>
          <span>سيظهر الطيار هنا فور قبول الطلب.</span>
        </div>
      </div>
    );
  }

  return null;
}

function OrderCard({order,actions=true}){
  const status=normalizeStatus(order);
  const productItems=items(order);
  return <article className="order-card">
    <header><div><span className="order-number">#{order.id.slice(-6).toUpperCase()}</span><small>{date(order.createdAt)}</small></div><span className={`status ${status}`}>{labels[status]||status}</span></header>
    <div className="route">
      <div><UserRound/><span><small>العميل</small><b>{order.customerName||"عميل Bringo"}</b></span></div>
      <div><MapPin/><span><small>عنوان التسليم</small><b>{order.customerAddress||order.address||"العنوان غير متاح"}</b></span></div>
    </div>
    <DriverBox order={order}/>
    <div className="item-list">{productItems.slice(0,3).map((x,i)=><div key={i}><span>{x.quantity||x.qty||1} × {x.name||x.productName||"منتج"}</span><b>{money(Number(x.quantity||x.qty||1)*Number(x.price||x.unitPrice||0))}</b></div>)}{productItems.length>3&&<small>+ {productItems.length-3} منتجات أخرى</small>}</div>
    <div className="order-total"><span>إجمالي الطلب</span><b>{money(grandTotal(order))}</b></div>
    {actions&&<OrderActions order={order}/>}
  </article>;
}

function OrderActions({order}){
  const status=normalizeStatus(order);
  if(status===S.PENDING)return <footer className="actions"><button className="secondary" onClick={()=>writeStatus(order,S.REJECTED,{rejectedAt:now()})}>رفض</button><button onClick={()=>writeStatus(order,S.PREPARING,{acceptedAt:now(),preparingAt:now()})}>قبول وبدء التجهيز</button></footer>;
  if(status===S.PREPARING)return <footer className="actions"><button onClick={()=>writeStatus(order,S.READY,{readyAt:now()})}>تم التجهيز • اطلب طيار</button></footer>;
  return null;
}

function Title({title,sub,right}){
  return <div className="page-title"><div><small>Bringo Provider</small><h1>{title}</h1><p>{sub}</p></div>{right}</div>;
}
function Empty({title="لا توجد طلبات هنا",text="سيتم تحديث البيانات تلقائيًا عند حدوث أي تغيير."}){
  return <div className="empty"><CheckCircle2/><h3>{title}</h3><p>{text}</p></div>;
}

function Dashboard() {
  const { orders, loading } = useOrders();

  const stats = useMemo(() => {
    const pending = orders.filter(o => normalizeStatus(o) === S.PENDING);
    const preparing = orders.filter(o => normalizeStatus(o) === S.PREPARING);
    const readyOrDriver = orders.filter(o =>
      [S.READY, S.ASSIGNED, S.PICKED, S.WAY].includes(normalizeStatus(o))
    );
    const done = orders.filter(o => normalizeStatus(o) === S.DONE);

    return {
      pending,
      preparing,
      readyOrDriver,
      done,
      today: orders.filter(o => sameDay(o.createdAt)).length,
    };
  }, [orders]);

  const attention = [...stats.pending, ...stats.preparing]
    .sort((a,b) => Number(b.createdAt || 0) - Number(a.createdAt || 0))
    .slice(0, 3);

  return (
    <>
      <Title
        title="نظرة عامة"
        sub="ملخص سريع لحالة المتجر والطلبات"
      />

      <div className="stats overview-stats">
        <div>
          <span>طلبات جديدة</span>
          <b>{stats.pending.length}</b>
        </div>
        <div>
          <span>قيد التجهيز</span>
          <b>{stats.preparing.length}</b>
        </div>
        <div>
          <span>جاهزة / مع الطيار</span>
          <b>{stats.readyOrDriver.length}</b>
        </div>
        <div>
          <span>مكتملة</span>
          <b>{stats.done.length}</b>
        </div>
      </div>

      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>تحتاج إجراء الآن</h2>
            <p>الطلبات الجديدة أو الجاري تجهيزها فقط.</p>
          </div>
        </div>

        {loading ? (
          <div className="loader" />
        ) : attention.length ? (
          <div className="orders-grid compact-orders">
            {attention.map(order => (
              <OrderCard key={order.id} order={order} />
            ))}
          </div>
        ) : (
          <Empty
            title="كل شيء تمام"
            text="لا توجد طلبات تحتاج إجراء من المتجر الآن."
          />
        )}
      </section>
    </>
  );
}

function Orders(){
  const{mode}=useParams();
  const{orders,loading}=useOrders();
  const config={
    new:{title:"الطلبات الجديدة",sub:"راجع الطلب ثم ابدأ التجهيز.",statuses:[S.PENDING]},
    preparing:{title:"قيد التجهيز",sub:"الطلبات التي يعمل عليها المتجر الآن.",statuses:[S.PREPARING]},
    ready:{title:"جاهزة والطيار",sub:"شاهد الطيار الذي قبل الطلب وحالة الاستلام لحظيًا.",statuses:[S.READY,S.ASSIGNED,S.PICKED,S.WAY]},
    history:{title:"سجل الطلبات",sub:"أرشيف الطلبات المكتملة والمرفوضة والملغاة.",statuses:[S.DONE,S.REJECTED,S.CANCELLED]},
  }[mode]||{title:"الطلبات",sub:"",statuses:[]};
  const list=orders.filter(o=>config.statuses.includes(normalizeStatus(o)));
  return <>
    <Title title={config.title} sub={config.sub}/>
    {loading?<div className="loader"/>:list.length?<div className="orders-grid">{list.map(o=><OrderCard key={o.id} order={o}/>)}</div>:<section className="panel"><Empty/></section>}
  </>;
}

function Products(){
  const{store}=useAuth();
  const[products,setProducts]=useState([]);
  const[f,setF]=useState({name:"",price:"",stock:"",unit:"قطعة",menuCategoryName:"",image:"",isAvailable:true});
  const[edit,setEdit]=useState(null);
  useEffect(()=>onValue(ref(db,"products"),s=>{const d=s.val()||{};setProducts(Object.entries(d).map(([id,v])=>({id,...v})).filter(x=>String(x.storeId)===String(store.id))) }),[store.id]);
  async function save(e){e.preventDefault();if(!f.name||+f.price<=0)return alert("اكتب الاسم والسعر");const p={...f,price:+f.price,stock:+(f.stock||0),storeId:store.id,storeName:store.name,storeType:store.type,updatedAt:now()};if(edit)await update(ref(db,`products/${edit}`),p);else{const q=push(ref(db,"products"));await set(q,{id:q.key,...p,createdAt:now()})}setF({name:"",price:"",stock:"",unit:"قطعة",menuCategoryName:"",image:"",isAvailable:true});setEdit(null)}
  return <><Title title="المنتجات" sub="إدارة قائمة منتجات متجرك"/><div className="products"><form className="panel form" onSubmit={save}><h2>{edit?"تعديل المنتج":"إضافة منتج"}</h2>{["name","price","stock","unit","menuCategoryName","image"].map(k=><label key={k}>{({name:"الاسم",price:"السعر",stock:"المخزون",unit:"الوحدة",menuCategoryName:"القسم",image:"رابط الصورة"})[k]}<input type={["price","stock"].includes(k)?"number":"text"} value={f[k]} onChange={e=>setF({...f,[k]:e.target.value})}/></label>)}<label className="check"><input type="checkbox" checked={f.isAvailable} onChange={e=>setF({...f,isAvailable:e.target.checked})}/>متاح للبيع</label><button>{edit?"حفظ التعديلات":"إضافة المنتج"}</button></form><div className="panel table"><h2>المنتجات ({products.length})</h2><table><thead><tr><th>المنتج</th><th>القسم</th><th>السعر</th><th>الحالة</th><th/></tr></thead><tbody>{products.map(p=><tr key={p.id}><td>{p.name}</td><td>{p.menuCategoryName||"-"}</td><td>{money(p.price)}</td><td>{p.isAvailable===false?"غير متاح":"متاح"}</td><td><button className="tiny" onClick={()=>{setEdit(p.id);setF({...f,...p})}}>تعديل</button><button className="tiny danger" onClick={()=>confirm("حذف المنتج؟")&&remove(ref(db,`products/${p.id}`))}>حذف</button></td></tr>)}</tbody></table></div></div></>;
}

function Settlements(){
  const{orders,loading}=useOrders();
  const report=useMemo(()=>{
    // Accounting listens to the SAME live orders stream and understands driver statuses.
    const list=orders.filter(isAccounting);
    const done=list.filter(o=>normalizeStatus(o)===S.DONE);
    const sales=list.reduce((s,o)=>s+productsTotal(o),0);
    const delivery=list.reduce((s,o)=>s+deliveryFee(o),0);
    const commission=list.reduce((s,o)=>s+Number(o.platformCommission||0),0);
    return{list,done,sales,delivery,commission,net:sales-commission};
  },[orders]);
  return <>
    <Title title="التسويات" sub="مرجع مالي لحظي مبني على نفس الطلبات الفعلية"/>
    <div className="stats compact">
      <div><span>طلبات بالحركة المالية</span><b>{report.list.length}</b></div>
      <div><span>طلبات مكتملة</span><b>{report.done.length}</b></div>
      <div><span>مبيعات المنتجات</span><b>{money(report.sales)}</b></div>
      <div><span>رسوم التوصيل</span><b>{money(report.delivery)}</b></div>
      <div><span>عمولة Bringo</span><b>{money(report.commission)}</b></div>
      <div><span>مستحق المتجر</span><b>{money(report.net)}</b></div>
    </div>
    <section className="panel table">
      <div className="panel-head"><div><h2>حركة الطلبات</h2><p>تظهر بمجرد استلام الطيار للطلب وتستمر حتى اكتمال التوصيل.</p></div></div>
      {loading?<div className="loader"/>:report.list.length?<table><thead><tr><th>الطلب</th><th>الحالة</th><th>الطيار</th><th>المنتجات</th><th>التوصيل</th><th>الإجمالي</th><th>آخر تحديث</th></tr></thead><tbody>{report.list.map(o=><tr key={o.id}><td>#{o.id.slice(-6).toUpperCase()}</td><td><span className={`status ${normalizeStatus(o)}`}>{labels[normalizeStatus(o)]}</span></td><td>{o.driverName||"طيار Bringo"}<small className="cell-small">{o.driverPhone||""}</small></td><td>{money(productsTotal(o))}</td><td>{money(deliveryFee(o))}</td><td>{money(grandTotal(o))}</td><td>{date(o.updatedAt||o.createdAt)}</td></tr>)}</tbody></table>:<Empty title="لا توجد حركة مالية بعد" text="ستظهر الطلبات هنا تلقائيًا بعد استلام الطيار لها."/>}
    </section>
  </>;
}

function SettingsPage() {
  const { store } = useAuth();
  const [f, setF] = useState(store);

  useEffect(() => {
    setF(store);
  }, [store]);

  async function save(e) {
    e.preventDefault();

    await update(ref(db, `stores/${store.id}`), {
      ...f,
      preparationTime: Number(f?.preparationTime || 25),
      updatedAt: now(),
    });

    alert("تم الحفظ");
  }

  const fields = [
    { key: "name", label: "اسم المتجر" },
    { key: "phone", label: "الهاتف" },
    { key: "address", label: "العنوان" },
    { key: "preparationTime", label: "وقت التجهيز بالدقائق" },
  ];

  return (
    <>
      <Title
        title="إعدادات المتجر"
        sub="بيانات التشغيل والاستقبال"
      />

      <form className="panel form settings" onSubmit={save}>
        {fields.map((field) => (
          <label key={field.key}>
            {field.label}
            <input
              type={field.key === "preparationTime" ? "number" : "text"}
              value={f?.[field.key] ?? ""}
              onChange={(e) =>
                setF((current) => ({
                  ...current,
                  [field.key]: e.target.value,
                }))
              }
            />
          </label>
        ))}

        <label className="check">
          <input
            type="checkbox"
            checked={f?.isOpen !== false}
            onChange={(e) =>
              setF((current) => ({
                ...current,
                isOpen: e.target.checked,
              }))
            }
          />
          المتجر مفتوح
        </label>

        <label className="check">
          <input
            type="checkbox"
            checked={f?.acceptsOrders !== false}
            onChange={(e) =>
              setF((current) => ({
                ...current,
                acceptsOrders: e.target.checked,
              }))
            }
          />
          استقبال الطلبات
        </label>

        <button type="submit">حفظ الإعدادات</button>
      </form>
    </>
  );
}

export default function App(){
  return <Routes>
    <Route path="/login" element={<Login/>}/>
    <Route element={<Guard><Layout/></Guard>}>
      <Route index element={<Dashboard/>}/>
      <Route path="orders/:mode" element={<Orders/>}/>
      <Route path="products" element={<Products/>}/>
      <Route path="settlements" element={<Settlements/>}/>
      <Route path="settings" element={<SettingsPage/>}/>
    </Route>
    <Route path="*" element={<Navigate to="/"/>}/>
  </Routes>;
}
