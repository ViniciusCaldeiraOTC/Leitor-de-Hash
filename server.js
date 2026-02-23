/**
 * Servidor API para validação de hashes (upload de planilha e download de relatório)
 */
const path = require('path');
const envPath = path.join(__dirname, '.env');
require('dotenv').config({ path: envPath });
if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON && process.cwd() !== __dirname) {
  require('dotenv').config({ path: path.join(process.cwd(), '.env') });
}
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const { runValidation } = require('./runValidation');
const config = require('./config');
const { google } = require('googleapis');

const app = express();
const PORT = process.env.PORT || 3001;
const UPLOAD_DIR = path.join(__dirname, 'uploads');

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || '.xlsx';
    cb(null, `planilha_${Date.now()}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = /\.(xlsx|xls)$/i.test(file.originalname);
    cb(null, ok);
  },
});

app.use(cors());
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, message: 'API Validação OTC' });
});

function sendProgress(res, current, total) {
  try {
    res.write(JSON.stringify({ type: 'progress', current, total }) + '\n');
  } catch (_) {}
}

app.post('/api/validar', upload.single('planilha'), async (req, res) => {
  try {
    if (!req.file || !req.file.path) {
      res.status(400).json({ erro: 'Envie um arquivo Excel (campo "planilha").' });
      return;
    }
    const nomeAba = (req.query.aba || req.body.aba || '').toString().trim() || undefined;
    console.log('[Validar] Iniciando validação:', req.file.originalname, nomeAba ? `aba=${nomeAba}` : '');
    const result = await runValidation(req.file.path, {
      etherscanApiKey: config.ETHERSCAN_API_KEY,
      pastaSaida: UPLOAD_DIR,
      nomeAba,
      log: (msg) => console.log('[Validar]', msg),
    });
    console.log('[Validar] Concluído. Registros:', result.registros?.length ?? 0, 'Inconsistências:', result.inconsistencias?.length ?? 0);
    try {
      fs.unlinkSync(req.file.path);
    } catch (_) {}
    if (result.erro) {
      res.status(400).json({ erro: result.erro });
      return;
    }
    res.json({
      registros: result.registros,
      duplicidades: result.duplicidades,
      inconsistencias: result.inconsistencias,
      linhasSemHash: result.linhasSemHash || [],
      temRelatorio: !!result.caminhoCsv,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: err.message || 'Erro ao validar planilha.' });
  }
});

app.post('/api/validar-stream', upload.single('planilha'), async (req, res) => {
  try {
    if (!req.file || !req.file.path) {
      res.status(400).json({ erro: 'Envie um arquivo Excel (campo "planilha").' });
      return;
    }
    res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders && res.flushHeaders();
    const nomeAba = (req.query.aba || req.body.aba || '').toString().trim() || undefined;
    console.log('[Validar-stream] Iniciando validação:', req.file.originalname, nomeAba ? `aba=${nomeAba}` : '');
    const result = await runValidation(req.file.path, {
      etherscanApiKey: config.ETHERSCAN_API_KEY,
      pastaSaida: UPLOAD_DIR,
      nomeAba,
      log: (msg) => console.log('[Validar]', msg),
      onProgress: (current, total) => sendProgress(res, current, total),
    });
    try {
      fs.unlinkSync(req.file.path);
    } catch (_) {}
    if (result.erro) {
      res.write(JSON.stringify({ type: 'error', erro: result.erro }) + '\n');
      res.end();
      return;
    }
    res.write(
      JSON.stringify({
        type: 'result',
        registros: result.registros,
        duplicidades: result.duplicidades,
        inconsistencias: result.inconsistencias,
        linhasSemHash: result.linhasSemHash || [],
        temRelatorio: !!result.caminhoCsv,
      }) + '\n'
    );
    res.end();
  } catch (err) {
    console.error(err);
    try {
      res.write(JSON.stringify({ type: 'error', erro: err.message || 'Erro ao validar planilha.' }) + '\n');
    } catch (_) {}
    res.end();
  }
});

app.get('/api/relatorio', (req, res) => {
  const csvPath = path.join(UPLOAD_DIR, 'relatorio_hash.csv');
  if (!fs.existsSync(csvPath)) {
    res.status(404).json({ erro: 'Relatório ainda não gerado. Execute uma validação antes.' });
    return;
  }
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="relatorio_hash.csv"');
  res.sendFile(csvPath);
});

/** Envia o relatório atual para o Google Sheets e retorna a URL da planilha. */
app.post('/api/relatorio-google-sheets', async (req, res) => {
  const log = (msg, ...args) => console.log('[Google Sheets]', msg, ...args);
  log('POST /api/relatorio-google-sheets recebido');

  const csvPath = path.join(UPLOAD_DIR, 'relatorio_hash.csv');
  log('CSV path:', csvPath, '| existe:', fs.existsSync(csvPath));

  if (!fs.existsSync(csvPath)) {
    log('-> 404: arquivo de relatório não encontrado');
    res.status(404).json({ erro: 'Relatório ainda não gerado. Execute uma validação antes.' });
    return;
  }

  let jsonKey = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  const hasKey = !!(jsonKey && typeof jsonKey === 'string');
  log('GOOGLE_SERVICE_ACCOUNT_JSON definido?', hasKey, '| tamanho da string:', jsonKey ? String(jsonKey).length : 0);

  if (!hasKey) {
    log('-> 503: variável GOOGLE_SERVICE_ACCOUNT_JSON ausente ou inválida');
    res.status(503).json({
      erro: 'Google Sheets não configurado. Defina a variável GOOGLE_SERVICE_ACCOUNT_JSON no servidor.',
    });
    return;
  }

  jsonKey = String(jsonKey)
    .replace(/\uFEFF/g, '')
    .replace(/^[\x00-\x1F]+/, '')
    .replace(/[\x00-\x1F]+$/, '')
    .trim();

  if (jsonKey.charCodeAt(1) === 92 && jsonKey.charCodeAt(2) === 34) {
    jsonKey = jsonKey.replace(/\\"/g, '"');
  }
  jsonKey = jsonKey.replace(/\r\n/g, '\\n').replace(/\n/g, '\\n').replace(/\r/g, '\\n');

  let credentials;
  try {
    credentials = JSON.parse(jsonKey);
    log('JSON.parse das credenciais: OK');
  } catch (parseErr) {
    try {
      let inner = jsonKey;
      if (jsonKey.startsWith('"') && jsonKey.endsWith('"') && jsonKey.length > 2) {
        inner = jsonKey.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
        if (inner.startsWith('"') && inner.endsWith('"')) inner = inner.slice(1, -1);
      }
      credentials = JSON.parse(inner);
      log('JSON.parse das credenciais: OK (valor normalizado do .env)');
    } catch (parseErr2) {
      log('-> 503: JSON.parse falhou:', parseErr.message);
      res.status(503).json({ erro: 'GOOGLE_SERVICE_ACCOUNT_JSON inválido (não é um JSON válido).' });
      return;
    }
  }

  if (credentials.private_key && typeof credentials.private_key === 'string') {
    credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');
  }

  try {
    log('Lendo CSV...');
    const raw = fs.readFileSync(csvPath, 'utf8');
    const content = raw.replace(/^\uFEFF/, '');
    const rows = content.split(/\r?\n/).filter((line) => line.trim());
    const values = rows.map((line) => line.split(';'));
    log('CSV lido:', values.length, 'linhas');

    if (values.length === 0) {
      log('-> 400: relatório vazio');
      res.status(400).json({ erro: 'Relatório vazio.' });
      return;
    }

    log('Autenticando com Google...');
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: [
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/drive',
      ],
    });
    const sheets = google.sheets({ version: 'v4', auth });
    const drive = google.drive({ version: 'v3', auth });

    const dataStr = new Date().toISOString().slice(0, 10);
    const title = `Relatório Hash OTC - ${dataStr}`;
    const abaFixa = (process.env.GOOGLE_SHEETS_ABA || '').trim();
    const sheetTabName = abaFixa || `Relatório ${dataStr}`.replace(/-/g, '_');
    let spreadsheetId = (process.env.GOOGLE_SHEETS_SPREADSHEET_ID || '').trim();

    if (spreadsheetId) {
      log('Usando planilha fixa (GOOGLE_SHEETS_SPREADSHEET_ID):', spreadsheetId);
      if (abaFixa) log('Usando aba fixa (GOOGLE_SHEETS_ABA):', abaFixa);
    } else {
      log('Criando planilha:', title);
      try {
        const createRes = await sheets.spreadsheets.create({
          requestBody: { properties: { title } },
        });
        spreadsheetId = createRes.data.spreadsheetId;
        log('Planilha criada (Sheets API), id:', spreadsheetId);
      } catch (createErr) {
        log('Sheets API create falhou, tentando via Drive API:', createErr.message);
        try {
          const driveRes = await drive.files.create({
            requestBody: {
              name: title,
              mimeType: 'application/vnd.google-apps.spreadsheet',
            },
          });
          spreadsheetId = driveRes.data.id;
          log('Planilha criada (Drive API), id:', spreadsheetId);
        } catch (driveErr) {
          console.error('[Google Sheets] Create (Sheets):', createErr.message);
          console.error('[Google Sheets] Create (Drive fallback):', driveErr.message);
          const email = credentials.client_email || 'sua-conta-de-servico@...';
          res.status(503).json({
            erro: 'Não foi possível criar uma planilha nova (permissão ou cota). Use uma planilha fixa: (1) Crie uma planilha em sheets.new; (2) Compartilhe com ' + email + ' como Editor; (3) Copie o ID da URL (entre /d/ e /edit); (4) No .env adicione GOOGLE_SHEETS_SPREADSHEET_ID=esse_id; (5) Reinicie o servidor.',
          });
          return;
        }
      }
    }

    const range = spreadsheetId && process.env.GOOGLE_SHEETS_SPREADSHEET_ID
      ? `'${sheetTabName}'!A1:${columnLetter(values[0].length)}${values.length}`
      : `Sheet1!A1:${columnLetter(values[0].length)}${values.length}`;

    let newSheetId = null;
    const MODELO_SHEET_NAME = 'Modelo';

    if (spreadsheetId && process.env.GOOGLE_SHEETS_SPREADSHEET_ID && !abaFixa) {
      try {
        const meta = await sheets.spreadsheets.get({
          spreadsheetId,
          fields: 'sheets.properties.sheetId,sheets.properties.title',
        });
        const sheetList = meta.data.sheets || [];
        const modeloSheet = sheetList.find((s) => s.properties && s.properties.title === MODELO_SHEET_NAME);

        if (modeloSheet && modeloSheet.properties.sheetId != null) {
          const dupRes = await sheets.spreadsheets.batchUpdate({
            spreadsheetId,
            requestBody: {
              requests: [{
                duplicateSheet: {
                  sourceSheetId: modeloSheet.properties.sheetId,
                  insertSheetIndex: 0,
                  newSheetName: sheetTabName,
                },
              }],
            },
          });
          const reply = dupRes.data.replies && dupRes.data.replies[0];
          if (reply && reply.duplicateSheet && reply.duplicateSheet.properties) {
            newSheetId = reply.duplicateSheet.properties.sheetId;
          }
          log('Aba criada a partir do modelo:', sheetTabName);
        } else {
          const addRes = await sheets.spreadsheets.batchUpdate({
            spreadsheetId,
            requestBody: {
              requests: [{ addSheet: { properties: { title: sheetTabName } } }],
            },
          });
          const reply = addRes.data.replies && addRes.data.replies[0];
          if (reply && reply.addSheet && reply.addSheet.properties) {
            newSheetId = reply.addSheet.properties.sheetId;
          }
          log('Aba adicionada:', sheetTabName);
        }
      } catch (addErr) {
        if (!addErr.message || !addErr.message.includes('already exists')) {
          log('Aba pode já existir, escrevendo na aba:', sheetTabName);
        }
      }
    }

    log('Escrevendo valores, range:', range);
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values },
    });

    if (spreadsheetId && process.env.GOOGLE_SHEETS_SPREADSHEET_ID && !abaFixa && newSheetId != null) {
      try {
        const meta = await sheets.spreadsheets.get({
          spreadsheetId,
          fields: 'sheets.properties.sheetId,sheets.properties.title',
        });
        const sheetList = meta.data.sheets || [];
        const requests = [];
        for (const s of sheetList) {
          if (!s.properties || s.properties.sheetId === newSheetId) continue;
          if (s.properties.title === MODELO_SHEET_NAME) {
            requests.push({
              updateSheetProperties: {
                properties: { sheetId: s.properties.sheetId, hidden: true },
                fields: 'hidden',
              },
            });
          } else {
            requests.push({ deleteSheet: { sheetId: s.properties.sheetId } });
          }
        }
        if (requests.length > 0) {
          await sheets.spreadsheets.batchUpdate({
            spreadsheetId,
            requestBody: { requests },
          });
          log('Abas antigas removidas; planilha ficou só com', sheetTabName);
        }
      } catch (delErr) {
        log('Não foi possível remover abas antigas:', delErr.message);
      }
    }

    let publicAccess = false;
    if (!process.env.GOOGLE_SHEETS_SPREADSHEET_ID) {
      log('Definindo permissão "qualquer um com o link pode ver"...');
      try {
        await drive.permissions.create({
          fileId: spreadsheetId,
          requestBody: { type: 'anyone', role: 'reader' },
        });
        publicAccess = true;
        log('Permissão definida.');
      } catch (permErr) {
        log('Permissão "anyone" falhou (planilha ficará privada):', permErr.message);
      }
    }

    const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;
    log('Sucesso. URL:', url);
    res.json({ url, publicAccess });
  } catch (err) {
    console.error('[Google Sheets] Erro ao criar planilha:', err.message);
    console.error('[Google Sheets] Stack:', err.stack);
    res.status(500).json({
      erro: err.message || 'Erro ao criar planilha no Google Sheets.',
    });
  }
});

function columnLetter(n) {
  let s = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s || 'A';
}

/** Retorna credenciais Google parseadas a partir do .env ou null se não configurado. */
function getGoogleCredentials() {
  let jsonKey = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!jsonKey || typeof jsonKey !== 'string') return null;
  jsonKey = String(jsonKey).replace(/\uFEFF/g, '').replace(/^[\x00-\x1F]+/, '').replace(/[\x00-\x1F]+$/, '').trim();
  if (jsonKey.charCodeAt(1) === 92 && jsonKey.charCodeAt(2) === 34) jsonKey = jsonKey.replace(/\\"/g, '"');
  jsonKey = jsonKey.replace(/\r\n/g, '\\n').replace(/\n/g, '\\n').replace(/\r/g, '\\n');
  let credentials;
  try {
    credentials = JSON.parse(jsonKey);
  } catch (_) {
    try {
      let inner = jsonKey;
      if (jsonKey.startsWith('"') && jsonKey.endsWith('"') && jsonKey.length > 2) {
        inner = jsonKey.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
        if (inner.startsWith('"') && inner.endsWith('"')) inner = inner.slice(1, -1);
      }
      credentials = JSON.parse(inner);
    } catch (_2) {
      return null;
    }
  }
  if (credentials.private_key && typeof credentials.private_key === 'string') {
    credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');
  }
  return credentials;
}

/** Abre a planilha modelo no Google Sheets. Usa só GOOGLE_SHEETS_MODELO_SPREADSHEET_ID; nunca a de relatório. */
app.post('/api/modelo-google-sheets', (req, res) => {
  const log = (msg, ...args) => console.log('[Modelo Google Sheets]', msg, ...args);
  log('POST /api/modelo-google-sheets');

  const modeloSpreadsheetId = (process.env.GOOGLE_SHEETS_MODELO_SPREADSHEET_ID || '').trim();
  if (!modeloSpreadsheetId) {
    res.status(503).json({
      erro: 'Planilha modelo não configurada. Defina GOOGLE_SHEETS_MODELO_SPREADSHEET_ID no .env (ID da planilha de entrada: Cliente, Valor ME, REDE, Moeda, Hash). Não use a planilha de relatório.',
    });
    return;
  }

  const url = `https://docs.google.com/spreadsheets/d/${modeloSpreadsheetId}/edit#gid=0`;
  log('URL planilha modelo (independente do relatório):', modeloSpreadsheetId);
  res.json({ url });
});

