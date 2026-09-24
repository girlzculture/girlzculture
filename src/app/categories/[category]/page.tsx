import {notFound,redirect} from "next/navigation";
import {ACTIVE_BUSINESS_CATEGORIES} from "@/lib/businessCategories";
import {PublicHeader,PublicFooter} from "@/components/site/PublicChrome";
import {marketplaceBrowsingAvailable} from "@/lib/marketplaceAccessServer";
import CategoryComingSoonContent from "@/components/business/CategoryComingSoonContent";
export default async function CategoryComingSoon({params}:{params:Promise<{category:string}>}){
 const id=(await params).category,category=ACTIVE_BUSINESS_CATEGORIES.find(item=>item.slug===id);
 if(!category)notFound();if(category.live)redirect("/salons?category=hair-salon-braiding");
 const browsing=await marketplaceBrowsingAvailable();
 return <main className="min-h-screen bg-cream text-ink"><PublicHeader/><CategoryComingSoonContent category={category} browsing={browsing}/><PublicFooter/></main>;
}
