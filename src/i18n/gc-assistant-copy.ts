import {rescheduleAssistantCopy} from "@/i18n/assistant-reschedule-copy";
export const localeNames: Record<string, string> = {
  en: "en-US",
  fr: "fr-FR",
  wo: "wo-SN",
  es: "es-ES",
  "zh-CN": "zh-CN",
};

export const copy = {
  en: {
    none: "I couldn't find any matching information yet.",
    ask: "What would you like me to help with next?",
    services: (count: number, list: string, more: number) => `You currently have ${count} service${count === 1 ? "" : "s"}.${list ? ` Here are ${count > 4 ? "the first few" : "the details"}: ${list}.` : ""}${more ? ` There ${more === 1 ? "is" : "are"} ${more} more; ask me for a specific service or price and I'll find it.` : ""}`,
    profile: (name: string, location: string) => `I found the current business profile for ${name || "your business"}.${location ? ` Its marketplace location is ${location}.` : " The marketplace location is not complete yet."} You can ask me about the description, hours, or public links, and I'll help one change at a time.`,
    bookings: (count: number, list: string) => `I found ${count} booking${count === 1 ? "" : "s"} in that period.${list ? ` The next ${Math.min(count, 4)}: ${list}.` : ""}`,
    availability: (count: number, date: string, list: string) => `I found ${count} open time${count === 1 ? "" : "s"}${date ? ` for ${date}` : ""}.${list ? ` The first options are ${list}.` : ""}`,
    policies: (parts: string) => `I found your current business policies.${parts ? ` ${parts}.` : ""} Ask me about any policy and I can explain what is currently published or prepare a reviewable update.`,
    knowledge: (count: number, answers: string) => count ? `I found ${count} relevant answer${count === 1 ? "" : "s"} in the Girlz Culture knowledge base. ${answers}` : "I couldn't find a matching answer in the published Girlz Culture knowledge base. I can still take you to Help or you can rephrase the question.",
    count: (count: number, label: string, list: string) => `I found ${count} ${label}.${list ? ` ${list}.` : ""}`,
    summary: (bookings: number, upcoming: number, value: string) => `For this period, I found ${bookings} booking${bookings === 1 ? "" : "s"}${upcoming ? ` and ${upcoming} upcoming appointment${upcoming === 1 ? "" : "s"}` : ""}.${value ? ` Completed booking value is ${value}.` : ""}`,
  },
  fr: {
    none: "Je n’ai trouvé aucune information correspondante pour le moment.", ask: "Que voulez-vous faire ensuite ?",
    services: (count: number, list: string, more: number) => `Vous avez actuellement ${count} service${count === 1 ? "" : "s"}.${list ? ` Voici ${count > 4 ? "les premiers" : "les détails"} : ${list}.` : ""}${more ? ` Il en reste ${more}; demandez-moi un service ou un prix précis.` : ""}`,
    profile: (name: string, location: string) => `J’ai trouvé le profil actuel de ${name || "votre entreprise"}.${location ? ` Son emplacement sur la marketplace est ${location}.` : " L’emplacement n’est pas encore complet."} Vous pouvez me demander la description, les horaires ou les liens publics.`,
    bookings: (count: number, list: string) => `J’ai trouvé ${count} rendez-vous sur cette période.${list ? ` Les prochains : ${list}.` : ""}`,
    availability: (count: number, date: string, list: string) => `J’ai trouvé ${count} créneau${count === 1 ? "" : "x"} disponible${count === 1 ? "" : "s"}${date ? ` pour le ${date}` : ""}.${list ? ` Premières options : ${list}.` : ""}`,
    policies: (parts: string) => `J’ai trouvé vos politiques actuelles.${parts ? ` ${parts}.` : ""} Demandez-moi une politique pour l’expliquer ou préparer une modification à vérifier.`,
    knowledge: (count: number, answers: string) => count ? `J’ai trouvé ${count} réponse${count === 1 ? "" : "s"} pertinente${count === 1 ? "" : "s"} dans la base de connaissances Girlz Culture. ${answers}` : "Je n’ai pas trouvé de réponse correspondante dans la base de connaissances publiée. Reformulez la question ou ouvrez l’aide.",
    count: (count: number, label: string, list: string) => `J’ai trouvé ${count} ${label}.${list ? ` ${list}.` : ""}`,
    summary: (bookings: number, upcoming: number, value: string) => `Pour cette période, j’ai trouvé ${bookings} rendez-vous${upcoming ? ` et ${upcoming} à venir` : ""}.${value ? ` La valeur des réservations terminées est de ${value}.` : ""}`,
  },
  es: {
    none: "Todavía no encontré información que coincida.", ask: "¿En qué te ayudo ahora?",
    services: (count: number, list: string, more: number) => `Actualmente tienes ${count} servicio${count === 1 ? "" : "s"}.${list ? ` ${count > 4 ? "Estos son los primeros" : "Estos son los detalles"}: ${list}.` : ""}${more ? ` Hay ${more} más; pregúntame por un servicio o precio específico.` : ""}`,
    profile: (name: string, location: string) => `Encontré el perfil actual de ${name || "tu negocio"}.${location ? ` Su ubicación en el marketplace es ${location}.` : " La ubicación aún no está completa."} Puedes preguntarme por la descripción, el horario o los enlaces públicos.`,
    bookings: (count: number, list: string) => `Encontré ${count} cita${count === 1 ? "" : "s"} en ese período.${list ? ` Las próximas: ${list}.` : ""}`,
    availability: (count: number, date: string, list: string) => `Encontré ${count} horario${count === 1 ? "" : "s"} disponible${count === 1 ? "" : "s"}${date ? ` para ${date}` : ""}.${list ? ` Primeras opciones: ${list}.` : ""}`,
    policies: (parts: string) => `Encontré las políticas actuales del negocio.${parts ? ` ${parts}.` : ""} Pregúntame por cualquiera para explicarla o preparar un cambio revisable.`,
    knowledge: (count: number, answers: string) => count ? `Encontré ${count} respuesta${count === 1 ? "" : "s"} relevante${count === 1 ? "" : "s"} en la base de conocimiento de Girlz Culture. ${answers}` : "No encontré una respuesta coincidente en la base de conocimiento publicada. Reformula la pregunta o abre Ayuda.",
    count: (count: number, label: string, list: string) => `Encontré ${count} ${label}.${list ? ` ${list}.` : ""}`,
    summary: (bookings: number, upcoming: number, value: string) => `Para este período encontré ${bookings} cita${bookings === 1 ? "" : "s"}${upcoming ? ` y ${upcoming} próxima${upcoming === 1 ? "" : "s"}` : ""}.${value ? ` El valor de reservas completadas es ${value}.` : ""}`,
  },
  wo: {
    none: "Gisuma leegi benn xibaar bu méngoo.", ask: "Lan nga bëgg ma dimbali la ci topp?",
    services: (count: number, list: string, more: number) => `Am nga leegi ${count} service.${list ? ` Yii ñoo jiitu: ${list}.` : ""}${more ? ` Des na ${more}; laaj ma service walla njëg bu nga bëgg.` : ""}`,
    profile: (name: string, location: string) => `Gis naa profil bi fi nekk bu ${name || "sa liggéey"}.${location ? ` Barabam ci marketplace bi mooy ${location}.` : " Barab bi matagul."} Mën nga laaj ma description, waxtu yi walla liens yi.`,
    bookings: (count: number, list: string) => `Gis naa ${count} rendez-vous ci jamono jii.${list ? ` Yii ñoo jiitu: ${list}.` : ""}`,
    availability: (count: number, date: string, list: string) => `Gis naa ${count} waxtu bu féex${date ? ` ci ${date}` : ""}.${list ? ` Yii ñoo jiitu: ${list}.` : ""}`,
    policies: (parts: string) => `Gis naa sa policies yi fi nekk.${parts ? ` ${parts}.` : ""} Laaj ma benn policy ngir ma leeral ko walla waajal coppite bu nga seet.`,
    knowledge: (count: number, answers: string) => count ? `Gis naa ${count} tontu ci Girlz Culture knowledge base. ${answers}` : "Gisuma tontu bu méngoo ci knowledge base bi ñu siiwal. Mën nga soppi laaj bi walla ubbi Help.",
    count: (count: number, label: string, list: string) => `Gis naa ${count} ${label}.${list ? ` ${list}.` : ""}`,
    summary: (bookings: number, upcoming: number, value: string) => `Ci jamono jii, gis naa ${bookings} booking${upcoming ? ` ak ${upcoming} rendez-vous buy ñëw` : ""}.${value ? ` Njëgu booking yi jeex mooy ${value}.` : ""}`,
  },
  "zh-CN": {
    none: "我暂时没有找到匹配的信息。", ask: "接下来需要我帮您做什么？",
    services: (count: number, list: string, more: number) => `您目前有 ${count} 项服务。${list ? `${count > 4 ? "以下是前几项" : "详细信息"}：${list}。` : ""}${more ? `另外还有 ${more} 项；您可以询问具体服务或价格。` : ""}`,
    profile: (name: string, location: string) => `我找到了${name || "您的商家"}的当前资料。${location ? `其平台位置为 ${location}。` : "平台位置尚未填写完整。"}您可以询问简介、营业时间或公开链接。`,
    bookings: (count: number, list: string) => `该时间段内共有 ${count} 个预约。${list ? `接下来的预约：${list}。` : ""}`,
    availability: (count: number, date: string, list: string) => `${date ? `${date} ` : ""}共有 ${count} 个可用时段。${list ? `前几个时段为：${list}。` : ""}`,
    policies: (parts: string) => `我找到了商家当前的政策。${parts ? `${parts}。` : ""}您可以询问任一政策，我可以解释现行内容或准备一份待审核的修改。`,
    knowledge: (count: number, answers: string) => count ? `我在 Girlz Culture 知识库中找到了 ${count} 个相关答案。${answers}` : "我在已发布的知识库中没有找到匹配答案。您可以换一种问法或打开帮助中心。",
    count: (count: number, label: string, list: string) => `我找到了 ${count} 个${label}。${list ? `${list}。` : ""}`,
    summary: (bookings: number, upcoming: number, value: string) => `该时间段内共有 ${bookings} 个预约${upcoming ? `，其中 ${upcoming} 个即将开始` : ""}。${value ? `已完成预约价值为 ${value}。` : ""}`,
  },
} as const;

export function presentPreparedAssistantAction(tool: string, locale = "en") {
  if (tool === "prepare_booking_reschedule_proposal") return rescheduleAssistantCopy(locale).prepared;
  const language = Object.hasOwn(copy, locale) ? locale as keyof typeof copy : "en";
  const label = tool === "prepare_customer_message" ? "message" : tool.includes("appointment") ? "appointment change" : "change";
  if (language === "fr") return `J’ai préparé cette ${label === "message" ? "proposition de message" : "modification"}. Vérifiez les détails ci-dessous. Rien ne sera enregistré avant votre confirmation.`;
  if (language === "es") return `Preparé este ${label === "message" ? "borrador de mensaje" : "cambio"}. Revisa los detalles. No se guardará nada hasta que lo confirmes.`;
  if (language === "wo") return "Waajal naa coppite bi. Seetal benn-benn li ci suuf; dara duñu denc bala ngay dëggal.";
  if (language === "zh-CN") return "我已准备好这项更改。请检查下方详情；在您确认前不会保存任何内容。";
  return `I prepared this ${label}. Review the details below. Nothing will be saved until you confirm.`;
}