/** Remove planilhas antigas "Relatório Hash OTC" da Drive da conta de serviço para liberar cota. */
app.post('/api/google-sheets-limpar', async (req, res) => {
  const credentials = getGoogleCredentials();
  if (!credentials) {
    res.status(503).json({ erro: 'Google Sheets não configurado.' });
    return;
  }
  const max = Math.min(parseInt(req.body.max || req.query.max || '20', 10) || 20, 50);
  try {
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/drive', 'https://www.googleapis.com/auth/drive.file'],
    });
    const drive = google.drive({ version: 'v3', auth });
    const listRes = await drive.files.list({
      q: "name contains 'Relatório Hash OTC' and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false",
      orderBy: 'createdTime',
      pageSize: max,
      fields: 'files(id, name, createdTime)',
    });
    const files = listRes.data.files || [];
    let deletados = 0;
    for (const f of files) {
      try {
        await drive.files.delete({ fileId: f.id });
        deletados++;
        console.log('[Google Sheets] Limpeza: removido', f.name, f.id);
      } catch (e) {
        console.warn('[Google Sheets] Limpeza: falha ao remover', f.id, e.message);
      }
    }
    res.json({ deletados, total_listados: files.length, mensagem: `Removidas ${deletados} planilha(s) antiga(s). Cota liberada.` });
  } catch (err) {
    console.error('[Google Sheets] Limpeza:', err.message);
    res.status(500).json({ erro: err.message || 'Erro ao limpar planilhas.' });
  }
});

