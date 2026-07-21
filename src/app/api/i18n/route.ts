import { BUNDLED_MESSAGES, ENGLISH_MESSAGES, normalizeLocale } from "@/i18n/catalog";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

const FALLBACK_LOCALES=[
  {locale:"en",display_name:"English",native_name:"English",intl_locale:"en-US",text_direction:"ltr",is_default:true,sort_order:1},
  {locale:"es",display_name:"Spanish",native_name:"Español",intl_locale:"es-US",text_direction:"ltr",is_default:false,sort_order:2},
  {locale:"fr",display_name:"French",native_name:"Français",intl_locale:"fr-FR",text_direction:"ltr",is_default:false,sort_order:3},
  {locale:"wo",display_name:"Wolof",native_name:"Wolof",intl_locale:"wo-SN",text_direction:"ltr",is_default:false,sort_order:4},
];

export async function GET(request:Request){
  const requested=normalizeLocale(new URL(request.url).searchParams.get("locale"));
  try{
    const admin=getSupabaseAdmin();
    const{data:locales,error:localeError}=await admin.from("supported_locales").select("locale,display_name,native_name,intl_locale,text_direction,is_default,sort_order").eq("is_enabled",true).is("archived_at",null).order("sort_order");
    if(localeError)throw localeError;
    const enabled=locales||[];const defaultLocale=enabled.find(item=>item.is_default)?.locale||"en";const locale=enabled.some(item=>item.locale===requested)?requested:defaultLocale;
    const{data,error}=await admin.from("translation_entries").select("translation_key,translated_text").eq("locale",locale).eq("status","Published");if(error)throw error;
    return Response.json({locale,locales:enabled,messages:{...BUNDLED_MESSAGES[locale],...Object.fromEntries((data||[]).map(row=>[row.translation_key,row.translated_text]))}},{headers:{"Cache-Control":"public, max-age=60, stale-while-revalidate=300"}})
  }catch(error){console.warn("Dynamic localization registry unavailable; using bundled fallback",{message:error instanceof Error?error.message:"unknown"});return Response.json({locale:requested,locales:FALLBACK_LOCALES,messages:BUNDLED_MESSAGES[requested]||ENGLISH_MESSAGES})}
}
