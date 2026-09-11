import Link from "next/link";
import { Gem, Heart, LockKeyhole, ShieldCheck, Sparkles, UsersRound } from "lucide-react";
import type { BusinessSignupContent, BusinessSignupImage } from "@/lib/businessSignupContent";
import BusinessPhoto from "./BusinessPhoto";
import BusinessSignupMedia from "./BusinessSignupMedia";
import BusinessTypeSelector from "./BusinessTypeSelector";
import BusinessSignupSections from "./BusinessSignupSections";

export const businessPhotoAsset = (image: BusinessSignupImage) => ({
  src: image.src, alt: image.alt, objectFit: image.fit, objectPosition: `${image.focalX}% ${image.focalY}%`,
});

export function BusinessSignupHeader({ content, homeHref = "/" }: { content: BusinessSignupContent["header"]; homeHref?: string }) {
  const { logo, login } = content;
  return <header className="business-entry-header" data-logo-alignment={logo.alignment}>
    {logo.visible ? <Link href={homeHref} className="business-wordmark" data-logo-size={logo.size} aria-label={logo.mode === "image" ? logo.image.alt || logo.text : undefined}>
      {logo.mode === "image" ? <BusinessPhoto photo={businessPhotoAsset(logo.image)} fallbackText={logo.text || logo.image.alt || "Girlz Culture"} /> : logo.text}
    </Link> : <span />}
    {login.visible && login.href ? <div className="business-entry-login">{login.helperText ? <span>{login.helperText}</span> : null}<Link href={login.href}>{login.label}</Link></div> : null}
  </header>;
}

const icons = { gem: Gem, "lock-keyhole": LockKeyhole, "shield-check": ShieldCheck, "users-round": UsersRound, heart: Heart, sparkles: Sparkles };

export default function BusinessSignupLanding({ content, plan }: { content: BusinessSignupContent; plan?: unknown }) {
  const hero = content.hero;
  const split = hero.accent === "teal" && hero.heading === "Grow Your Beauty Business";
  return <main className="business-onboarding">
    <section className="business-hero" data-height={hero.height} data-overlay={hero.overlay} data-alignment={hero.alignment} data-hero-visible={hero.visible} aria-labelledby={hero.visible ? "business-hero-title" : undefined}>
      {hero.visible ? <BusinessSignupMedia media={hero.media} /> : null}
      <BusinessSignupHeader content={content.header} />
      {hero.visible ? <div className="business-hero-copy">
        {/* Replace the heading host when its accent/text structure changes: a
            browser translator may have detached its original text children. */}
        <h1 key={`${hero.heading}:${hero.accent}`} id="business-hero-title" data-accent={hero.accent}>{split ? <>Grow Your <span>Beauty Business</span></> : hero.heading}</h1>
        {hero.supportingText ? <p>{hero.supportingText}</p> : null}
        {(hero.textBlocks ?? []).filter(block => block.enabled && block.text).sort((a, b) => a.order - b.order).map(block => <p key={block.id} className="business-hero-additional-text" data-hero-text={block.id}>{block.text}</p>)}
      </div> : null}
    </section>
    <div className="business-lower">
      <BusinessSignupSections sections={content.sections ?? []} placement="after_hero" />
      <BusinessTypeSelector content={content} plan={plan} />
      <BusinessSignupSections sections={content.sections ?? []} placement="after_selector" />
      <section className="business-trust" aria-label="Built for your business">
        {content.trust.filter(block => block.visible).sort((a, b) => a.order - b.order).map(block => {
          const Icon = icons[block.icon];
          return <div key={block.id} data-business-trust={block.id}><Icon size={30} strokeWidth={1.5} aria-hidden="true" /><h2>{block.heading}</h2><p>{block.description}</p></div>;
        })}
      </section>
    </div>
  </main>;
}