/** Lista clientes e suas carteiras (para a aba Cadastro). */
app.get('/api/carteiras-clientes', (req, res) => {
  try {
    const carteiras = config.getCarteirasClientes();
    const clientes = Object.keys(carteiras).sort((a, b) => a.localeCompare(b, 'pt-BR'));
    res.json({ clientes, carteiras });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: err.message || 'Erro ao listar carteiras.' });
  }
});

/** Adiciona uma carteira a um cliente (cria o cliente se não existir). Atualiza só o JSON daquele cliente. */
app.post('/api/carteiras-clientes', (req, res) => {
  try {
    const cliente = (req.body.cliente || '').toString().trim();
    const carteira = (req.body.carteira || '').toString().trim();
    if (!cliente) {
      res.status(400).json({ erro: 'Informe o nome do cliente.' });
      return;
    }
    if (!config.isEnderecoValido(carteira)) {
      res.status(400).json({ erro: 'Endereço da carteira inválido. Use TRC20 (T...) ou ERC20 (0x...).' });
      return;
    }
    const carteirasMap = config.getCarteirasClientes();
    const list = [...(carteirasMap[cliente] || [])];
    const norm = config.normalizarEndereco(carteira);
    if (list.includes(norm)) {
      res.status(400).json({ erro: 'Esta carteira já está cadastrada para este cliente.' });
      return;
    }
    list.push(norm);
    config.saveCarteirasCliente(cliente, list);
    res.json({ ok: true, cliente, carteiras: list });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: err.message || 'Erro ao salvar carteira.' });
  }
});

