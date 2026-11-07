const groups=[
{words:/فرايد|بروست|كرسبي|ستربس|زنجر|تشيكن/,query:"fried chicken food"},
{words:/كريب/,query:"savory crepe food"},
{words:/كشري/,query:"Egyptian koshari dish"},
{words:/طعمية|فلافل/,query:"Egyptian falafel taameya"},
{words:/برجر|برغر/,query:"hamburger food"},
{words:/بيتزا/,query:"pizza food"},
{words:/شاورما/,query:"shawarma food"},
{words:/كفتة|كباب|مشويات/,query:"grilled kofta kebab"},
{words:/فراخ مشوية|دجاج مشوي/,query:"grilled chicken"},
{words:/مكرونة|باستا/,query:"pasta food"},
{words:/سمك|جمبري|سي فود/,query:"seafood meal"},
{words:/فول/,query:"ful medames Egyptian"},
{words:/عصير|كوكتيل/,query:"fruit juice glass"},
{words:/كيك|تورتة/,query:"cake dessert"},
{words:/كرواسون/,query:"croissant pastry"}
];
const normalize=s=>String(s||"").toLowerCase().replace(/[أإآ]/g,"ا").replace(/ى/g,"ي").replace(/ة/g,"ه");
export function imageGroup(product){
  const name=normalize(product.name),category=normalize(product.menuCategoryName);
  if(/صيدل|دواء|ادوي|علاج|كبسول|اقراص|ملجم|mg|ml|حقن|شراب|صيدليات/.test(name+" "+category))return null;
  return groups.find(g=>g.words.test(name))||null;
}
export async function fetchGroupImage(group){
  const params=new URLSearchParams({action:"query",generator:"search",gsrsearch:"filetype:bitmap "+group.query,gsrnamespace:"6",gsrlimit:"25",prop:"imageinfo",iiprop:"url|mime|extmetadata",iiurlwidth:"600",format:"json",origin:"*"});
  const response=await fetch("https://commons.wikimedia.org/w/api.php?"+params);
  if(!response.ok)throw new Error("Image service unavailable");
  const data=await response.json();
  const candidates=Object.values(data.query?.pages||{}).map(p=>{
    const info=p.imageinfo?.[0]||{},meta=info.extmetadata||{};
    const license=String(meta.LicenseShortName?.value||"");
    const title=String(p.title||"");
    return {image:info.thumburl||info.url,imageCredit:String(meta.Artist?.value||"").replace(/<[^>]*>/g,"").slice(0,200),imageLicense:license,imageSourceUrl:info.descriptionurl||"",title};
  }).filter(p=>/^https:\/\//.test(p.image||"")&&/^(CC|Public domain|PD)/i.test(p.imageLicense)&&!/(logo|icon|diagram|map|illustration|drawing|cartoon)/i.test(p.title));
  return candidates[0]||null;
}
