const fs = require('node:fs/promises');
const path = require('node:path');
const readline = require('node:readline');
const {root, review} = require('./candidate-plan.cjs');
const {writePreview} = require('./catalog-preview.cjs');
const {prepareCandidates, writeCandidates} = require('./generate-candidates.cjs');
const transactions = require('./menu-transaction.cjs');
const {loadBusiness} = require('./site-business-adapter.cjs');
const {runStudio} = require('./studio-session.cjs');
const {paths} = require('./studio-project.cjs');
const {version} = require('../package.json');

const isExcel = file => path.extname(file).toLowerCase() === '.xlsx' && !path.basename(file).startsWith('~$');

function createOperations({siteRoot = root, privateRoot} = {}) {
  const scope = {siteRoot, privateRoot};
  async function prepare(excel, preview, commercial) {
    return prepareCandidates(await fs.readFile(excel), preview.report, siteRoot, {commercial});
  }
  return {
    async findExcel(directory) {
      try {
        const entries = await fs.readdir(directory, {withFileTypes:true});
        return entries.filter(entry => entry.isFile() && isExcel(entry.name))
          .map(entry => path.join(directory, entry.name)).sort();
      } catch (error) { if (error.code === 'ENOENT') return []; throw error; }
    },
    async selectExcel(choice) {
      const file = path.resolve(choice);
      if (!isExcel(file)) throw new Error('Selecciona un archivo .xlsx.');
      if (!(await fs.lstat(file)).isFile()) throw new Error('La ruta no es un archivo Excel regular.');
      return file;
    },
    async preview(excel) {
      const {report} = await review(await fs.readFile(excel), siteRoot);
      return {report, file:await writePreview(report, siteRoot)};
    },
    async generate(excel, preview, commercial = false) {
      const directory = await writeCandidates(await prepare(excel, preview, commercial), siteRoot);
      const report = JSON.parse(await fs.readFile(path.join(directory, 'reporte-diferencias.json'), 'utf8'));
      if (report.comercial.explicito !== commercial) throw new Error('El candidato generado no coincide con el modo seleccionado.');
      return {directory, report};
    },
    async validate(excel, preview, candidate) {
      const report = await transactions.validateBundle(candidate.directory, await prepare(excel, preview, candidate.report.comercial.explicito));
      if (report.aprobacionSha256 !== candidate.report.aprobacionSha256) {
        throw new Error('El conjunto candidato cambió. Genéralo nuevamente.');
      }
      return report;
    },
    apply: (excel, preview, candidate, approval, authorize) => transactions.apply({
      excel, plan:preview.file, directory:candidate.directory, approval, authorize, ...scope
    }),
    listBackups: () => transactions.listBackups(scope),
    backupInfo: transactions.backupInfo,
    readBackupLog: id => transactions.readBackupLog({id, ...scope}),
    restore: (id, recover, authorize) => transactions.restore({id, recover, authorize, ...scope})
  };
}

async function main() {
  const config = {
    name:'NODAGRAMA Studio Manager', version, client:loadBusiness(root).values.nombre,
    excelDirectory:path.resolve(process.env.STUDIO_EXCEL_DIR || path.join(root, paths.input))
  };
  const input = readline.createInterface({input:process.stdin, output:process.stdout});
  const lines = input[Symbol.asyncIterator]();
  try {
    await runStudio({config, operations:createOperations(),
      ask:async message => { process.stdout.write(message); return (await lines.next()).value; },
      write:message => console.log(message)});
  } finally { input.close(); }
}

if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = {createOperations};
