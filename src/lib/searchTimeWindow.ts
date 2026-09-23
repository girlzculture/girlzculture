export type SearchTimeWindow={start:string;end:string};
export function validateSearchTimeWindow(start:unknown,end:unknown):SearchTimeWindow|null {
 if(start==null&&end==null)return null;
 const valid=(v:unknown):v is string=>typeof v==='string'&&/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(v);
 if(!valid(start)||!valid(end)||start>=end)throw new Error('SEARCH_TIME_WINDOW_INVALID');
 return {start,end};
}
function clock(hour:string,minute:string|undefined,meridiem:string|undefined){
 let h=Number(hour),m=Number(minute||0);if(m>59||h>23)return null;
 if(meridiem){if(h<1||h>12)return null;h=h%12+(meridiem.toLowerCase()==='pm'?12:0);}
 return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
}
/** Explicit clock windows only; ambiguous bare numbers are left to clarification. */
export function parseSearchTimeWindow(text:string):SearchTimeWindow|null {
 const match=text.match(/(?:between|from|entre|de|从)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm|h|点)?\s*(?:and|to|until|et|à|a|y|到|至|–|-)\s*(?:las\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm|h|点)?/iu);
 if(!match||(!match[2]&&!match[3])||(!match[5]&&!match[6]))return null;
 const start=clock(match[1],match[2],/am|pm/i.test(match[3]||'')?match[3]:undefined),end=clock(match[4],match[5],/am|pm/i.test(match[6]||'')?match[6]:undefined);
 try{return validateSearchTimeWindow(start,end);}catch{return null;}
}
export function searchSlotMatches(value:string,period:'any'|'morning'|'afternoon'|'evening',window:SearchTimeWindow|null,duration=0){
 if(!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value))return false;
 const minutes=(s:string)=>Number(s.slice(0,2))*60+Number(s.slice(3));
 const start=minutes(value);if(window&&(start<minutes(window.start)||start+duration>minutes(window.end)))return false;
 return period==='any'||(period==='morning'?start<720:period==='afternoon'?start>=720&&start<1020:start>=1020);
}
