const fs = require('node:fs/promises');
const path = require('node:path');
const {createHash} = require('node:crypto');
const {loadConfig} = require('./sync-seo.cjs');

const root = path.resolve(__dirname, '..');
const paths = Object.freeze({
  html:'index.html', config:'js/config.js', catalog:'js/menu-data.js',
  photos:'assets/images/products', temporary:'tmp', input:'client-input'
});

function projectId(siteRoot) {
  const id = loadConfig(siteRoot).projectId;
  if (typeof id !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) || id.length > 80) {
    throw new Error('Configura projectId con letras minúsculas, números y guiones.');
  }
  return id;
}

function backupDirectory(siteRoot) {
  const base = process.env.STUDIO_BACKUPS_DIR || path.resolve(siteRoot, '..', 'NODAGRAMA_Backups');
  const site = process.platform === 'win32' ? siteRoot.toLowerCase() : siteRoot;
  const key = createHash('sha256').update(site).digest('hex').slice(0, 16);
  return path.resolve(base, projectId(siteRoot) + '-' + key);
}

async function temporaryDirectory(siteRoot) {
  const directory = path.join(await fs.realpath(siteRoot), paths.temporary);
  await fs.mkdir(directory, {recursive:true});
  if (path.relative(directory, await fs.realpath(directory))) throw new Error('La carpeta temporal no puede estar redirigida.');
  return directory;
}

module.exports = {root, paths, projectId, backupDirectory, temporaryDirectory};
