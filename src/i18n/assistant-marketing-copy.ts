export const assistantMarketingCopy=(locale:string)=>{
 const i=locale==='fr'?1:locale==='es'?2:locale==='zh-CN'?3:0;
 return {
 read:["Your business has {count} marketing posts.","Votre entreprise a {count} publications marketing.","Tu negocio tiene {count} publicaciones de marketing.","您的商家有 {count} 篇营销帖子。"][i],
 marketing_draft:['Save marketing draft','Enregistrer le brouillon marketing','Guardar borrador de marketing','保存营销草稿'][i],
 marketing_publish:['Publish marketing post','Publier le contenu marketing','Publicar contenido de marketing','发布营销内容'][i],
 marketing_cancel:['Withdraw marketing post','Retirer le contenu marketing','Retirar contenido de marketing','撤回营销内容'][i],
 scope:['This changes your Girlz Culture post only. It does not post to social media or send customers a message.','Cela modifie uniquement votre publication Girlz Culture. Aucun contenu n’est publié sur les réseaux sociaux et aucun message n’est envoyé aux clients.','Solo modifica tu publicación de Girlz Culture. No publica en redes sociales ni envía mensajes a clientes.','仅更改您的 Girlz Culture 帖子，不会发布到社交媒体或向客户发送消息。'][i],
 review:['I reviewed all four versions and have permission to publish the selected photos.','J’ai vérifié les quatre versions et je suis autorisé à publier les photos sélectionnées.','Revisé las cuatro versiones y tengo permiso para publicar las fotos seleccionadas.','我已审核全部四种语言版本，并有权发布所选照片。'][i],
 scheduled:['Scheduled publication','Publication prévue','Publicación programada','计划发布时间'][i],
 expires:['Ends','Fin','Finaliza','结束时间'][i],
 source:['Selected source','Source sélectionnée','Contenido seleccionado','所选内容'][i],
 photo:['Selected photo','Photo sélectionnée','Foto seleccionada','所选照片'][i],
 };
};
