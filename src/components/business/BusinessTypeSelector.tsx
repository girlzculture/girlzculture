import Link from "next/link";
import type { ReactNode } from "react";
import { BUSINESS_CATEGORIES, businessCategoryHref } from "@/lib/businessCategories";
import { BUSINESS_CATEGORY_PHOTOS } from "@/lib/businessSignupMedia";
import BusinessPhoto from "./BusinessPhoto";

export default function BusinessTypeSelector({ continueHref, children }: { continueHref: string; children?: ReactNode }) {
  return <div className="business-selection-flow">
    <section className="business-type-selector" aria-labelledby="business-selector-title">
      <h2 id="business-selector-title" className="business-selector-title">Select Your Business Type</h2>
      <p className="business-selector-description">Choose the category that best describes your business to get started.</p>
      <div className="business-category-grid">
        {BUSINESS_CATEGORIES.map(category => <Link key={category.slug} href={businessCategoryHref(category, continueHref)} className={`business-category${category.live ? " business-category-live" : ""}`} data-business-category={category.slug}>
          <BusinessPhoto photo={BUSINESS_CATEGORY_PHOTOS[category.photo]} />
          <span className="business-category-name">{category.name}</span>
        </Link>)}
      </div>
    </section>
    {children}
  </div>;
}
