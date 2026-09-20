const rows=[
["Booking summary","Résumé des réservations","Resumen de reservas","预约汇总"],
["List view","Vue liste","Vista de lista","列表视图"],
["Client","Client","Cliente","客户"],
  [
    "Bookings workspace",
    "Espace réservations",
    "Espacio de reservas",
    "预约工作区"
  ],
  [
    "Manage appointments, clients and booking details in one place.",
    "Gérez rendez-vous, clients et détails des réservations au même endroit.",
    "Gestiona citas, clientes y detalles de reservas en un solo lugar.",
    "集中管理预约、客户及预约详情。"
  ],
  [
    "Appointments in period",
    "Rendez-vous sur la période",
    "Citas del período",
    "所选期间预约"
  ],
  [
    "Summary uses the date, staff and service filters. Booking value is not money received; test bookings are excluded.",
    "Le résumé utilise les filtres de date, personnel et service. La valeur des réservations n’est pas un encaissement ; les tests sont exclus.",
    "El resumen usa los filtros de fecha, personal y servicio. El valor de reservas no es dinero recibido; se excluyen las pruebas.",
    "汇总采用日期、员工和服务筛选。预约金额不等于实收款项；不包含测试预约。"
  ],
  [
    "Some completed appointments have no recorded price.",
    "Certains rendez-vous terminés n’ont pas de prix enregistré.",
    "Algunas citas completadas no tienen precio registrado.",
    "部分已完成预约未记录价格。"
  ],
  [
    "Date, staff and service filters",
    "Filtres de date, personnel et service",
    "Filtros de fecha, personal y servicio",
    "日期、员工及服务筛选"
  ],
  [
    "From date",
    "Date de début",
    "Fecha inicial",
    "开始日期"
  ],
  [
    "To date",
    "Date de fin",
    "Fecha final",
    "结束日期"
  ],
  [
    "Apply dates",
    "Appliquer les dates",
    "Aplicar fechas",
    "应用日期"
  ],
  [
    "Staff filter",
    "Filtrer le personnel",
    "Filtrar personal",
    "员工筛选"
  ],
  [
    "Service filter",
    "Filtrer les services",
    "Filtrar servicios",
    "服务筛选"
  ],
  [
    "Custom services",
    "Services personnalisés",
    "Servicios personalizados",
    "自定义服务"
  ],
  [
    "End date must not precede start date.",
    "La date de fin ne peut pas précéder le début.",
    "La fecha final no puede preceder a la inicial.",
    "结束日期不能早于开始日期。"
  ],
  [
    "Matching appointments: {value0}",
    "Rendez-vous correspondants : {value0}",
    "Citas coincidentes: {value0}",
    "匹配预约：{value0}"
  ],
  [
    "No appointments match these filters",
    "Aucun rendez-vous ne correspond à ces filtres",
    "Ninguna cita coincide con estos filtros",
    "没有符合这些筛选条件的预约"
  ],
  [
    "Try another date or clear filters. New appointments use the existing availability and conflict checks.",
    "Essayez une autre date ou effacez les filtres. Les nouveaux rendez-vous respectent les disponibilités et contrôles de conflit existants.",
    "Prueba otra fecha o borra los filtros. Las nuevas citas respetan la disponibilidad y los controles de conflictos existentes.",
    "请尝试其他日期或清除筛选。新预约仍须通过现有的可预约时间及冲突检查。"
  ],
  [
    "Appointment pages",
    "Pages de rendez-vous",
    "Páginas de citas",
    "预约分页"
  ],
  [
    "Service unavailable",
    "Service indisponible",
    "Servicio no disponible",
    "服务不可用"
  ],
  [
    "Date unavailable",
    "Date indisponible",
    "Fecha no disponible",
    "日期不可用"
  ],
  [
    "Status unavailable",
    "Statut indisponible",
    "Estado no disponible",
    "状态不可用"
  ],
  [
    "All dates",
    "Toutes les dates",
    "Todas las fechas",
    "所有日期"
  ]
];
export const BUSINESS_BOOKINGS_SOURCE_MESSAGES:Record<string,Record<string,string>>=Object.fromEntries(["fr","es","zh-CN"].map((locale,index)=>[locale,Object.fromEntries(rows.map(row=>[row[0],row[index+1]]))]));
