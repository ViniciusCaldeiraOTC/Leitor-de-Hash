/**
 * Carregamento e extração de dados da planilha Excel
 */
const ExcelJS = require('exceljs');
const fs = require('fs');

/**
 * Normaliza nome de coluna (remove acentos, normaliza espaços e deixa minúsculo para comparação).
 * Aceita espaço não-quebrável (U+00A0) e outros whitespace como "Valor ME" vindo do Excel/Sheets.
 */
function normalizarColuna(nome) {
  if (typeof nome !== 'string') return '';
  return nome
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/g, ' ');
}

/**
 * Encontra o índice da coluna pelo nome (aceita variações)
 */
function encontrarColuna(linha, ...nomes) {
  for (let i = 0; i < linha.length; i++) {
    const n = normalizarColuna(String(linha[i]));
    for (const nome of nomes) {
      if (n.includes(normalizarColuna(nome))) return i;
    }
  }
  return -1;
}

/**
 * Carrega a planilha Excel e retorna array de linhas (objetos com chaves normalizadas)
 * Aceita planilha mínima: Cliente, Valor ME, Hash
 * Ou completa com REDE, Moeda, etc.
 * @param {string} caminhoPlanilha - Caminho do arquivo .xlsx
 * @param {Object} opts - Opções: nomeAba (nome da aba)
 * @returns {Promise<{ linhas, linhasSemHash }>}
 */
async function carregarPlanilha(caminhoPlanilha, opts = {}) {
  if (!fs.existsSync(caminhoPlanilha)) {
    throw new Error(`Arquivo não encontrado: ${caminhoPlanilha}`);
  }
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(caminhoPlanilha);
  let sheet = null;
  const nomeAba = (opts.nomeAba || '').toString().trim();
  if (nomeAba) {
    sheet = workbook.worksheets.find((s) => (s.name || '').trim() === nomeAba);
    if (!sheet) {
      const abas = workbook.worksheets.map((s) => s.name).filter(Boolean);
      throw new Error(
        `Aba "${nomeAba}" não encontrada. Abas disponíveis: ${abas.length ? abas.join(', ') : '(nenhuma)'}`
      );
    }
  } else {
    sheet = workbook.worksheets[0];
  }
  if (!sheet) {
    return { linhas: [], linhasSemHash: [] };
  }
  const dados = [];
  const MIN_COLUNAS_LEITURA = 30;
  sheet.eachRow((row, rowNumber) => {
    const values = [];
    for (let col = 1; col <= MIN_COLUNAS_LEITURA; col++) {
      const cell = row.getCell(col);
      const val = cell.value;
      if (typeof val === 'number' && !Number.isNaN(val)) {
        values.push(val);
      } else if (val !== undefined && val !== null) {
        let text = '';
        if (typeof cell.text === 'string') {
          text = cell.text;
        } else if (typeof val === 'object' && val !== null && Array.isArray(val.richText)) {
          text = (val.richText || []).map((t) => (t && t.text) || '').join('');
        } else {
          text = String(val);
        }
        values.push(text);
      } else {
        values.push('');
      }
    }
    dados.push(values);
  });
  if (!dados.length) {
    return { linhas: [], linhasSemHash: [] };
  }

  const MAX_LINHAS_BUSCA_CABECALHO = 100;
  let idxHeader = -1;
  for (let r = 0; r < Math.min(MAX_LINHAS_BUSCA_CABECALHO, dados.length); r++) {
    const row = dados[r];
    if (
      encontrarColuna(row, 'Cliente', 'client') >= 0 &&
      encontrarColuna(row, 'Valor ME', 'valor me', 'valorME') >= 0 &&
      encontrarColuna(row, 'Hash', 'hash') >= 0
    ) {
      idxHeader = r;
      break;
    }
  }
  if (idxHeader < 0) {
    throw new Error(
      'Planilha deve ter pelo menos as colunas: Cliente, Valor ME e Hash. Verifique os nomes das colunas nas primeiras linhas.'
    );
  }

  const header = dados[idxHeader];
  const idxCliente = encontrarColuna(header, 'Cliente', 'client');
  const idxValorME = encontrarColuna(header, 'Valor ME', 'valor me', 'valorME');
  const idxHash = encontrarColuna(header, 'Hash', 'hash');
  const idxRede = encontrarColuna(header, 'REDE', 'Rede', 'rede');
  const idxMoeda = encontrarColuna(header, 'Moeda', 'moeda');

  if (idxCliente === -1 || idxValorME === -1 || idxHash === -1) {
    throw new Error(
      'Planilha deve ter pelo menos as colunas: Cliente, Valor ME e Hash. Verifique os nomes das colunas.'
    );
  }

  const idxPrimeiraLinhaDados = idxHeader + 1;

  /**
   * Parse valor aceitando formato brasileiro (52.097,7 = 52097.7) e US (52097.7).
   * - Se vier número, retorna como está.
   * - Se tiver vírgula: formato BR (ponto = milhares, vírgula = decimal).
   * - Se não tiver vírgula e tiver só um ponto com 1–3 dígitos no final: formato US (ponto = decimal).
   * - Caso contrário: pontos como milhares (remove pontos).
   */
  function parseValorME(val) {
    if (val !== undefined && val !== null && typeof val === 'number' && !Number.isNaN(val)) return val;
    const s = String(val ?? '0').trim();
    if (!s) return 0;
    let br;
    if (s.includes(',')) {
      br = s.replace(/\./g, '').replace(',', '.');
    } else if ((s.match(/\./g) || []).length === 1 && /\.\d{1,3}$/.test(s)) {
      br = s;
    } else {
      br = s.replace(/\./g, '');
    }
    const n = parseFloat(br);
    return Number.isNaN(n) ? 0 : n;
  }

  const linhas = [];
  const linhasSemHash = [];
  for (let i = idxPrimeiraLinhaDados; i < dados.length; i++) {
    const row = dados[i];
    const hash = String(row[idxHash] ?? '').trim();
    const valorME = parseValorME(row[idxValorME]);
    const cliente = String(row[idxCliente] ?? '').trim();
    const numeroLinhaExcel = i + 1;
    if (!hash) {
      if (cliente || valorME) {
        linhasSemHash.push({ cliente: cliente || '(sem nome)', valorME, numeroLinha: numeroLinhaExcel });
      }
      continue;
    }
    linhas.push({
      cliente,
      valorME,
      hash: hash.toLowerCase(),
      rede: idxRede >= 0 ? String(row[idxRede] ?? '').trim().toUpperCase() : '',
      moeda: idxMoeda >= 0 ? String(row[idxMoeda] ?? '').trim() : '',
      numeroLinha: numeroLinhaExcel,
    });
  }
  return { linhas, linhasSemHash };
}

