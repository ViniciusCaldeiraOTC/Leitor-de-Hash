/**
 * Configuração do sistema de validação de hashes OTC
 */
require('dotenv').config();
const path = require('path');
const fs = require('fs');

// Caminho da planilha: argumento da linha de comando ou variável de ambiente ou padrão
const args = process.argv.slice(2);
const planilhaArg = args.find(a => a.startsWith('--planilha='));
const PLANILHA_PATH = planilhaArg
  ? planilhaArg.replace('--planilha=', '').trim()
  : (process.env.PLANILHA_PATH || path.join(__dirname, 'planilha.xlsx'));

const ETHERSCAN_API_KEY = (process.env.ETHERSCAN_API_KEY || '').trim();

/** Endereço válido: Tron (T + base58) ou Ethereum (0x + 40 hex). Ignora rótulos como "ETHERSCON". */
function isEnderecoValido(addr) {
  if (!addr || typeof addr !== 'string') return false;
  const s = addr.trim();
  if (s.length < 20) return false;
  if (s.startsWith('0x') && /^0x[0-9a-fA-F]{40}$/.test(s)) return true;
  if (s.startsWith('T') && s.length >= 34 && s.length <= 35) return true;
  return false;
}

/** Normaliza endereço para comparação: minúsculo, trim. Tron mantém case do T. */
function normalizarEndereco(addr) {
  if (!addr || typeof addr !== 'string') return '';
  const s = addr.trim();
  if (s.startsWith('0x')) return s.toLowerCase();
  return s;
}

const CARTEIRAS_CLIENTES_DIR = path.join(__dirname, 'carteiras-clientes');
const CARTEIRAS_CLIENTES_PATH = path.join(__dirname, 'carteiras-clientes.json'); // legado; usado só se pasta não existir

/** Gera slug para nome de arquivo a partir do nome do cliente. */
function nomeToSlug(nome) {
  if (!nome || typeof nome !== 'string') return '';
  let s = nome.trim().normalize('NFD').replace(/\u0300-\u036f/g, '');
  s = s.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  return s || 'cliente';
}

/** Garante que a pasta de clientes existe. */
function ensureCarteirasClientesDir() {
  if (!fs.existsSync(CARTEIRAS_CLIENTES_DIR)) {
    fs.mkdirSync(CARTEIRAS_CLIENTES_DIR, { recursive: true });
  }
}

/**
 * Lê um único arquivo de cliente (formato: { nome, carteiras }).
 * @param {string} filePath - Caminho do .json
 * @returns {{ nome: string, carteiras: string[] } | null}
 */
function readClienteFile(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(raw);
    const nome = (data.nome || '').toString().trim();
    if (!nome) return null;
    const list = Array.isArray(data.carteiras) ? data.carteiras : [];
    const valid = list.filter((c) => isEnderecoValido(c));
    return { nome, carteiras: valid };
  } catch (_) {
    return null;
  }
}

/** Mapa: nome do cliente (trim) -> array de endereços (apenas válidos). Lê da pasta carteiras-clientes (um JSON por cliente). Nunca lança. */
function getCarteirasClientes() {
  const out = {};
  try {
    ensureCarteirasClientesDir();
    const files = fs.readdirSync(CARTEIRAS_CLIENTES_DIR);
    for (const f of files) {
      if (!f.endsWith('.json')) continue;
      try {
        const filePath = path.join(CARTEIRAS_CLIENTES_DIR, f);
        if (!fs.statSync(filePath).isFile()) continue;
        const data = readClienteFile(filePath);
        if (!data || !data.nome) continue;
        const list = Array.isArray(data.carteiras) ? data.carteiras : [];
        out[data.nome] = list.map(normalizarEndereco);
      } catch (_) { /* ignora arquivo com erro */ }
    }
    if (Object.keys(out).length > 0) return out;
  } catch (_) {}
  // Fallback: arquivo único legado
  try {
    const raw = fs.readFileSync(CARTEIRAS_CLIENTES_PATH, 'utf8');
    const obj = JSON.parse(raw);
    for (const [cliente, carteiras] of Object.entries(obj)) {
      const key = (cliente || '').toString().trim();
      if (!key) continue;
      const list = Array.isArray(carteiras) ? carteiras : [carteiras];
      const valid = list.filter((c) => isEnderecoValido(c)).map(normalizarEndereco);
      if (valid.length) out[key] = valid;
    }
  } catch (_) {}
  return out;
}

/**
 * Salva as carteiras de um único cliente (um arquivo JSON por cliente).
 * @param {string} nome - Nome do cliente (exatamente como exibido)
 * @param {string[]} carteiras - Array de endereços
 */
function saveCarteirasCliente(nome, carteiras) {
  const key = (nome || '').toString().trim();
  if (!key) return;
  ensureCarteirasClientesDir();
  const slug = nomeToSlug(key);
  const filePath = path.join(CARTEIRAS_CLIENTES_DIR, `${slug}.json`);
  const list = Array.isArray(carteiras) ? carteiras.filter((c) => isEnderecoValido(c)) : [];
  fs.writeFileSync(filePath, JSON.stringify({ nome: key, carteiras: list }, null, 2), 'utf8');
}

module.exports = {
  PLANILHA_PATH,
  ETHERSCAN_API_KEY,
  getCarteirasClientes,
  saveCarteirasCliente,
  normalizarEndereco,
  isEnderecoValido,
  CARTEIRAS_CLIENTES_DIR,
  CARTEIRAS_CLIENTES_PATH,
};
