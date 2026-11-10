import fs from 'node:fs/promises';
import path from 'node:path';
import ExcelJS from 'exceljs';
import catalog from './catalog-preview.cjs';
import project from './studio-project.cjs';

const {root, projectId, temporaryDirectory} = project;
const {templateRows, preview} = catalog;
const workbook = new ExcelJS.Workbook();
const widths = {
  MENU:[28, 35, 60, 12, 40, 13, 14, 10, 34, 28],
  CATEGORIAS:[30, 12, 28],
  DATOS_NEGOCIO:[28, 66]
};

for (const [name, rows] of Object.entries(templateRows())) {
  const sheet = workbook.addWorksheet(name, {views:[{state:'frozen', ySplit:1}]});
  sheet.addRows(rows);
  widths[name].forEach((width, index) => { sheet.getColumn(index + 1).width = width; });
  sheet.getRow(1).font = {bold:true};
  sheet.autoFilter = {from:{row:1,column:1}, to:{row:1,column:rows[0].length}};
  if (name === 'DATOS_NEGOCIO') sheet.getColumn(2).numFmt = '@';
  if (name === 'MENU') {
    for (let row = 2; row <= rows.length; row++) {
      for (const column of ['F', 'G']) {
        sheet.getCell(column + row).dataValidation = {type:'list', formulae:['"SI,NO"'], showErrorMessage:true};
      }
    }
  }
}

const bytes = Buffer.from(await workbook.xlsx.writeBuffer());
const report = await preview(bytes);
if (report.errores.length || report.cambios.length || !report.negocio || report.modo !== 'ids-persistentes') {
  throw new Error(`La plantilla no coincide con la base. ${report.errores.join(' ')}`);
}
const args = process.argv.slice(2);
if (args.length > 1 || args[0] && path.extname(args[0]).toLowerCase() !== '.xlsx') {
  throw new Error('Uso: npm run menu:template:v2 -- [destino.xlsx]');
}
const output = args[0] ? path.resolve(args[0]) :
  path.join(await temporaryDirectory(root), projectId(root) + '-catalogo-v2.xlsx');
await fs.writeFile(output, bytes, {flag:'wx', mode:0o600});
console.log(output);
