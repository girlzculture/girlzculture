import fs from "node:fs";
import path from "node:path";

const directory=path.join(process.cwd(),"supabase","migrations");
const files=fs.readdirSync(directory).filter(file=>file.endsWith(".sql")).sort();
const timestamps=new Set();
const failures=[];
for(const file of files){
  const match=file.match(/^(\d{14})_[a-z0-9_]+\.sql$/);
  if(!match){failures.push(`${file}: migration name must start with a 14-digit timestamp`);continue}
  if(timestamps.has(match[1]))failures.push(`${file}: duplicate migration timestamp ${match[1]}`);
  timestamps.add(match[1]);
  const sql=fs.readFileSync(path.join(directory,file),"utf8");
  if(!sql.trim())failures.push(`${file}: migration is empty`);
  if(/\b(drop\s+database|alter\s+system|copy\s+.+\s+program)\b/i.test(sql))failures.push(`${file}: contains a prohibited infrastructure statement`);
  if(/create\s+(unique\s+)?index[\s\S]{0,500}\b(now|current_timestamp|timezone)\s*\(/i.test(sql))failures.push(`${file}: index expression may use a non-immutable time function`);
}
const expansion=files.at(-1);
if(expansion!=="20260721100000_engine_localization_ai_system.sql")failures.push(`Expected Engine expansion to be latest; found ${expansion||"none"}`);
if(failures.length){console.error(failures.join("\n"));process.exit(1)}
console.log(`Migration order verified: ${files.length} unique migrations; latest ${expansion}.`);
