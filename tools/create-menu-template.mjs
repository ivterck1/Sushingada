// Herramienta de autoría opcional: requiere @oai/artifact-tool del entorno Codex.
import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
import {Workbook, SpreadsheetFile} from '@oai/artifact-tool';
const wb = Workbook.create();
const data = {
 MENU: [
 ['categoria','nombre','descripcion','precio','imagen','destacado','disponible','orden'],
 ['Entradas','Entrada ficticia de ejemplo','Ejemplo ficticio: sustituir por ingredientes y porción.',65,'entrada-ejemplo.webp','SI','SI',1],
 ['Platos fuertes','Plato ficticio de ejemplo','Ejemplo ficticio: sustituir por ingredientes y porción.',120,'plato-ejemplo.webp','SI','SI',1],
 ['Bebidas','Bebida ficticia de ejemplo','Ejemplo ficticio: sustituir por ingredientes y tamaño.',35,'bebida-ejemplo.webp','SI','SI',1],
 ['Postres','Postre ficticio de ejemplo','Ejemplo ficticio temporalmente no disponible.',55,'postre-ejemplo.webp','NO','NO',1]],
 DATOS_NEGOCIO: [['campo','valor'],['nombre','Negocio ficticio de ejemplo'],['nombre_corto','Ejemplo'],['descripcion','Sustituye este texto por la descripción del negocio.'],['whatsapp',''],['whatsapp_activo','NO'],['horario','Indica días y horas de atención'],['direccion','Indica dirección del negocio'],['cobertura','Indica zonas de entrega'],['instagram',''],['facebook',''],['moneda','MXN'],['locale','es-MX']],
 CATEGORIAS: [['categoria','orden'],['Entradas',1],['Platos fuertes',2],['Bebidas',3],['Postres',4]]
};
const widths = {MENU:[23,32,58,14,29,15,15,12],DATOS_NEGOCIO:[24,70],CATEGORIAS:[27,14]};
for (const [name, values] of Object.entries(data)) {
 const sheet=wb.worksheets.add(name), last=String.fromCharCode(64+values[0].length);
 sheet.getRange(`A1:${last}${values.length}`).values=values;
 sheet.showGridLines=false;
 sheet.getRange(`A1:${last}${values.length}`).format.font={name:'Arial',size:11,color:'#233044'};
 sheet.getRange(`A1:${last}${values.length}`).format.rowHeight=32;
 sheet.getRange(`A1:${last}${values.length}`).format.verticalAlignment='center';
 sheet.getRange(`A2:${last}${values.length}`).format.fill='#F3F6FA';
 sheet.getRange(`A2:${last}${values.length}`).format.wrapText=true;
 sheet.tables.add(`A1:${last}${values.length}`,true,`${name}Tabla`);
 sheet.getRange(`A1:${last}1`).format={fill:'#233044',font:{name:'Arial',size:11,bold:true,color:'#FFFFFF'}};
 widths[name].forEach((width,i)=>sheet.getRange(`${String.fromCharCode(65+i)}1`).format.columnWidth=width);
 sheet.freezePanes.freezeRows(1);
 if(name==='MENU') {
  sheet.getRange('F2:G1001').dataValidation={rule:{type:'list',values:['SI','NO']}};
  sheet.getRange('D2:D1001').setNumberFormat('0.00');
  sheet.getRange('H2:H1001').setNumberFormat('0');
 }
 if(name==='DATOS_NEGOCIO') {
  sheet.getRange('B5').setNumberFormat('@');
  sheet.getRange('B6').dataValidation={rule:{type:'list',values:['SI','NO']}};
  sheet.getRange('D1:D4').values=[['INSTRUCCIONES'],['Datos y productos ficticios: reemplázalos.'],['WhatsApp México: 52 + 10 dígitos; sin +, espacios ni guiones.'],['Consulta docs/MENU_DESDE_EXCEL.md antes de importar.']];
  sheet.getRange('D1').format.columnWidth=67;
  sheet.getRange('D1:D4').format.wrapText=true;
  sheet.getRange('D1:D4').format.rowHeight=32;
 }
}
wb.recalculate();
await fs.mkdir('templates',{recursive:true});
await fs.mkdir('tmp',{recursive:true});
for(const [name,values] of Object.entries(data)) {
 console.log((await wb.inspect({kind:'table',range:`${name}!A1:${name==='MENU'?'H': 'B'}${values.length}`,include:'values',tableMaxRows:15,tableMaxCols:8,maxChars:1500})).ndjson);
 const preview=await wb.render({sheetName:name,range:name==='DATOS_NEGOCIO'?'A1:D13':`A1:${name==='MENU'?'H':'B'}${values.length}`,scale:1,format:'png'});
 await fs.writeFile(`tmp/${name}.png`,new Uint8Array(await preview.arrayBuffer()));
}
await (await SpreadsheetFile.exportXlsx(wb)).save('templates/menu-cliente.xlsx');
// ExcelJS no reconoce los prefijos x: del exportador. Normalizar al namespace
// predeterminado equivalente y guardar una copia nativa compatible con el lector.
const require = createRequire(`${process.cwd()}/package.json`);
const ExcelJS = require('exceljs');
const JSZip = require('jszip');
const zip = await JSZip.loadAsync(await fs.readFile('templates/menu-cliente.xlsx'));
for (const entry of Object.values(zip.files)) {
 if (!entry.dir && entry.name.endsWith('.xml')) {
  const xml = await entry.async('string');
  zip.file(entry.name, xml.replace(/(<\/?)(x:)/g, '$1').replace(/xmlns:x=/g, 'xmlns='));
 }
 if (!entry.dir && entry.name.startsWith('xl/worksheets/_rels/') && entry.name.endsWith('.rels')) {
  zip.file(entry.name, (await entry.async('string')).replace(/Target="\/xl\/tables\//g, 'Target="../tables/'));
 }
}
const compatible = new ExcelJS.Workbook();
await compatible.xlsx.load(await zip.generateAsync({type:'nodebuffer'}));
for(const sheet of compatible.worksheets) {
 sheet.views=[{state:'frozen',ySplit:1,showGridLines:false}];
 sheet.autoFilter={from:'A1',to:sheet.name==='MENU'?'H5':sheet.name==='CATEGORIAS'?'B5':'B13'};
}
await compatible.xlsx.writeFile('templates/menu-cliente.xlsx');
await fs.rm('templates/menu-cliente.xlsx.inspect.ndjson',{force:true});
