type Voice = { lang: string; localService: boolean; default?: boolean };
/** Never substitute English, a different Chinese script, or a remote voice. */
export function assistantLocalVoice<T extends Voice>(voices: T[], locale: string): T | undefined {
  const matches = voices.filter(voice => {
    if (!voice.localService) return false;
    const language = voice.lang.replaceAll("_", "-").toLowerCase();
    if (locale === "zh-CN") return ["zh-cn", "zh-hans", "zh-hans-cn", "cmn-hans-cn"].includes(language);
    return ["en", "fr", "es", "wo"].includes(locale) && language.split("-")[0] === locale;
  });
  return matches.find(voice => voice.default) || matches[0];
}