/**
 * Lê apenas os nomes das abas do arquivo Excel (sem carregar dados).
 * @param {string} caminhoPlanilha
 * @returns {Promise<string[]>}
 */
async function listarNomesAbas(caminhoPlanilha) {
  if (!fs.existsSync(caminhoPlanilha)) {
    throw new Error(`Arquivo não encontrado: ${caminhoPlanilha}`);
  }
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(caminhoPlanilha);
  return (workbook.worksheets || []).map((s) => s.name).filter((n) => n != null && String(n).trim() !== '');
}

/**
 * Agrupa linhas por hash e detecta duplicidade (mesmo hash, clientes diferentes)
 * Retorna: { porHash: Map<hash, { clientes: Set, valorTotalPlanilha, linhas }>, duplicidades: [...] }
 */
function extrairHashesUnicos(linhas) {
  const porHash = new Map();
  const duplicidades = [];

  for (const lin of linhas) {
    const h = lin.hash;
    if (!porHash.has(h)) {
      porHash.set(h, {
        clientes: new Set([lin.cliente]),
        valorTotalPlanilha: 0,
        rede: lin.rede,
        moeda: lin.moeda,
        linhas: [lin],
      });
    } else {
      const ent = porHash.get(h);
      ent.clientes.add(lin.cliente);
      ent.linhas.push(lin);
    }
    porHash.get(h).valorTotalPlanilha += lin.valorME;
  }

  for (const [hash, ent] of porHash) {
    if (ent.clientes.size > 1) {
      duplicidades.push({
        hash,
        clientes: [...ent.clientes],
        valorTotalPlanilha: ent.valorTotalPlanilha,
      });
    }
  }

  return { porHash, duplicidades };
}

module.exports = {
  carregarPlanilha,
  extrairHashesUnicos,
};
