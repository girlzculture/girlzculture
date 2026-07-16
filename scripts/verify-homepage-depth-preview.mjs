import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const home = read("src/app/page.tsx");
const styles = read("src/app/globals.css");
assert.match(home, /homepage3d === "1"/);
assert.match(home, /data-homepage-variant/);
assert.match(home, /gc-home-depth/);
assert.equal((home.match(/export default async function Home/g) || []).length, 1, "Homepage business logic must not be duplicated");
assert.match(styles, /\.gc-home-depth/);
assert.match(styles, /@media \(hover: hover\) and \(pointer: fine\)/);
assert.match(styles, /prefers-reduced-motion/);
assert.doesNotMatch(styles, /webgl|three\.js/i);
console.log("Homepage depth preview verification passed.");
