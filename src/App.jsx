import {imageGroup,fetchGroupImage} from "./autoProductImages";
import ProductImageLibrary from "./ProductImageLibrary";
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
      <div className="content">{!validCoordinates(store?.latitude ?? "", store?.longitude ?? "") && <div className="provider-location-warning"><MapPin size={20}/><span>موقع متجرك غير محدد. حدده من الإعدادات لتفعيل حساب رسوم التوصيل للعملاء.</span><NavLink to="/settings">تحديد الموقع</NavLink></div>}<Outlet/></div>
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
  const {store}=useAuth();
  const [products,setProducts]=useState([]);
  const [f,setF]=useState({name:"",price:"",stock:"",unit:"قطعة",menuCategoryName:"",image:"",isAvailable:true});
  const [edit,setEdit]=useState(null);
  const [uploading,setUploading]=useState(false);
  const [saving,setSaving]=useState(false);
  const [imageError,setImageError]=useState("");
  const [libraryOpen,setLibraryOpen]=useState(false);
  const [bulkOpen,setBulkOpen]=useState(false);
  const [autoBusy,setAutoBusy]=useState(false);
  const [autoStatus,setAutoStatus]=useState("");
  async function autoAssignImages(){
    if(autoBusy)return;
    const missing=products.filter(p=>!p.image);
    if(!missing.length){setAutoStatus("كل المنتجات لديها صور بالفعل");return;}
    if(!confirm(`سيتم البحث عن صور توضيحية وإسنادها تلقائيًا للمنتجات المناسبة من أصل ${missing.length} منتج بدون صورة. المنتجات غير المعروفة والأدوية ستُترك بدون تغيير. متابعة؟`))return;
    setAutoBusy(true);setAutoStatus("جاري البحث عن الصور وإسنادها...");
    const cache=new Map();let saved=0,skipped=0,failed=0;
    for(const product of missing){
      const group=imageGroup(product);
      if(!group){skipped++;continue;}
      try{
        let photo=cache.get(group.query);
        if(photo===undefined){photo=await fetchGroupImage(group);cache.set(group.query,photo);}
        if(!photo){skipped++;continue;}
        await update(ref(db,`products/${product.id}`),{image:photo.image,imageCredit:photo.imageCredit,imageLicense:photo.imageLicense,imageSourceUrl:photo.imageSourceUrl,updatedAt:now()});saved++;
        setAutoStatus(`جاري الإسناد: ${saved} صورة...`);
      }catch(error){failed++;}
    }
    setAutoStatus(`اكتمل الإسناد: ${saved} صورة، ${skipped} منتج بدون تطابق، ${failed} فشل. راجع الصور التوضيحية قبل عرضها للعملاء.`);
    setAutoBusy(false);
  }
  const [bulkLibraryOpen,setBulkLibraryOpen]=useState(false);
  const [bulkTarget,setBulkTarget]=useState(null);
  const [bulkImages,setBulkImages]=useState({});
  const [bulkSelected,setBulkSelected]=useState({});
  const [bulkSaving,setBulkSaving]=useState(false);
  const [bulkResult,setBulkResult]=useState("");
  const imageKey=v=>String(v||"").toLowerCase().replace(/[أإآ]/g,"ا").replace(/ى/g,"ي").replace(/ة/g,"ه").replace(/[^\\p{L}\\p{N}]+/gu," ").trim().replace(/\\s+/g," ");
  const ignoreWords=new Set(["كبير","صغير","وسط","دبل","سنجل","وجبة","وجبات","طبق","سندوتش","ساندوتش","قطعة","قطع","حجم","عرض","سوبر","جامبو","عادي","اكسترا","مع","بدون"]);
  const signature=v=>imageKey(v).split(" ").filter(x=>x.length>1&&!ignoreWords.has(x)).join(" ");
  const unpictured=products.filter(p=>!p.image);
  const suggestions=unpictured.map(p=>{
    const key=signature(p.name);
    const candidates=products.filter(x=>x.image&&x.id!==p.id&&signature(x.name)===key&&key.length>2);
    const candidate=candidates[0];
    return {product:p,candidate};
  });
  async function applyBulkImages(){
    const selected=suggestions.filter(x=>bulkSelected[x.product.id]&&bulkImages[x.product.id]?.image);
    if(!selected.length)return;
    setBulkSaving(true);setBulkResult("");
    let saved=0,failed=0;
    for(const {product} of selected){
      try{
        const chosen=bulkImages[product.id];
        await update(ref(db,`products/${product.id}`),{image:chosen.image,imageCredit:chosen.imageCredit||"",imageLicense:chosen.imageLicense||"",imageSourceUrl:chosen.imageSourceUrl||"",updatedAt:now()});
        saved++;
      }catch(e){failed++;}
    }
    setBulkSaving(false);
    setBulkResult(`تم إسناد ${saved} صورة${failed?`، وتعذر حفظ ${failed}`:""}`);
    setBulkSelected({});setBulkImages({});
  }

  useEffect(()=>onValue(ref(db,"products"),snap=>{
    const data=snap.val()||{};
    setProducts(Object.entries(data).map(([id,v])=>({id,...v})).filter(x=>String(x.storeId)===String(store.id)));
  }),[store.id]);
  async function uploadImage(event){
    const file=event.target.files?.[0];
    if(!file)return;
    event.target.value="";
    if(!["image/jpeg","image/png","image/webp"].includes(file.type)){setImageError("اختر صورة JPG أو PNG أو WEBP");return;}
    if(file.size>5*1024*1024){setImageError("الصورة يجب أن تكون أقل من 5MB");return;}
    setUploading(true);setImageError("");
    try{
      const cloud=import.meta.env.VITE_CLOUDINARY_CLOUD_NAME?.trim()||"q0cty6ky";
      const preset=import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET?.trim()||"bringo_products";
      const data=new FormData();
      data.append("file",file);
      data.append("upload_preset",preset);
      const response=await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(cloud)}/image/upload`,{method:"POST",body:data});
      const result=await response.json().catch(()=>({}));
      if(!response.ok||!result.secure_url)throw new Error(result.error?.message||`فشل الرفع (HTTP ${response.status})`);
      setF(prev=>({...prev,image:result.secure_url}));
    }catch(error){setImageError(`تعذر رفع الصورة: ${error.message}`);}
    finally{setUploading(false);}
  }
  async function save(e){
    e.preventDefault();
    if(uploading||saving)return;
    if(!f.name.trim()||!(+f.price>0)){alert("اكتب الاسم والسعر");return;}
    setSaving(true);
    try{
      const p={...f,price:+f.price,stock:+(f.stock||0),storeId:store.id,storeName:store.name,storeType:store.type,updatedAt:now()};
      if(edit)await update(ref(db,`products/${edit}`),p);
      else{const q=push(ref(db,"products"));await set(q,{id:q.key,...p,createdAt:now()});}
      setF({name:"",price:"",stock:"",unit:"قطعة",menuCategoryName:"",image:"",isAvailable:true});
      setEdit(null);setImageError("");
    }catch(error){alert(`تعذر حفظ المنتج: ${error.message}`);}
    finally{setSaving(false);}
  }
  return <>{bulkOpen&&<div className="bringo-library-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget&&!bulkSaving)setBulkOpen(false);}}><section className="bringo-library-dialog" role="dialog" aria-modal="true" aria-label="إسناد صور للمنتجات"><header className="bringo-library-header"><div><h3>إسناد صور للمنتجات</h3><p>مطابقة دقيقة للأسماء الموجودة في متجرك فقط. راجع كل اقتراح قبل التطبيق.</p></div><button type="button" disabled={bulkSaving} onClick={()=>setBulkOpen(false)}>×</button></header><div style={{overflow:"auto",padding:"12px 20px",display:"grid",gap:12}}>{suggestions.length?suggestions.map(({product,candidate})=>{const chosen=bulkImages[product.id]||candidate;return <div key={product.id} style={{display:"flex",alignItems:"center",gap:12,borderBottom:"1px solid #eee",paddingBottom:12}}><input type="checkbox" disabled={!chosen?.image||bulkSaving} checked={!!bulkSelected[product.id]&&!!chosen?.image} onChange={e=>setBulkSelected(prev=>({...prev,[product.id]:e.target.checked}))}/>{chosen?.image?<img src={chosen.image} alt="" style={{width:65,height:65,objectFit:"contain"}}/>:<div style={{width:65,height:65,background:"#f1f5f3",borderRadius:8}}/>}<div style={{flex:1}}><strong>{product.name}</strong><div style={{fontSize:12,color:"#64748b"}}>{chosen?.image?"صورة مقترحة — تأكد من مطابقتها":"لا توجد مطابقة دقيقة"}</div></div><button type="button" disabled={bulkSaving} onClick={()=>{setBulkTarget(product.id);setBulkLibraryOpen(true);}}>اختيار صورة</button></div>;}):<p>كل منتجات المتجر لديها صور بالفعل.</p>}</div><footer className="bringo-library-footer"><button type="button" disabled={bulkSaving||!suggestions.some(x=>bulkSelected[x.product.id]&&(bulkImages[x.product.id]||x.candidate)?.image)} onClick={async()=>{const selected=suggestions.filter(x=>bulkSelected[x.product.id]&&(bulkImages[x.product.id]||x.candidate)?.image);setBulkSaving(true);setBulkResult("");let saved=0,failed=0;for(const {product,candidate} of selected){const chosen=bulkImages[product.id]||candidate;try{await update(ref(db,`products/${product.id}`),{image:chosen.image,imageCredit:chosen.imageCredit||"",imageLicense:chosen.imageLicense||"",imageSourceUrl:chosen.imageSourceUrl||"",updatedAt:now()});saved++;}catch(e){failed++;}}setBulkSaving(false);setBulkResult(`تم إسناد ${saved} صورة${failed?`، فشل ${failed}`:""}`);setBulkSelected({});setBulkImages({});}}>{bulkSaving?"جاري حفظ الصور...":"تطبيق الصور المحددة"}</button>{bulkResult&&<p role="status">{bulkResult}</p>}</footer></section></div>}{bulkLibraryOpen&&<ProductImageLibrary onSelect={item=>{setBulkImages(prev=>({...prev,[bulkTarget]:{image:item.image,imageCredit:item.credit||"",imageLicense:item.license||"",imageSourceUrl:item.sourceUrl||""}}));setBulkSelected(prev=>({...prev,[bulkTarget]:true}));}} onClose={()=>setBulkLibraryOpen(false)}/>} {libraryOpen&&<ProductImageLibrary onSelect={item=>{setF(prev=>({...prev,image:item.image,imageCredit:item.credit||"",imageLicense:item.license||"",imageSourceUrl:item.sourceUrl||""}));setImageError("");}} onClose={()=>setLibraryOpen(false)}/>}<Title title="المنتجات" sub="إدارة قائمة منتجات متجرك"/><div className="products">
    <form className="panel form" onSubmit={save}><h2>{edit?"تعديل المنتج":"إضافة منتج"}</h2>
      {["name","price","stock","unit","menuCategoryName"].map(k=><label key={k}>{({name:"الاسم",price:"السعر",stock:"المخزون",unit:"الوحدة",menuCategoryName:"القسم"})[k]}<input type={["price","stock"].includes(k)?"number":"text"} value={f[k]} onChange={e=>setF(prev=>({...prev,[k]:e.target.value}))}/></label>)}
      <button type="button" className="bringo-library-trigger" onClick={()=>setLibraryOpen(true)}>اختيار صورة من مكتبة برينجو</button>
      <label>أو ارفع صورة جديدة<input type="file" accept="image/jpeg,image/png,image/webp" disabled={uploading||saving} onChange={uploadImage}/></label>
      {uploading&&<small>جاري رفع الصورة...</small>}
      {imageError&&<small role="alert" style={{color:"#b91c1c"}}>{imageError}</small>}
      {f.image&&<div><img src={f.image} alt="معاينة صورة المنتج" style={{width:110,height:110,objectFit:"contain",borderRadius:10}} onError={()=>setImageError("رابط الصورة لا يعمل؛ اختر صورة جديدة")}/><small>تم تحديد صورة المنتج</small></div>}
      <label className="check"><input type="checkbox" checked={f.isAvailable} onChange={e=>setF(prev=>({...prev,isAvailable:e.target.checked}))}/>متاح للبيع</label>
      <button disabled={uploading||saving}>{uploading?"انتظر رفع الصورة":saving?"جاري الحفظ...":edit?"حفظ التعديلات":"إضافة المنتج"}</button>
    </form>
    <div className="panel table"><h2>المنتجات ({products.length})</h2><button type="button" className="bringo-library-trigger" disabled={autoBusy} onClick={autoAssignImages}>{autoBusy?"جاري الإسناد التلقائي...":"إسناد الصور تلقائيًا لكل المنتجات بدون صور"}</button>{autoStatus&&<p role="status" style={{fontSize:13}}>{autoStatus}</p>}<button type="button" className="bringo-library-trigger" onClick={()=>{setBulkOpen(true);setBulkResult("");}}>إسناد صور من المكتبة للمنتجات ({unpictured.length} بدون صور)</button><table><thead><tr><th>المنتج</th><th>القسم</th><th>السعر</th><th>الحالة</th><th/></tr></thead><tbody>{products.map(p=><tr key={p.id}><td>{p.name}</td><td>{p.menuCategoryName||"-"}</td><td>{money(p.price)}</td><td>{p.isAvailable===false?"غير متاح":"متاح"}</td><td><button className="tiny" onClick={()=>{setEdit(p.id);setF({...f,...p});setImageError("");}}>تعديل</button><button className="tiny danger" onClick={()=>confirm("حذف المنتج؟")&&remove(ref(db,`products/${p.id}`))}>حذف</button></td></tr>)}</tbody></table></div>
  </div></>;
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

function validCoordinates(lat, lng) {
  const latitude = Number(lat), longitude = Number(lng);
  return lat !== "" && lng !== "" && lat !== null && lng !== null &&
    Number.isFinite(latitude) && Number.isFinite(longitude) &&
    latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180 &&
    !(latitude === 0 && longitude === 0);
}

function InteractiveStoreMap({ latitude, longitude, onChange }) {
  const nodeRef = useRef(null);
  const mapRef = useRef(null);
  const pinRef = useRef(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    const L = window.L;
    if (!L || !nodeRef.current || mapRef.current) return undefined;
    const hasLocation = validCoordinates(latitude, longitude);
    const center = hasLocation ? [Number(latitude), Number(longitude)] : [26.556, 31.694];
    const map = L.map(nodeRef.current, { scrollWheelZoom: false }).setView(center, hasLocation ? 16 : 12);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map);
    mapRef.current = map;
    if (hasLocation) pinRef.current = L.marker(center, { draggable: true }).addTo(map);
    const selected = (e) => onChangeRef.current(e.latlng.lat.toFixed(7), e.latlng.lng.toFixed(7));
    map.on("click", selected);
    const moved = (e) => selected({ latlng: e.target.getLatLng() });
    if (pinRef.current) pinRef.current.on("dragend", moved);
    const id = window.setTimeout(() => map.invalidateSize(), 100);
    return () => {
      window.clearTimeout(id);
      map.off("click", selected);
      map.remove();
      mapRef.current = null;
      pinRef.current = null;
    };
  }, []);

  useEffect(() => {
    const L = window.L, map = mapRef.current;
    if (!L || !map || !validCoordinates(latitude, longitude)) return;
    const coord = [Number(latitude), Number(longitude)];
    if (!pinRef.current) {
      pinRef.current = L.marker(coord, { draggable: true }).addTo(map);
      pinRef.current.on("dragend", e => {
        const point = e.target.getLatLng();
        onChangeRef.current(point.lat.toFixed(7), point.lng.toFixed(7));
      });
    } else {
      pinRef.current.setLatLng(coord);
    }
    map.panTo(coord);
  }, [latitude, longitude]);

  return <div ref={nodeRef} className="provider-interactive-map" aria-label="اضغط على موقع المتجر على الخريطة لتحديده"/>;
}

function StoreLocationPicker({latitude, longitude, onChange}) {
  const [locating, setLocating] = useState(false);
  const [message, setMessage] = useState("");
  const valid = validCoordinates(latitude, longitude);
  const lat = Number(latitude), lng = Number(longitude);
  const marker = valid ? `${lat},${lng}` : "";
  const mapUrl = valid
    ? `https://www.openstreetmap.org/export/embed.html?bbox=${lng-.006}%2C${lat-.004}%2C${lng+.006}%2C${lat+.004}&layer=mapnik&marker=${lat}%2C${lng}`
    : "";

  function locate() {
    if (!navigator.geolocation) {
      setMessage("المتصفح لا يدعم تحديد الموقع. يمكنك اختيار نقطة على الخريطة.");
      return;
    }
    setLocating(true);
    setMessage("");
    navigator.geolocation.getCurrentPosition(
      position => {
        onChange(position.coords.latitude.toFixed(7), position.coords.longitude.toFixed(7));
        setLocating(false);
        setMessage("تم تحديد الموقع. راجع العلامة على الخريطة واضغط حفظ.");
      },
      error => {
        setLocating(false);
        setMessage(error.code === 1 ? "السماح بالموقع مرفوض. فعّله من المتصفح أو حدد الموقع على الخريطة." : "تعذر جلب موقعك. جرب مرة أخرى أو حدد الموقع على الخريطة.");
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    );
  }

  return <section className="provider-location">
    <div className="provider-location-heading"><MapPin size={21}/><div><h2>موقع المتجر</h2><p>حدد الموقع الفعلي للمتجر حتى يتم حساب توصيل الطلبات بصورة صحيحة.</p></div></div>
    <div className="provider-location-actions">
      <button type="button" onClick={locate} disabled={locating} className="provider-locate-btn">
        <MapPin size={18}/>{locating ? "جاري تحديد موقعك..." : "تحديد موقعي الحالي"}
      </button>
      <a href="https://www.openstreetmap.org/#map=13/26.556/31.694" target="_blank" rel="noopener noreferrer" className="provider-location-link">فتح الخريطة لاختيار الموقع</a>
    </div>
    <p className="provider-location-tip">لو مش داخل المتجر حاليًا، افتح الخريطة، اضغط على موقع المتجر وخد الإحداثيات؛ ما تستخدمش موقعك الشخصي بالغلط.</p>
    <p className="provider-location-tip">اضغط على النقطة الصحيحة داخل الخريطة أو حرّك العلامة لتحديد المتجر بدقة، ثم اضغط حفظ الإعدادات والموقع.</p>
    <div className="provider-location-fields">
      <label>خط العرض Latitude<input type="number" step="any" min="-90" max="90" inputMode="decimal" value={latitude ?? ""} onChange={e => onChange(e.target.value, longitude ?? "")} placeholder="26.55..."/></label>
      <label>خط الطول Longitude<input type="number" step="any" min="-180" max="180" inputMode="decimal" value={longitude ?? ""} onChange={e => onChange(latitude ?? "", e.target.value)} placeholder="31.69..."/></label>
    </div>
    <div className="provider-location-preview">
      {window.L
        ? <InteractiveStoreMap latitude={latitude} longitude={longitude} onChange={onChange}/>
        : valid ? <iframe title="معاينة موقع المتجر" loading="lazy" src={mapUrl}/> : <div className="provider-location-empty">الخريطة غير متاحة الآن؛ يمكنك استخدام تحديد موقعي الحالي أو إدخال الإحداثيات.</div>}
      {valid && <small>الإحداثيات: {lat.toFixed(6)}، {lng.toFixed(6)}</small>}
    </div>
    {message && <p className="provider-location-message">{message}</p>}
  </section>;
}

function SettingsPage() {
  const { store } = useAuth();
  const [f, setF] = useState(store);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    setF(store);
  }, [store]);

  async function save(e) {
    e.preventDefault();
    setNotice("");
    if (!validCoordinates(f?.latitude ?? "", f?.longitude ?? "")) {
      setNotice("حدد موقع المتجر الصحيح أولاً. الموقع مطلوب لحساب التوصيل.");
      return;
    }
    const lat = Number(f.latitude), lng = Number(f.longitude);
    try {
      setBusy(true);
      // Only update editable fields; preserve store ID, status and admin-owned data.
      await update(ref(db, `stores/${store.id}`), {
        name: String(f.name || "").trim(),
        phone: String(f.phone || "").trim(),
        address: String(f.address || "").trim(),
        preparationTime: Number(f?.preparationTime || 25),
        isOpen: f?.isOpen !== false,
        acceptsOrders: f?.acceptsOrders !== false,
        latitude: lat,
        longitude: lng,
        locationUpdatedAt: now(),
        updatedAt: now(),
      });
      setNotice("تم حفظ بيانات وموقع المتجر بنجاح. سيتم استخدامه في حساب رسوم التوصيل.");
    } catch (error) {
      setNotice(`تعذر حفظ الإعدادات: ${error?.message || "راجع الاتصال وصلاحيات Firebase"}`);
    } finally {
      setBusy(false);
    }
  }

  const fields = [
    { key: "name", label: "اسم المتجر" },
    { key: "phone", label: "الهاتف" },
    { key: "address", label: "العنوان" },
    { key: "preparationTime", label: "وقت التجهيز بالدقائق" },
  ];

  return (
    <>
      <Title title="إعدادات المتجر" sub="بيانات التشغيل وموقع المتجر لاستقبال طلبات التوصيل"/>
      <form className="panel form settings" onSubmit={save}>
        {fields.map(field => (
          <label key={field.key}>{field.label}
            <input type={field.key === "preparationTime" ? "number" : "text"}
              value={f?.[field.key] ?? ""}
              onChange={e => setF(current => ({ ...current, [field.key]: e.target.value }))}/>
          </label>
        ))}
        <StoreLocationPicker
          latitude={f?.latitude ?? ""}
          longitude={f?.longitude ?? ""}
          onChange={(latitude, longitude) => setF(current => ({ ...current, latitude, longitude }))}
        />
        <label className="check"><input type="checkbox" checked={f?.isOpen !== false}
          onChange={e => setF(current => ({ ...current, isOpen: e.target.checked }))}/>المتجر مفتوح</label>
        <label className="check"><input type="checkbox" checked={f?.acceptsOrders !== false}
          onChange={e => setF(current => ({ ...current, acceptsOrders: e.target.checked }))}/>استقبال الطلبات</label>
        {notice && <div role="status" className="provider-location-notice">{notice}</div>}
        <button type="submit" disabled={busy}>{busy ? "جاري حفظ الإعدادات..." : "حفظ الإعدادات والموقع"}</button>
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
