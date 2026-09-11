import Link from "next/link";
import { businessSignupCategoryHref, visibleBusinessCategories, type BusinessSignupContent } from "@/lib/businessSignupContent";
import BusinessPhoto from "./BusinessPhoto";

export default function BusinessTypeSelector({ content, plan }: { content: BusinessSignupContent; plan?: unknown }) {
  if (content.selector.visible === false) return null;
  return <section className="business-type-selector" aria-labelledby="business-selector-title">
      <h2 id="business-selector-title" className="business-selector-title">{content.selector.heading}</h2>
      {content.selector.supportingText ? <p className="business-selector-description">{content.selector.supportingText}</p> : null}
      <div className="business-category-grid">
        {visibleBusinessCategories(content).map(category => {
          const href = businessSignupCategoryHref(category, plan);
          const body = <>{category.image.src ? <BusinessPhoto photo={{ src: category.image.src, alt: category.image.alt, objectFit: category.image.fit, objectPosition: `${category.image.focalX}% ${category.image.focalY}%` }} /> : null}<span className="business-category-name">{category.name}</span></>;
          return href ? <Link key={category.id} href={href} className="business-category" data-business-category={category.id}>{body}</Link> : <div key={category.id} className="business-category" data-business-category={category.id} aria-disabled="true">{body}</div>;
        })}
      </div>
    </section>;
}
