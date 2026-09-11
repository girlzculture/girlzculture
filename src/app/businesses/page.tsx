import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Compass } from "lucide-react";
import BusinessPhoto from "@/components/business/BusinessPhoto";
import { CustomerBottomNav, PublicFooter, PublicHeader } from "@/components/site/PublicChrome";
import { customerBusinessCategories } from "@/lib/businessDiscovery";
import { getBusinessSignupContent } from "@/lib/businessSignupContentServer";
import styles from "./businesses.module.css";

export const dynamic = "force-dynamic";
const description = "Explore hair salons and braiders on Girlz Culture. Nail, wellness and other beauty business categories are coming soon.";
export const metadata: Metadata = {
  title: "Beauty & Wellness Businesses",
  description,
  alternates: { canonical: "https://girlzculture.com/businesses" },
  openGraph: { title: "Beauty & Wellness Businesses | Girlz Culture", description, url: "https://girlzculture.com/businesses", type: "website" },
};

export default async function BusinessesPage() {
  const published = await getBusinessSignupContent();
  const categories = customerBusinessCategories(published?.categories);
  return <main className={styles.page} translate="yes" data-public-translation="true">
    <PublicHeader active="businesses" />
    <div className={styles.content}>
      <section className={styles.intro} aria-labelledby="businesses-heading">
        <p className={styles.eyebrow}><Compass size={17} aria-hidden="true" /><span>Businesses</span></p>
        <h1 id="businesses-heading">Find your next<br /><span>beauty destination.</span></h1>
        <div className={styles.introDetails}>
          <p>Discover hair salons and braiders today. More beauty and wellness categories are coming soon.</p>
          <Link href="/styles" className={styles.stylesLink}><span>Explore hair inspiration</span><ArrowRight size={18} aria-hidden="true" /></Link>
        </div>
      </section>

      <section className={styles.categories} aria-labelledby="business-categories-heading">
        <div className={styles.sectionHeading}>
          <h2 id="business-categories-heading">Explore by business type</h2>
          <p>Choose what feels like you.</p>
        </div>
        <ul className={styles.grid}>
          {categories.map((category, index) => {
            const live = category.destination.state === "live";
            const content = <>
              <div className={styles.photo}>
                <BusinessPhoto photo={{ src: category.image.src, alt: category.image.alt, objectFit: category.image.fit, objectPosition: `${category.image.focalX}% ${category.image.focalY}%`, aspectRatio: "1.5" }} priority={index < 4} fallbackSrc={category.fallbackImage} />
                <span className={`${styles.badge} ${live ? styles.liveBadge : ""}`}>{live ? "Explore now" : "Coming soon"}</span>
              </div>
              <div className={styles.cardBody}>
                <h3 id={`business-category-${category.id}`}>{category.name}</h3>
                <p>{category.description}</p>
                {live ? <span className={styles.cardAction}><span>Find salons & braiders</span><ArrowRight size={18} aria-hidden="true" /></span> : <p className={styles.availability}>Discovery is not available yet.</p>}
              </div>
            </>;
            return <li key={category.id} data-business-category={category.id} data-discovery-state={category.destination.state}>
              {category.destination.state === "live"
                ? <Link href={category.destination.href} className={`${styles.card} ${styles.liveCard}`} aria-labelledby={`business-category-${category.id}`}>{content}</Link>
                : <article className={styles.card} aria-labelledby={`business-category-${category.id}`}>{content}</article>}
            </li>;
          })}
        </ul>
      </section>

      <aside className={styles.note}>
        <div><h2>A growing world of beauty</h2><p>We’re opening discovery one category at a time. Coming-soon categories don’t offer search or booking yet.</p></div>
        <Link href="/salons"><span>Browse hair salons</span><ArrowRight size={18} aria-hidden="true" /></Link>
      </aside>
    </div>
    <PublicFooter reserveMobileNavigation />
    <CustomerBottomNav active="search" />
  </main>;
}
