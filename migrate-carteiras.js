/**
 * Migra carteiras-clientes.json para a pasta carteiras-clientes/ (um JSON por cliente).
 * Execute uma vez: node migrate-carteiras.js
 */
const path = require('path');
const fs = require('fs');

const CARTEIRAS_JSON = path.join(__dirname, 'carteiras-clientes.json');
const CARTEIRAS_DIR = path.join(__dirname, 'carteiras-clientes');

function nomeToSlug(nome) {
  if (!nome || typeof nome !== 'string') return '';
  let s = nome.trim().normalize('NFD').replace(/\u0300-\u036f/g, '');
  s = s.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  return s || 'cliente';
}

const obj = JSON.parse(fs.readFileSync(CARTEIRAS_JSON, 'utf8'));
if (!fs.existsSync(CARTEIRAS_DIR)) fs.mkdirSync(CARTEIRAS_DIR, { recursive: true });

let count = 0;
for (const [nome, carteiras] of Object.entries(obj)) {
  const key = (nome || '').toString().trim();
  if (!key) continue;
  const list = Array.isArray(carteiras) ? carteiras : [carteiras];
  const slug = nomeToSlug(key);
  const filePath = path.join(CARTEIRAS_DIR, `${slug}.json`);
  fs.writeFileSync(filePath, JSON.stringify({ nome: key, carteiras: list }, null, 2), 'utf8');
  count++;
  console.log('OK', key, '->', slug + '.json');
}
console.log('Migração concluída:', count, 'clientes.');
