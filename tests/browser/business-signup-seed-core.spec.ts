import { expect, test } from "@playwright/test";
import { readdirSync, readFileSync } from "node:fs";
import {
  BUSINESS_SIGNUP_CONTENT_LABEL,
  DEFAULT_BUSINESS_SIGNUP_CONTENT,
  decodeBusinessSignupContent,
  validateBusinessSignupContent,
} from "../../src/lib/businessSignupContent";

test("latest forward migration advances both Engine markers to the repository head", () => {
  const directory = "supabase/migrations";
  const latest = readdirSync(directory).filter(file => /^\d{14}_.*\.sql$/.test(file)).sort().at(-1)!;
  const repositoryHead = latest.slice(0, 14);
  const sql = readFileSync(`${directory}/${latest}`, "utf8");
  const assignments = sql.match(/update\s+public\.engine_settings\s+set\s+([\s\S]*?)where\s+setting_key\s*=\s*'integrations\.expected_migration'\s*;/i)?.[1];
  expect(assignments, "The newest migration must advance the scoped Engine deployment marker").toBeTruthy();
  for (const field of ["published_value", "draft_value"]) {
    const literal = assignments!.match(new RegExp(`${field}\\s*=\\s*'([^']+)'::jsonb`, "i"))?.[1];
    expect(literal, `${field} must contain the migration version as a JSON string`).toBeTruthy();
    expect(JSON.parse(literal!)).toBe(repositoryHead);
  }
});

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
