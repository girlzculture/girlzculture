/** Only complete, explicit own-gallery count questions. Broader advice,
 * ambiguous follow-ups, writes and other-business questions stay with the
 * authorized planner. No record ID, URL or business scope comes from prose. */
export function isOwnGalleryCountQuestion(text: string): boolean {
  const question = text.normalize("NFKC").trim().replace(/^(?:(?:(?:now|maintenant|ahora)[,\s]+)?(?:answer|respond|reply|réponds|répondez|responde|contesta)\s+(?:in|en)\s+(?:english|french|spanish|simplified chinese|français|español)|(?:(?:现在|从现在开始|接下来)[，,\s]*)?请?用(?:简体中文|中文|普通话)回答)\s*[:：.。]\s*/iu, "");
  return [
    /^how many (?:photos|images) (?:are (?:there )?in my gallery|do i have in my gallery)\s*[?.!]?$/iu,
    /^combien de photos (?:ai-je dans ma galerie|y a-t-il dans ma galerie)\s*[?.!]?$/iu,
    /^¿?cuántas fotos (?:tengo en (?:mi|la) galería|hay en mi galería)\s*[?!.]?$/iu,
    /^我的(?:图库|相册)(?:里)?有多少(?:张)?照片\s*[？?。！!]?$/u,
  ].some(pattern => pattern.test(question));
}
