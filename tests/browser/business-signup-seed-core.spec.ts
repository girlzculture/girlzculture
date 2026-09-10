import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import {
  BUSINESS_SIGNUP_CONTENT_LABEL,
  DEFAULT_BUSINESS_SIGNUP_CONTENT,
  decodeBusinessSignupContent,
  validateBusinessSignupContent,
} from "../../src/lib/businessSignupContent";

test("forward content seed exactly matches the validated public business signup defaults", () => {
  const sql = readFileSync("supabase/migrations/20260910133806_business_signup_content_management.sql", "utf8");
  const literal = sql.match(/\$business_signup\$([\s\S]*?)\$business_signup\$::jsonb/)?.[1];
  expect(literal, "The forward migration must contain the business signup seed payload").toBeTruthy();
  const payload = JSON.parse(literal!);
  const serialized = payload.labels[BUSINESS_SIGNUP_CONTENT_LABEL];
  const content = validateBusinessSignupContent(JSON.parse(serialized), { forPublication: true });
  expect(content).toEqual(DEFAULT_BUSINESS_SIGNUP_CONTENT);
  expect(decodeBusinessSignupContent(payload.labels)).toEqual(content);
  expect(payload).toMatchObject({
    slug: "business-signup", title: "Business Signup Landing Page",
    hero_title: content.hero.heading, hero_subtitle: content.hero.supportingText,
    sections: [], page_group: "Marketing", status: "Published", is_enabled: true,
  });
  expect(content.hero).toMatchObject({
    accent: "teal", alignment: "left",
    media: { type: "image", src: "/images/business/business-signup-hero.avif", poster: { src: "/images/business/business-signup-hero.avif" } },
  });
  expect(content.trust.map(block => block.icon)).toEqual(["gem", "lock-keyhole", "heart"]);
});
