import 'server-only';
import { NON_DOM_VISUAL_TOKENS } from '@/lib/nonDomVisualTokens.mjs';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import path from 'node:path';
import { financeReportText, type FinanceReport, type ReportCell } from '@/lib/businessFinanceReport';

/** Repeat the record label in each continuation, retaining every data column.
 * Wide accountant sheets must not become unreadable portrait PDF tables. */
export function financePdfColumnGroups(columnCount: number): number[][] {
  if (columnCount <= 6) return [Array.from({length: columnCount}, (_, index) => index)];
  const groups: number[][] = [];
  for (let start = 1; start < columnCount; start += 4) {
    groups.push([0, ...Array.from({length: Math.min(4, columnCount - start)}, (_, index) => start + index)]);
  }
  return groups;
}

export async function financeSpreadsheet(report: FinanceReport) {
  const book=new ExcelJS.Workbook();book.creator='Girlz Culture';book.created=new Date(report.generatedAt);
  for(const section of report.sections){
    // Exact labels and stored numeric amounts; never treat names as formulas.
    const sheet=book.addWorksheet(section.title.replace(/[\\/*?:[\]]/g,' ').slice(0,31));
    sheet.addRow([report.title]);sheet.addRow([report.business]);sheet.addRow([`${report.period.from} - ${report.period.to} | ${report.period.timeZone} | USD`]);sheet.addRow([]);
    const header=sheet.addRow(section.headers);header.font={bold:true,color:{argb:'FFFFFFFF'}};header.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF006B88'}};header.height=30;
    sheet.views=[{state:'frozen',ySplit:5}];sheet.autoFilter={from:{row:5,column:1},to:{row:Math.max(5,section.rows.length+5),column:section.headers.length}};
    section.rows.forEach(values=>{const row=sheet.addRow(values.map(item=>item.value));values.forEach((item,index)=>{const c=row.getCell(index+1);c.numFmt=item.kind==='money'?'"USD "#,##0.00;[Red]("USD "#,##0.00)':item.kind==='count'?'0':'@';c.alignment={vertical:'top',wrapText:true};});});
    sheet.columns.forEach((column,index)=>{column.width=index===0?34:24;});
    sheet.pageSetup={paperSize:9,orientation:section.headers.length>4?'landscape':'portrait',fitToPage:true,fitToWidth:1,fitToHeight:0,printTitlesRow:'1:5'};
  }
  const notes=book.addWorksheet(financeReportText(report.locale,'Report notes'));notes.getColumn(1).width=100;
  notes.addRow([report.title]);notes.addRow([report.business]);notes.addRow([`${report.period.from} - ${report.period.to} | ${report.period.timeZone} | USD`]);notes.addRow([report.generatedAt]);
  report.notes.forEach(note=>{const row=notes.addRow([note]);row.alignment={wrapText:true,vertical:'top'};row.height=48;});
  return Buffer.from(await book.xlsx.writeBuffer());
}

export async function financePdf(report: FinanceReport): Promise<Buffer> {
  const font=path.join(process.cwd(),'src/assets/report-fonts/NotoSansSC-Regular.otf');
  const doc=new PDFDocument({size:'A4',margin:40,font,bufferPages:true,info:{Title:report.title,Author:'Girlz Culture',Subject:`${report.period.from} - ${report.period.to} | ${report.period.timeZone} | USD`}});
  const chunks: Buffer[]=[];const output=new Promise<Buffer>((resolve,reject)=>{doc.on('data',(chunk:Buffer)=>chunks.push(chunk));doc.on('end',()=>resolve(Buffer.concat(chunks)));doc.on('error',reject);});
  const width=doc.page.width-80;
  const text=(value:string,size=10,color:string=NON_DOM_VISUAL_TOKENS.primaryText)=>{doc.fontSize(size).fillColor(color).text(value,{width,lineGap:3});};
  text('GIRLZ CULTURE',10,'#006b88');text(report.title,23);text(report.business,13);text(`${report.period.from} - ${report.period.to} | ${report.period.timeZone} | USD`,9);doc.moveDown();
  const format=(item:ReportCell)=>item.kind==='money'?new Intl.NumberFormat(report.locale,{style:'currency',currency:'USD'}).format(Number(item.value)):String(item.value);
  // Concise accountant summary; full immutable references and transactions are
  // in the accompanying spreadsheet, not silently truncated from a PDF table.
  for(const section of report.sections.filter(section=>!section.detail)){
    const groups=financePdfColumnGroups(section.headers.length);
    for(const [groupIndex,indices] of groups.entries()){
    if(doc.y>doc.page.height-170)doc.addPage();doc.moveDown(.7);text(section.title+(groups.length>1?` (${groupIndex+1}/${groups.length})`:''),15,'#006b88');doc.moveDown(.3);
    if(!section.rows.length){text(financeReportText(report.locale,'No records in this period.'),10);break;}
    const headers=indices.map(index=>section.headers[index]);
    const columns=headers.length;const widths=columns===2?[width*.7,width*.3]:columns===3?[width*.45,width*.2,width*.35]:[width*.28,...Array(columns-1).fill(width*.72/(columns-1))];
    const row=(values:string[],header=false)=>{
      doc.fontSize(header?8:9);
      const height=Math.max(26,...values.map((value,index)=>doc.heightOfString(value,{width:widths[index]-12,lineGap:2})+14));
      if(doc.y+height>doc.page.height-55){doc.addPage();if(!header)row(headers,true);}
      const y=doc.y;doc.rect(40,y,width,height).fill(header?'#006b88':NON_DOM_VISUAL_TOKENS.lightSurface);let x=40;
      values.forEach((value,index)=>{doc.fillColor(header?'#ffffff':NON_DOM_VISUAL_TOKENS.primaryText).text(value,x+6,y+5,{width:widths[index]-12,lineGap:2});x+=widths[index];});
      doc.x=40;doc.y=y+height+2;
    };
    row(headers,true);for(const values of section.rows)row(indices.map(index=>format(values[index])));
    }
  }
  doc.moveDown();text(financeReportText(report.locale,'Report notes'),15,'#006b88');report.notes.forEach(note=>{doc.moveDown(.35);text(note,9);});
  const pages=doc.bufferedPageRange();for(let index=0;index<pages.count;index++){
    doc.switchToPage(index);
    // Footers deliberately sit below the content margin. Temporarily allow
    // that region; otherwise PDFKit flows each footer onto a new blank page.
    const bottom=doc.page.margins.bottom;doc.page.margins.bottom=0;
    doc.fontSize(8).fillColor('#52616a').text(`${index+1} / ${pages.count}`,40,doc.page.height-32,{width,align:'right',lineBreak:false});doc.page.margins.bottom=bottom;
  }
  if(doc.bufferedPageRange().count!==pages.count)throw Error('FINANCE_EXPORT_PAGINATION_FAILED');
  doc.end();return output;
}
