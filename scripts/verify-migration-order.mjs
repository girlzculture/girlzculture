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
  const indexStatements=sql.match(/create\s+(?:unique\s+)?index\b[\s\S]*?;/gi)??[];
  if(indexStatements.some((statement)=>/\b(?:now|timezone)\s*\(|\bcurrent_timestamp\b/i.test(statement)))failures.push(`${file}: index expression may use a non-immutable time function`);
}
const launchBlockerSequence=[
  "20260721110000_launch_blocker_core_stabilization.sql",
  "20260721120000_salon_publication_controls.sql",
  "20260721130000_local_discovery_launch_defaults.sql",
  "20260721140000_flexible_service_catalog.sql",
  "20260721150000_platform_error_monitoring.sql",
];
const launchBlockerIndexes=launchBlockerSequence.map((file)=>files.indexOf(file));
if(launchBlockerIndexes.some((index)=>index<0))failures.push("Launch-blocker migration sequence is incomplete");
if(launchBlockerIndexes.some((index,position)=>position>0&&index<=launchBlockerIndexes[position-1]))failures.push("Launch-blocker migrations are not in dependency order");
const launchCorrectionSequence=[
  "20260722100000_atomic_owner_catalog_persistence.sql",
  "20260722110000_discovery_authoritative_eligibility.sql",
  "20260722120000_responsive_media_renditions.sql",
  "20260722130000_beauty_concierge_engine.sql",
  "20260722140000_salon_promotion_management.sql",
  "20260722150000_subscription_change_tracking.sql",
];
const correctionIndexes=launchCorrectionSequence.map((file)=>files.indexOf(file));
if(correctionIndexes.some((index)=>index<0))failures.push("Live-correction migration sequence is incomplete");
if(correctionIndexes.some((index,position)=>position>0&&index<=correctionIndexes[position-1]))failures.push("Live-correction migrations are not in dependency order");
const expansion=files.at(-1);
if(expansion!==launchCorrectionSequence.at(-1))failures.push(`Expected subscription change tracking to be the latest migration; found ${expansion||"none"}`);
if(failures.length){console.error(failures.join("\n"));process.exit(1)}
console.log(`Migration order verified: ${files.length} unique migrations; latest ${expansion}.`);