/** Remove uma carteira de um cliente. */
app.delete('/api/carteiras-clientes', (req, res) => {
  try {
    const cliente = (req.body.cliente || '').toString().trim();
    const carteira = (req.body.carteira || '').toString().trim();
    if (!cliente) {
      res.status(400).json({ erro: 'Informe o nome do cliente.' });
      return;
    }
    if (!carteira) {
      res.status(400).json({ erro: 'Informe o endereço da carteira a remover.' });
      return;
    }
    const carteirasMap = config.getCarteirasClientes();
    const list = [...(carteirasMap[cliente] || [])];
    const norm = config.normalizarEndereco(carteira);
    const novaLista = list.filter((a) => a !== norm);
    if (novaLista.length === list.length) {
      res.status(404).json({ erro: 'Carteira não encontrada para este cliente.' });
      return;
    }
    config.saveCarteirasCliente(cliente, novaLista);
    res.json({ ok: true, cliente, carteiras: novaLista });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: err.message || 'Erro ao remover carteira.' });
  }
});

if (process.env.NODE_ENV === 'production') {
  const frontendPath = path.join(__dirname, 'frontend', 'dist');
  if (fs.existsSync(frontendPath)) {
    app.use(express.static(frontendPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(frontendPath, 'index.html'));
    });
  }
}

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
  if (!config.ETHERSCAN_API_KEY) {
    console.log('[AVISO] ETHERSCAN_API_KEY não configurada. Consultas ERC20 funcionarão mas podem ter rate limit.');
    console.log('[AVISO] Para melhor performance, crie um arquivo .env com: ETHERSCAN_API_KEY=sua_chave');
  }
  console.log(`Google Sheets: ${process.env.GOOGLE_SERVICE_ACCOUNT_JSON ? 'configurado' : 'não configurado (defina GOOGLE_SERVICE_ACCOUNT_JSON no .env)'}`);
});
