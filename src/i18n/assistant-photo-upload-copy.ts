export const assistantUploadCopy=(locale:string)=>{
 const index=locale==='fr'?1:locale==='es'?2:locale==='zh-CN'?3:0;
 return {title:['Add a photo','Ajouter une photo','Añadir una foto','添加照片'][index],
  help:['Choose and crop a photo, then review before adding it to your gallery.','Choisissez et recadrez une photo, puis vérifiez-la avant de l’ajouter à votre galerie.','Elige y recorta una foto y revísala antes de añadirla a tu galería.','选择并裁剪照片，然后审核后再添加到图库。'][index],
  request:['Review adding this uploaded photo to my gallery.','Vérifier l’ajout de cette photo à ma galerie.','Revisar la incorporación de esta foto a mi galería.','审核将这张已上传的照片添加到我的图库。'][index],
  staged:['Photo uploaded. Review the change below.','Photo importée. Vérifiez la modification ci-dessous.','Foto subida. Revisa el cambio a continuación.','照片已上传。请审核下方的更改。'][index]};
};
