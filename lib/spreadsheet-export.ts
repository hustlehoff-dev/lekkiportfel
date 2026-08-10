import { strToU8, zipSync } from "fflate";

export type SpreadsheetCell = string | number | boolean | null | undefined;
export type SpreadsheetSheet = { name: string; title: string; rows: SpreadsheetCell[][]; moneyColumns?: number[]; integerColumns?: number[]; dateColumns?: number[] };

const xmlEscape = (value: unknown) => String(value ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&apos;");
const columnName = (index: number) => { let value=index+1,result="";while(value){value-=1;result=String.fromCharCode(65+value%26)+result;value=Math.floor(value/26)}return result };
const safeSheetName = (name: string) => name.replace(/[\\/*?:[\]]/g," ").slice(0,31)||"Arkusz";

function cellXml(value: SpreadsheetCell,row:number,column:number,style:number) {
  const reference=`${columnName(column)}${row}`;
  if(value===null||value===undefined||value==="")return `<c r="${reference}" s="${style}"/>`;
  if(style===5&&typeof value==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(value)){const serial=(Date.parse(`${value}T00:00:00Z`)-Date.UTC(1899,11,30))/86400000;return `<c r="${reference}" s="5"><v>${serial}</v></c>`}
  if(typeof value==="number")return `<c r="${reference}" s="${style}"><v>${Number.isFinite(value)?value:0}</v></c>`;
  if(typeof value==="boolean")return `<c r="${reference}" s="${style}" t="b"><v>${value?1:0}</v></c>`;
  return `<c r="${reference}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(value)}</t></is></c>`;
}

function worksheetXml(sheet: SpreadsheetSheet) {
  const rows=sheet.rows.length?sheet.rows:[["Brak danych"]];
  const columnCount=Math.max(1,...rows.map(row=>row.length));
  const widths=Array.from({length:columnCount},(_,column)=>Math.min(48,Math.max(11,sheet.title.length/columnCount,...rows.map(row=>String(row[column]??"").length+2))));
  const columnXml=widths.map((width,index)=>`<col min="${index+1}" max="${index+1}" width="${width}" customWidth="1"/>`).join("");
  const title=`<row r="1" ht="28" customHeight="1">${cellXml(sheet.title,1,0,1)}</row>`;
  const header=`<row r="3" ht="24" customHeight="1">${rows[0].map((value,column)=>cellXml(value,3,column,2)).join("")}</row>`;
  const body=rows.slice(1).map((values,index)=>{const row=index+4;return `<row r="${row}">${values.map((value,column)=>{const style=sheet.moneyColumns?.includes(column)?3:sheet.integerColumns?.includes(column)?4:sheet.dateColumns?.includes(column)?5:0;return cellXml(value,row,column,style)}).join("")}</row>`}).join("");
  const lastColumn=columnName(columnCount-1),lastRow=Math.max(3,rows.length+2);
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0" showGridLines="0"><pane ySplit="3" topLeftCell="A4" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${columnXml}</cols><sheetData>${title}<row r="2"/>${header}${body}</sheetData><mergeCells count="1"><mergeCell ref="A1:${lastColumn}1"/></mergeCells><autoFilter ref="A3:${lastColumn}${lastRow}"/><pageMargins left="0.3" right="0.3" top="0.5" bottom="0.5" header="0.2" footer="0.2"/></worksheet>`;
}

export function buildXlsxBytes(inputSheets: SpreadsheetSheet[]) {
  const sheets=inputSheets.map(sheet=>({...sheet,name:safeSheetName(sheet.name)}));
  const overrides=sheets.map((_,index)=>`<Override PartName="/xl/worksheets/sheet${index+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("");
  const workbookSheets=sheets.map((sheet,index)=>`<sheet name="${xmlEscape(sheet.name)}" sheetId="${index+1}" r:id="rId${index+1}"/>`).join("");
  const workbookRelationships=sheets.map((_,index)=>`<Relationship Id="rId${index+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index+1}.xml"/>`).join("");
  const zip:Record<string,Uint8Array>={
    "[Content_Types].xml":strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>${overrides}</Types>`),
    "_rels/.rels":strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`),
    "docProps/core.xml":strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>Kapitał — raport PIT-38</dc:title><dc:creator>Kapitał</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:created></cp:coreProperties>`),
    "docProps/app.xml":strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>Kapitał</Application></Properties>`),
    "xl/workbook.xml":strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${workbookSheets}</sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>`),
    "xl/_rels/workbook.xml.rels":strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${workbookRelationships}<Relationship Id="rId${sheets.length+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`),
    "xl/styles.xml":strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="# ##0.00 [$zł-pl-PL];[Red]-# ##0.00 [$zł-pl-PL];-"/></numFmts><fonts count="3"><font><sz val="10"/><name val="Arial"/></font><font><b/><sz val="16"/><color rgb="FFFFFFFF"/><name val="Arial"/></font><font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Arial"/></font></fonts><fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF122019"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FF237A4B"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="2"><border/><border><bottom style="thin"><color rgb="FFD9E2DC"/></bottom></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="6"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="0" fontId="2" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center"/></xf><xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right"/></xf><xf numFmtId="3" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right"/></xf><xf numFmtId="14" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`),
  };
  sheets.forEach((sheet,index)=>{zip[`xl/worksheets/sheet${index+1}.xml`]=strToU8(worksheetXml(sheet))});
  return zipSync(zip,{level:6});
}

const csvEscape = (value: SpreadsheetCell) => {const text=String(value??"");return /[";\r\n]/.test(text)?`"${text.replace(/"/g,'""')}"`:text};
export function buildCsvZipBytes(sheets: SpreadsheetSheet[]) {
  const files:Record<string,Uint8Array>={};
  for(const sheet of sheets){const csv=`\uFEFF${sheet.rows.map(row=>row.map(csvEscape).join(";")).join("\r\n")}`;files[`${safeSheetName(sheet.name)}.csv`]=strToU8(csv)}
  return zipSync(files,{level:6});
}

export function downloadBytes(bytes:Uint8Array,fileName:string,mime:string){const blob=new Blob([bytes as BlobPart],{type:mime});const url=URL.createObjectURL(blob);const anchor=document.createElement("a");anchor.href=url;anchor.download=fileName;anchor.click();window.setTimeout(()=>URL.revokeObjectURL(url),1000)}
