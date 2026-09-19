const settingsReadMessages: Record<string, string> = {
  en: "I found your current business settings and saved interface language. Ask about notification preferences or assistant appearance. No settings have changed.",
  fr: "J’ai trouvé les réglages actuels de votre entreprise et la langue d’interface enregistrée. Vous pouvez demander vos préférences de notification ou l’apparence de l’assistant. Aucun réglage n’a changé.",
  es: "Encontré la configuración actual de tu negocio y el idioma guardado de la interfaz. Puedes preguntar por las notificaciones o la apariencia del asistente. No se cambió ninguna configuración.",
  "zh-CN": "我已读取您商家的当前设置和已保存的界面语言。您可以询问通知偏好或助手外观。没有更改任何设置。",
  wo: "Gis naa sa tànneefi liggéey ak làkku interface bi nga denc. Mën nga laaj ci yégle yi walla melokaanu ndimbalikat bi. Soppiwuma benn tànneef.",
};

export function assistantSettingsReadMessage(locale: string) {
  return settingsReadMessages[locale] || settingsReadMessages.en;
}
