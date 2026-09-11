import Link from "next/link";
import { Gem, Heart, LockKeyhole, ShieldCheck, Sparkles, UsersRound } from "lucide-react";
import type { BusinessSignupSection, BusinessSignupSectionPlacement, BusinessSignupImage } from "@/lib/businessSignupContent";
import BusinessPhoto from "./BusinessPhoto";
import BusinessSignupMedia from "./BusinessSignupMedia";

const icons = { gem: Gem, "lock-keyhole": LockKeyhole, "shield-check": ShieldCheck, "users-round": UsersRound, heart: Heart, sparkles: Sparkles };
const photo = (image: BusinessSignupImage) => ({ src: image.src, alt: image.alt, objectFit: image.fit, objectPosition: `${image.focalX}% ${image.focalY}%` });

function Copy({ section }: { section: BusinessSignupSection }) {
  return <div className="business-section-copy">
    {section.heading ? <h2 id={`business-section-${section.id}`}>{section.heading}</h2> : null}
    {section.subheading ? <p className="business-section-subheading">{section.subheading}</p> : null}
    {section.body && section.type !== "quote" ? <p className="business-section-body">{section.body}</p> : null}
  </div>;
}

function ItemHeading({ section, children }: { section: BusinessSignupSection; children: string }) {
  const Heading = section.heading ? "h3" : "h2";
  return <Heading className="business-section-item-heading">{children}</Heading>;
}

export default function BusinessSignupSections({ sections, placement }: { sections: BusinessSignupSection[]; placement: BusinessSignupSectionPlacement }) {
  const enabled = sections.filter(section => section.enabled && section.placement === placement).sort((a, b) => a.order - b.order);
  if (!enabled.length) return null;
  return <div className="business-sections" data-section-placement={placement}>
    {enabled.map(section => <section key={section.id} className="business-section" data-business-section={section.id} data-section-type={section.type} data-variant={section.variant} aria-labelledby={section.heading ? `business-section-${section.id}` : undefined}>
      {section.type === "image_text" && section.image.src ? <div className="business-section-image"><BusinessPhoto photo={photo(section.image)} /></div> : null}
      <Copy section={section} />
      {section.type === "features" ? <ul className="business-section-items">{section.items.map(item => { const Icon = icons[item.icon]; return <li key={item.id}><Icon size={28} aria-hidden="true" /><ItemHeading section={section}>{item.heading}</ItemHeading>{item.body ? <p>{item.body}</p> : null}</li>; })}</ul> : null}
      {section.type === "stats" ? <dl className="business-section-items">{section.items.map(item => <div key={item.id}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}</dl> : null}
      {section.type === "quote" ? <figure className="business-section-quote">
        {section.image?.src ? <div className="business-section-portrait"><BusinessPhoto photo={photo(section.image)} /></div> : null}
        <blockquote><p>{section.body}</p></blockquote>
        {section.author || section.role ? <figcaption>{section.author ? <span>{section.author}</span> : null}{section.role ? <span>{section.role}</span> : null}</figcaption> : null}
      </figure> : null}
      {section.type === "faq" ? <div className="business-section-faq">{section.items.map(item => section.variant === "accordion" ? <details key={item.id}><summary><span>{item.question}</span></summary><p>{item.answer}</p></details> : <div key={item.id}><ItemHeading section={section}>{item.question}</ItemHeading><p>{item.answer}</p></div>)}</div> : null}
      {section.type === "gallery" ? <ul className="business-section-gallery">{section.items.map(item => <li key={item.id}><BusinessPhoto photo={photo(item.image)} /></li>)}</ul> : null}
      {section.type === "media" && section.media.type !== "none" ? <BusinessSignupMedia media={section.media} className="business-section-media" decorative={false} /> : null}
      {section.cta?.label && section.cta.href ? <div className="business-section-action"><Link href={section.cta.href}>{section.cta.label}</Link></div> : null}
    </section>)}
  </div>;
}
