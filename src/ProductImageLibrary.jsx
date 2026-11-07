import {useEffect,useMemo,useState} from "react";
import {onValue,ref} from "firebase/database";
import {db} from "./firebase";
import "./productImageLibrary.css";

const CATEGORIES=[
  {id:"all",name:"صور المتاجر"},
  {id:"fried",name:"فرايد تشيكن",search:"fried chicken food"},
  {id:"crepe",name:"كريبات",search:"savory crepe food"},
  {id:"koshary",name:"كشري",search:"Egyptian koshari dish"},
  {id:"falafel",name:"فلافل وطعمية",search:"Egyptian falafel taameya"},
  {id:"burger",name:"برجر",search:"hamburger sandwich food"},
  {id:"pizza",name:"بيتزا",search:"pizza food"},
  {id:"shawarma",name:"شاورما",search:"shawarma sandwich"},
  {id:"grill",name:"مشويات",search:"grilled kebab kofta"},
  {id:"chicken",name:"فراخ مشوية",search:"grilled chicken meal"},
  {id:"sandwich",name:"سندوتشات",search:"sandwich food"},
  {id:"pasta",name:"مكرونة",search:"pasta dish"},
  {id:"seafood",name:"أسماك وسي فود",search:"seafood meal fish"},
  {id:"rice",name:"أرز ووجبات",search:"rice meal food"},
  {id:"breakfast",name:"فطار وفول",search:"ful medames Egyptian breakfast"},
  {id:"dessert",name:"حلويات",search:"dessert cake pastry"},
  {id:"drinks",name:"عصائر ومشروبات",search:"fruit juice drink"},
  {id:"bakery",name:"مخبوزات",search:"bread bakery pastry"},
  {id:"pharmacy",name:"صيدليات",search:"pharmaceutical medicine packaging"},
  {id:"medical",name:"مستلزمات طبية",search:"medical supplies first aid"},
  {id:"personal",name:"عناية شخصية",search:"personal care shampoo products"}
];
const normalize=v=>String(v||"").trim().toLowerCase().replace(/[أإآ]/g,"ا").replace(/ى/g,"ي").replace(/ة/g,"ه").replace(/\s+/g," ");
const valid=url=>/^https:\/\//i.test(url||"");
const clean=v=>String(v||"").replace(/<[^>]+>/g,"").replace(/&amp;/g,"&").trim();
async function commonsPhotos(search,signal){
  const params=new URLSearchParams({action:"query",generator:"search",gsrsearch:"filetype:bitmap "+search,gsrnamespace:"6",gsrlimit:"35",prop:"imageinfo",iiprop:"url|mime|extmetadata",iiurlwidth:"500",format:"json",origin:"*"});
  const response=await fetch("https://commons.wikimedia.org/w/api.php?"+params,{signal});
  if(!response.ok)throw new Error("تعذر الاتصال بمكتبة الصور العامة");
  const data=await response.json();
  return Object.values(data.query?.pages||{}).map(p=>{
    const info=p.imageinfo?.[0]||{},meta=info.extmetadata||{};
    return {id:String(p.pageid),name:clean(p.title.replace(/^File:/,"").replace(/\.[^.]+$/,"").replace(/_/g," ")),image:info.thumburl||info.url,credit:clean(meta.Artist?.value||""),license:clean(meta.LicenseShortName?.value||""),sourceUrl:info.descriptionurl||"",source:"commons"};
  }).filter(p=>valid(p.image)&&/^(CC|Public domain|PD|No restrictions)/i.test(p.license)&&!/(logo|icon|diagram|map|illustration)/i.test(p.name)).slice(0,30);
}
export default function ProductImageLibrary({onSelect,onClose}){
  const [catalog,setCatalog]=useState({});
  const [storeProducts,setStoreProducts]=useState({});
  const [category,setCategory]=useState("all");
  const [query,setQuery]=useState("");
  const [photos,setPhotos]=useState({});
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");
  useEffect(()=>{
    const a=onValue(ref(db,"catalogProducts"),s=>setCatalog(s.val()||{}),()=>{});
    const b=onValue(ref(db,"products"),s=>setStoreProducts(s.val()||{}),()=>{});
    return ()=>{a();b();};
  },[]);
  useEffect(()=>{
    const selected=CATEGORIES.find(c=>c.id===category);
    if(!selected?.search||photos[category])return;
    const controller=new AbortController();
    setLoading(true);setError("");
    commonsPhotos(selected.search,controller.signal).then(result=>setPhotos(prev=>({...prev,[category]:result}))).catch(e=>{if(e.name!=="AbortError")setError(e.message);}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return ()=>controller.abort();
  },[category,photos]);
  const existing=useMemo(()=>{
    const entries=[
      ...Object.entries(catalog).filter(([,p])=>p&&p.imageStatus==="approved").map(([id,p])=>({id,name:p.nameAr||p.name,brand:p.brand,image:p.imageUrl||p.image,source:"catalog"})),
      ...Object.entries(storeProducts).filter(([,p])=>p&&p.image).map(([id,p])=>({id,name:p.name,brand:p.storeName,image:p.image,source:"store"}))
    ];
    const seen=new Set();
    return entries.filter(p=>{if(!valid(p.image)||seen.has(p.image))return false;seen.add(p.image);return true;});
  },[catalog,storeProducts]);
  const entries=category==="all"?existing:(photos[category]||[]);
  const filtered=entries.filter(p=>!query||normalize([p.name,p.brand].join(" ")).includes(normalize(query))).slice(0,80);
  return <div className="bringo-library-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}>
    <section className="bringo-library-dialog" role="dialog" aria-modal="true" aria-label="مكتبة صور المنتجات">
      <header className="bringo-library-header"><div><h3>مكتبة صور برينجو</h3><p>صور المتاجر وصور توضيحية للأكلات والمنتجات الطبية من ويكيميديا كومنز</p></div><button type="button" onClick={onClose} aria-label="إغلاق">×</button></header>
      <div className="bringo-library-categories">{CATEGORIES.map(c=><button type="button" key={c.id} className={category===c.id?"active":""} onClick={()=>{setCategory(c.id);setQuery("");}}>{c.name}</button>)}</div>
      <input className="bringo-library-search" placeholder="ابحث في القسم المحدد" value={query} onChange={e=>setQuery(e.target.value)}/>
      {loading?<p className="bringo-library-state">جاري تحميل صور القسم...</p>:error?<p className="bringo-library-state">{error} — يمكنك رفع صورة بنفسك</p>:filtered.length?<div className="bringo-library-grid">{filtered.map(p=><button type="button" className="bringo-library-product" key={p.source+"-"+p.id} onClick={()=>{onSelect(p);onClose();}}><img src={p.image} alt={p.name||"صورة منتج"} loading="lazy"/><strong>{p.name||"منتج"}</strong><small>{p.source==="commons"?"صورة توضيحية · "+p.license:p.brand||""}</small></button>)}</div>:<p className="bringo-library-state">{query?"مفيش صور مطابقة للبحث":"لا توجد صور متاحة في هذا القسم حاليًا"}</p>}
      <footer className="bringo-library-footer">{filtered.length} صورة · الصور التوضيحية قد لا تطابق المنتج الحقيقي؛ يُفضّل صور العبوة الأصلية للأدوية</footer>
    </section>
  </div>;
}
