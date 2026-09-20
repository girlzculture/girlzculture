import { DASHBOARD_REDESIGN_SOURCE_MESSAGES } from "@/i18n/dashboard-redesign-source-catalog";
// Launch workspace copy. Source completeness is automated; native-language review remains a release check.
const rows: readonly (readonly [string, string, string, string, string])[] = [
  [
    "{value0} calendar",
    "Calendario de {value0}",
    "Calendrier {value0}",
    "Arminaat {value0}",
    "{value0}日历"
  ],
  [
    "{value0} hr",
    "{value0} h",
    "{value0} h",
    "{value0} waxtu",
    "{value0} 小时"
  ],
  [
    "{value0}–{value1} hr",
    "{value0}–{value1} h",
    "{value0}–{value1} h",
    "{value0}–{value1} waxtu",
    "{value0}–{value1} 小时"
  ],
  [
    "Add a service",
    "Añadir un servicio",
    "Ajouter un service",
    "Yokk service",
    "添加服务"
  ],
  [
    "Ask about your business, find an answer, or prepare a change. I will keep it conversational, and you will review anything before it is saved.",
    "Pregunta sobre tu negocio, busca una respuesta o prepara un cambio. Conversaremos y revisarás todo antes de guardarlo.",
    "Posez une question sur votre entreprise, cherchez une réponse ou préparez une modification. Nous échangerons et vous vérifierez tout avant l’enregistrement.",
    "Laaj ci sa liggéey, seet tontu walla waajal coppite. Dinañu waxtaan, te dinga seet lépp bala ñu koy denc.",
    "您可以询问商家事务、查找答案或准备修改。我们会通过对话逐步处理，所有修改都需您审核后才会保存。"
  ],
  [
    "Block time",
    "Bloquear horario",
    "Bloquer un créneau",
    "Tëj waxtu",
    "屏蔽时段"
  ],
  [
    "Calendar date",
    "Fecha del calendario",
    "Date du calendrier",
    "Bésu arminaat",
    "日历日期"
  ],
  [
    "Calendar view",
    "Vista del calendario",
    "Vue du calendrier",
    "Gisu arminaat",
    "日历视图"
  ],
  [
    "Cancellation notice: {value0} hours",
    "Aviso de cancelación: {value0} horas",
    "Préavis d’annulation : {value0} heures",
    "Yëgle neenal: {value0} waxtu",
    "取消须提前：{value0} 小时"
  ],
  [
    "Category for blank cells",
    "Categoría para celdas vacías",
    "Catégorie des cellules vides",
    "Wàll bu dëkk ci cellules yu féex",
    "空白单元格默认类别"
  ],
  [
    "Check another day",
    "Consultar otro día",
    "Vérifier un autre jour",
    "Seet beneen bés",
    "查看其他日期"
  ],
  [
    "Check tomorrow",
    "Consultar mañana",
    "Vérifier demain",
    "Seet ëllëg",
    "查看明天"
  ],
  [
    "Clear page search",
    "Borrar búsqueda de páginas",
    "Effacer la recherche de pages",
    "Far seetu xët",
    "清除页面搜索"
  ],
  [
    "Column {value0}",
    "Columna {value0}",
    "Colonne {value0}",
    "Ponq {value0}",
    "第 {value0} 列"
  ],
  [
    "Completed booking value",
    "Valor de reservas completadas",
    "Valeur des réservations terminées",
    "Njëgu booking yi jeex",
    "已完成预约价值"
  ],
  [
    "Day",
    "Día",
    "Jour",
    "Bés",
    "日"
  ],
  [
    "Week",
    "Semana",
    "Semaine",
    "Ayu-bés",
    "周"
  ],
  [
    "Month",
    "Mes",
    "Mois",
    "Weer",
    "月"
  ],
  [
    "Dictation paused while you edit. Tap the microphone to continue.",
    "Dictado pausado mientras editas. Toca el micrófono para continuar.",
    "Dictée en pause pendant la modification. Touchez le microphone pour reprendre.",
    "Wax ji taxaw na ngir nga soppi mbind mi. Bës mikro bi ngir kontine.",
    "编辑时已暂停听写。点击麦克风继续。"
  ],
  [
    "Explain cancellations",
    "Explicar cancelaciones",
    "Expliquer les annulations",
    "Leeral neenal yi",
    "解释取消政策"
  ],
  [
    "Explain deposits",
    "Explicar depósitos",
    "Expliquer les acomptes",
    "Leeral xaalisu wóoral",
    "解释订金政策"
  ],
  [
    "Filter calendar appointments",
    "Filtrar citas del calendario",
    "Filtrer les rendez-vous du calendrier",
    "Tànn rendez-vous ci arminaat",
    "筛选日历预约"
  ],
  [
    "Find a client, service or status",
    "Buscar cliente, servicio o estado",
    "Rechercher un client, service ou statut",
    "Seet kiliyaan, service walla nekkin",
    "查找客户、服务或状态"
  ],
  [
    "Find a dashboard page",
    "Buscar una página del panel",
    "Rechercher une page du tableau de bord",
    "Seet xëtu dashboard",
    "查找工作台页面"
  ],
  [
    "Find a service",
    "Buscar un servicio",
    "Rechercher un service",
    "Seet service",
    "查找服务"
  ],
  [
    "Find calendar gaps",
    "Buscar huecos en el calendario",
    "Rechercher des créneaux libres",
    "Seet waxtu yu féex ci arminaat",
    "查找日历空闲时段"
  ],
  [
    "Find open time",
    "Buscar horarios libres",
    "Rechercher un horaire libre",
    "Seet waxtu bu féex",
    "查找空闲时间"
  ],
  [
    "GC Assistant could not reach its AI service. The dashboard and read-only quick actions are still available.",
    "GC Assistant no pudo conectar con el servicio de IA. El panel y las acciones de consulta siguen disponibles.",
    "GC Assistant n’a pas pu joindre son service IA. Le tableau de bord et les actions de consultation restent disponibles.",
    "GC Assistant jotul ci service IA bi. Dashboard ak jëf yu gaaw ngir seet rekk dañuy dox ba tey.",
    "GC Assistant 无法连接 AI 服务。工作台和只读快捷操作仍可使用。"
  ],
  [
    "GC Assistant has reached its protected usage allowance. Your dashboard data is safe; contact Girlz Culture support to review access.",
    "GC Assistant alcanzó su límite de uso protegido. Tus datos están seguros; contacta con soporte de Girlz Culture para revisar el acceso.",
    "GC Assistant a atteint sa limite d’utilisation protégée. Vos données restent en sécurité ; contactez l’assistance Girlz Culture pour vérifier l’accès.",
    "GC Assistant agsi na ci kemu jëfandikoom. Sa donnees dañu wóor; wax ak ndimbalu Girlz Culture ngir seet sa accès.",
    "GC Assistant 已达到保护性使用限额。工作台数据仍然安全；请联系 Girlz Culture 支持检查访问权限。"
  ],
  [
    "GC Assistant introduction",
    "Presentación de GC Assistant",
    "Présentation de GC Assistant",
    "Nuyoo GC Assistant",
    "GC Assistant 简介"
  ],
  [
    "GC Assistant is working",
    "GC Assistant está trabajando",
    "GC Assistant travaille",
    "GC Assistant mi ngi liggéey",
    "GC Assistant 正在处理"
  ],
  [
    "GC Assistant needs its approved AI cost settings before free-form chat can run. The dashboard quick actions still work.",
    "GC Assistant necesita la configuración aprobada de costes de IA para conversar libremente. Las acciones rápidas del panel siguen funcionando.",
    "GC Assistant nécessite les paramètres de coût IA approuvés pour la conversation libre. Les actions rapides restent disponibles.",
    "GC Assistant soxla na jekkal njëgu IA bi ñu dëggal ngir waxtaan. Jëf yu gaaw yi ci dashboard dañuy dox ba tey.",
    "自由对话需要为 GC Assistant 配置经批准的 AI 费用设置。工作台快捷操作仍然可用。"
  ],
  [
    "Heading row",
    "Fila de encabezados",
    "Ligne des en-têtes",
    "Ràngu bopp yi",
    "表头行"
  ],
  [
    "Hours (e.g. 1.5)",
    "Horas (p. ej. 1,5)",
    "Heures (ex. 1,5)",
    "Waxtu (misaal 1.5)",
    "小时（如 1.5）"
  ],
  [
    "Minutes (e.g. 90)",
    "Minutos (p. ej. 90)",
    "Minutes (ex. 90)",
    "Simili (misaal 90)",
    "分钟（如 90）"
  ],
  [
    "I reviewed the field mapping, units, prices and rows. Save these changes to this business.",
    "Revisé la correspondencia de campos, unidades, precios y filas. Guardar estos cambios en este negocio.",
    "J’ai vérifié les correspondances, unités, prix et lignes. Enregistrer ces modifications pour cette entreprise.",
    "Seet naa méngale wàll yi, unite yi, njëg yi ak ràng yi. Denc coppite yii ci liggéey bii.",
    "我已核对字段映射、单位、价格和各行数据。将这些修改保存到此商家。"
  ],
  [
    "Import preview pages",
    "Páginas de revisión de importación",
    "Pages d’aperçu de l’import",
    "Xët yi ngir seet import",
    "导入预览分页"
  ],
  [
    "Import review",
    "Revisión de importación",
    "Vérification de l’import",
    "Seetu import",
    "导入审核"
  ],
  [
    "Listening. Your browser's speech service processes audio. Edit the text to pause; tap again to stop.",
    "Escuchando. El servicio de voz del navegador procesa el audio. Edita para pausar; toca de nuevo para detener.",
    "Écoute en cours. Le service vocal du navigateur traite l’audio. Modifiez le texte pour mettre en pause ; touchez à nouveau pour arrêter.",
    "Mi ngi déglu. Service waxu navigateur bi moo liggéey ci audio bi. Soppi mbind mi ngir taxawal; bësaat ngir dakkal.",
    "正在聆听。浏览器语音服务会处理音频。编辑文字可暂停，再次点击可停止。"
  ],
  [
    "Listening. Your words are appearing in the message box.",
    "Escuchando. Tus palabras aparecen en el cuadro de mensaje.",
    "Écoute en cours. Vos paroles s’affichent dans le champ du message.",
    "Mi ngi déglu. Sa wax mi ngi feeñ ci boyetu bataaxal bi.",
    "正在聆听。您说的内容正在消息框中显示。"
  ],
  [
    "Loaded appointments and availability overrides",
    "Citas y excepciones de disponibilidad cargadas",
    "Rendez-vous et exceptions de disponibilité chargés",
    "Rendez-vous ak coppite waxtu yu ñu yeb",
    "已加载的预约和可用时间例外"
  ],
  [
    "Match your own headings to the fields below. Unmapped columns are not imported. Nothing has been saved.",
    "Relaciona tus encabezados con los campos siguientes. No se importarán columnas sin asignar. No se ha guardado nada.",
    "Associez vos en-têtes aux champs ci-dessous. Les colonnes non associées ne seront pas importées. Rien n’est enregistré.",
    "Méngal sa bopp yi ak wàll yi ci suuf. Ponq yi méngaguwul duñu leen import. Dara dencagu fi.",
    "将您自己的表头映射到下方字段。未映射的列不会导入。目前尚未保存任何内容。"
  ],
  [
    "Matching dashboard pages",
    "Páginas coincidentes del panel",
    "Pages correspondantes du tableau de bord",
    "Xëtu dashboard yu méngoo",
    "匹配的工作台页面"
  ],
  [
    "Message GC Assistant",
    "Escribir a GC Assistant",
    "Écrire à GC Assistant",
    "Bind GC Assistant",
    "向 GC Assistant 发送消息"
  ],
  [
    "Next {value0}",
    "Siguiente {value0}",
    "{value0} suivant",
    "{value0} bi topp",
    "下一个{value0}"
  ],
  [
    "Next rows",
    "Filas siguientes",
    "Lignes suivantes",
    "Ràng yi topp",
    "后续行"
  ],
  [
    "No appointments loaded",
    "No hay citas cargadas",
    "Aucun rendez-vous chargé",
    "Amul rendez-vous bu ñu yeb",
    "尚未加载预约"
  ],
  [
    "No matching page.",
    "No hay páginas coincidentes.",
    "Aucune page correspondante.",
    "Amul xët bu méngoo.",
    "没有匹配的页面。"
  ],
  [
    "not available",
    "no disponible",
    "indisponible",
    "féexul",
    "不可用"
  ],
  [
    "Not imported",
    "No se importa",
    "Non importé",
    "Importagu ko",
    "不导入"
  ],
  [
    "Numeric duration unit",
    "Unidad de duración numérica",
    "Unité des durées numériques",
    "Unite waxtu bu lim",
    "数值时长单位"
  ],
  [
    "of",
    "de",
    "sur",
    "ci",
    "共"
  ],
  [
    "Open Bookings",
    "Abrir reservas",
    "Ouvrir les réservations",
    "Ubbi booking yi",
    "打开预约"
  ],
  [
    "Open calendar",
    "Abrir calendario",
    "Ouvrir le calendrier",
    "Ubbi arminaat",
    "打开日历"
  ],
  [
    "Open earnings",
    "Abrir ganancias",
    "Ouvrir les revenus",
    "Ubbi dugal yi",
    "打开收益"
  ],
  [
    "Open Help",
    "Abrir ayuda",
    "Ouvrir l’aide",
    "Ubbi ndimbal",
    "打开帮助"
  ],
  [
    "Open My Page",
    "Abrir Mi página",
    "Ouvrir Ma page",
    "Ubbi sama xët",
    "打开我的页面"
  ],
  [
    "Open overview",
    "Abrir resumen",
    "Ouvrir l’aperçu",
    "Ubbi gisu lépp",
    "打开概览"
  ],
  [
    "Open policies",
    "Abrir políticas",
    "Ouvrir les politiques",
    "Ubbi sàrt yi",
    "打开政策"
  ],
  [
    "Open Subscription",
    "Abrir suscripción",
    "Ouvrir l’abonnement",
    "Ubbi abonmaa",
    "打开订阅"
  ],
  [
    "Page",
    "Página",
    "Page",
    "Xët",
    "页"
  ],
  [
    "Prepare a price change",
    "Preparar un cambio de precio",
    "Préparer une modification de prix",
    "Waajal coppite njëg",
    "准备价格修改"
  ],
  [
    "Previous {value0}",
    "Anterior {value0}",
    "{value0} précédent",
    "{value0} bi jiitu",
    "上一个{value0}"
  ],
  [
    "Previous rows",
    "Filas anteriores",
    "Lignes précédentes",
    "Ràng yi jiitu",
    "前面的行"
  ],
  [
    "Price (USD)",
    "Precio (USD)",
    "Prix (USD)",
    "Njëg (USD)",
    "价格（美元）"
  ],
  [
    "Reload headings from this row",
    "Recargar encabezados desde esta fila",
    "Recharger les en-têtes depuis cette ligne",
    "Yebaat bopp yi dale ci ràng bii",
    "从此行重新读取表头"
  ],
  [
    "rescheduling notice: {value0} hours",
    "aviso de cambio de cita: {value0} horas",
    "préavis de report : {value0} heures",
    "yëgle soppi rendez-vous: {value0} waxtu",
    "改期须提前：{value0} 小时"
  ],
  [
    "Review AI suggestions before saving changes.",
    "Revisa las sugerencias de IA antes de guardar cambios.",
    "Vérifiez les suggestions de l’IA avant d’enregistrer.",
    "Seet xalaatu IA yi bala ngay denc coppite yi.",
    "保存修改前请审核 AI 建议。"
  ],
  [
    "Review columns",
    "Revisar columnas",
    "Vérifier les colonnes",
    "Seet ponq yi",
    "检查列"
  ],
  [
    "Review the parsed rows, prices and durations. Nothing has been saved yet.",
    "Revisa las filas procesadas, precios y duraciones. Aún no se ha guardado nada.",
    "Vérifiez les lignes analysées, les prix et les durées. Rien n’est encore enregistré.",
    "Seet ràng yi ñu xayma, njëg yi ak waxtu yi. Dara dencagu fi.",
    "检查解析后的行、价格和时长。尚未保存任何内容。"
  ],
  [
    "Row",
    "Fila",
    "Ligne",
    "Ràng",
    "行"
  ],
  [
    "rows ready for review",
    "filas listas para revisar",
    "lignes prêtes à vérifier",
    "ràng yu pare ngir ñu seet",
    "行待审核"
  ],
  [
    "Search another topic",
    "Buscar otro tema",
    "Rechercher un autre sujet",
    "Seet beneen mbir",
    "搜索其他主题"
  ],
  [
    "Service group for blank cells",
    "Grupo de servicios para celdas vacías",
    "Groupe de services des cellules vides",
    "Mbooloom service bu cellules yu féex",
    "空白单元格默认服务组"
  ],
  [
    "Show my hours",
    "Mostrar mi horario",
    "Afficher mes horaires",
    "Wone sama waxtu yi",
    "显示营业时间"
  ],
  [
    "Show upcoming bookings",
    "Mostrar próximas reservas",
    "Afficher les réservations à venir",
    "Wone booking yiy ñëw",
    "显示即将开始的预约"
  ],
  [
    "Source order is preserved. Existing records matched by ID or catalog identity will be updated.",
    "Se conserva el orden original. Se actualizarán los registros coincidentes por ID o identidad del catálogo.",
    "L’ordre d’origine est conservé. Les fiches correspondant par ID ou identité de catalogue seront mises à jour.",
    "Toftale bu cosaan bi dina des. Fiche yi méngoo ci ID walla katalog bi dinañu leen yeesal.",
    "保留原始顺序。按 ID 或目录标识匹配到的现有记录将被更新。"
  ],
  [
    "Spreadsheet column mapping",
    "Correspondencia de columnas",
    "Correspondance des colonnes du tableur",
    "Méngale ponqu spreadsheet",
    "电子表格列映射"
  ],
  [
    "Start dictation",
    "Iniciar dictado",
    "Démarrer la dictée",
    "Tambali wax ngir bind",
    "开始听写"
  ],
  [
    "Suggested Assistant actions",
    "Acciones sugeridas por el asistente",
    "Actions suggérées par l’assistant",
    "Jëf yi ndimbal li digal",
    "助手建议操作"
  ],
  [
    "The message limit was reached. Review and send this part before continuing.",
    "Se alcanzó el límite del mensaje. Revisa y envía esta parte antes de continuar.",
    "La limite du message est atteinte. Vérifiez et envoyez cette partie avant de continuer.",
    "Agsi na ci kemu bataaxal bi. Seet te yónnee dogu mbind mii bala ngay wéy.",
    "已达到消息长度上限。请检查并发送这一部分，然后继续。"
  ],
  [
    "The ten-minute recording limit was reached. Review the transcript and send when ready.",
    "Se alcanzó el límite de diez minutos. Revisa la transcripción y envíala cuando esté lista.",
    "La limite de dix minutes est atteinte. Vérifiez la transcription et envoyez-la quand elle est prête.",
    "Agsi na ci kemu fukki simili. Seet mbind mi te yónnee ko boo paree.",
    "已达到十分钟录音上限。请检查转写内容，准备好后再发送。"
  ],
  [
    "This is booking value, not verified cash revenue or a payout.",
    "Es el valor de las reservas, no ingresos cobrados ni un pago verificado.",
    "Il s’agit de la valeur des réservations, pas de revenus encaissés ou d’un versement vérifié.",
    "Lii mooy njëgu booking yi, du xaalis bu ñu wóor ne jot nañu ko.",
    "这是预约价值，并非已核实的现金收入或付款。"
  ],
  [
    "Too many requests were sent at once. Wait a moment, then try again.",
    "Se enviaron demasiadas solicitudes a la vez. Espera un momento e inténtalo de nuevo.",
    "Trop de demandes simultanées. Patientez un instant, puis réessayez.",
    "Laaj yi bari nañu ci benn yoon. Xaaral tuuti, ba noppi jéemaat.",
    "同时发送的请求过多。请稍候再试。"
  ],
  [
    "Transcript ready. You can stop recording, review it, and send when ready.",
    "Transcripción lista. Puedes detener la grabación, revisarla y enviarla cuando esté lista.",
    "Transcription prête. Vous pouvez arrêter l’enregistrement, la vérifier et l’envoyer.",
    "Mbind mi pare na. Mën nga dakkal enregistrement bi, seet ko te yónnee ko boo paree.",
    "转写已准备好。您可以停止录音，检查内容后再发送。"
  ],
  [
    "Update my description",
    "Actualizar mi descripción",
    "Modifier ma description",
    "Yeesal sama description",
    "更新商家简介"
  ],
  [
    "Use spreadsheet category",
    "Usar categoría de la hoja",
    "Utiliser la catégorie du tableur",
    "Jëfandikoo wàllu spreadsheet",
    "使用表格中的类别"
  ],
  [
    "Use spreadsheet group",
    "Usar grupo de la hoja",
    "Utiliser le groupe du tableur",
    "Jëfandikoo mbooloom spreadsheet",
    "使用表格中的服务组"
  ],
  [
    "Use your own Excel or CSV headings and column order. Match the fields, review the parsed rows, then save. The template is optional. Images remain managed separately.",
    "Usa tus propios encabezados y orden de columnas de Excel o CSV. Relaciona los campos, revisa las filas y guarda. La plantilla es opcional. Las imágenes se gestionan por separado.",
    "Utilisez vos propres en-têtes et ordre de colonnes Excel ou CSV. Associez les champs, vérifiez les lignes, puis enregistrez. Le modèle est facultatif. Les images restent gérées séparément.",
    "Jëfandikoo sa bopp ak toftale ponqu Excel walla CSV. Méngal wàll yi, seet ràng yi te denc. Template bi warul. Nataal yi dañu leen doxal ci seen bopp.",
    "可以使用您自己的 Excel 或 CSV 表头与列顺序。匹配字段、检查解析后的行，然后保存。模板为可选项；图片仍单独管理。"
  ],
  [
    "Validate and preview rows",
    "Validar y revisar filas",
    "Valider et prévisualiser les lignes",
    "Wóoral te seet ràng yi",
    "验证并预览数据行"
  ],
  [
    "walk-ins: {value0}",
    "sin cita: {value0}",
    "sans rendez-vous : {value0}",
    "ñëw te amul rendez-vous: {value0}",
    "无需预约：{value0}"
  ],
  [
    "What is missing?",
    "¿Qué falta?",
    "Que manque-t-il ?",
    "Lan moo des?",
    "还缺少什么？"
  ],
  [
    "Worksheet",
    "Hoja de cálculo",
    "Feuille de calcul",
    "Xëtu xayma",
    "工作表"
  ],
  [
    "Workspace",
    "Espacio de trabajo",
    "Espace de travail",
    "Barabu liggéey",
    "工作区"
  ],
  [
    "Workspace breadcrumbs",
    "Ruta del espacio de trabajo",
    "Fil d’Ariane de l’espace de travail",
    "Yoonu barabu liggéey",
    "工作区导航路径"
  ],
  [
    "Your business copilot",
    "Tu asistente de negocio",
    "Votre assistant professionnel",
    "Sa ndimbalu liggéey",
    "您的商家助手"
  ],
  [
    "Your business profile is {value0}% complete. {value1}",
    "Tu perfil está completo al {value0} %. {value1}",
    "Votre profil est complété à {value0} %. {value1}",
    "Sa profilu liggéey mat na {value0}%. {value1}",
    "您的商家资料已完成 {value0}%。{value1}"
  ],
  [
    "Your current plan status is {value0}. {value1}",
    "El estado de tu plan es {value0}. {value1}",
    "Le statut de votre abonnement est {value0}. {value1}",
    "Nekkinu sa abonmaa mooy {value0}. {value1}",
    "您当前的套餐状态为 {value0}。{value1}"
  ],
  [
    "professional",
    "profesional",
    "professionnel",
    "liggéeykat",
    "专业人员"
  ],
  [
    "professionals",
    "profesionales",
    "professionnels",
    "liggéeykat yi",
    "专业人员"
  ],
  [
    "product",
    "producto",
    "produit",
    "produi",
    "商品"
  ],
  [
    "products",
    "productos",
    "produits",
    "produi yi",
    "商品"
  ],
  [
    "customer",
    "cliente",
    "client",
    "kiliyaan",
    "客户"
  ],
  [
    "customers",
    "clientes",
    "clients",
    "kiliyaan yi",
    "客户"
  ],
  [
    "review",
    "reseña",
    "avis",
    "xalaat",
    "评价"
  ],
  [
    "reviews",
    "reseñas",
    "avis",
    "xalaat yi",
    "评价"
  ],
  [
    "promotion",
    "promoción",
    "promotion",
    "promo",
    "促销"
  ],
  [
    "promotions",
    "promociones",
    "promotions",
    "promo yi",
    "促销"
  ],
  [
    "message",
    "mensaje",
    "message",
    "bataaxal",
    "消息"
  ],
  [
    "messages",
    "mensajes",
    "messages",
    "bataaxal yi",
    "消息"
  ],
  [
    "Service",
    "Servicio",
    "Service",
    "Service bi",
    "服务"
  ],
  [
    "Appointment",
    "Cita",
    "Rendez-vous",
    "Rendez-vous bi",
    "预约"
  ]
];

export const LAUNCH_WORKSPACE_SOURCE_MESSAGES: Record<string, Record<string, string>> = Object.fromEntries(
  ["es", "fr", "wo", "zh-CN"].map((locale, index) => [locale, Object.fromEntries(rows.map(row => [row[0], row[index + 1]]))]),
);

export function launchWorkspaceText(source: string, locale: string, values: Record<string, string | number> = {}) {
  const template = DASHBOARD_REDESIGN_SOURCE_MESSAGES[locale]?.[source] || LAUNCH_WORKSPACE_SOURCE_MESSAGES[locale]?.[source] || source;
  return template.replace(/\{(\w+)\}/g, (token, key: string) => Object.hasOwn(values, key) ? String(values[key]) : token);
}
