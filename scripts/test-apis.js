/**
 * Script de teste isolado: consulta TronScan e Etherscan com um hash
 * e exibe URL, status e resposta para diagnosticar erros.
 *
 * Uso:
 *   node scripts/test-apis.js
 *   node scripts/test-apis.js <hash>
 *   node scripts/test-apis.js 1a703760d0982d5eaba1f8f51081fca13d308a696275a095b74906ad56093ff1
 *   node scripts/test-apis.js 0x5beae795...
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const axios = require('axios');

const TRONSCAN_URL = 'https://apilist.tronscanapi.com/api/transaction-info';
const ETHERSCAN_URL = 'https://api.etherscan.io/api';

// Hash de exemplo (Tron USDT - conhecido válido)
const HASH_EXEMPLO = '1a703760d0982d5eaba1f8f51081fca13d308a696275a095b74906ad56093ff1';

function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

function normalizarHash(hash) {
  const h = (hash || '').trim();
  const sem0x = h.replace(/^0x/i, '');
  return { original: h, sem0x, com0x: sem0x.length === 64 ? '0x' + sem0x : h };
}

async function testarTronScan(hashNorm) {
  log('--- TronScan (TRC20) ---');
  const url = `${TRONSCAN_URL}?hash=${encodeURIComponent(hashNorm.sem0x)}`;
  log(`URL: ${url}`);
  try {
    const res = await axios.get(TRONSCAN_URL, {
      params: { hash: hashNorm.sem0x },
      timeout: 15000,
      validateStatus: () => true,
    });
    log(`Status HTTP: ${res.status}`);
    if (res.data && typeof res.data === 'object') {
      const d = res.data;
      log(`Resposta: hash=${d.hash || '(vazio)'}, contractRet=${d.contractRet || '(vazio)'}`);
      if (d.trc20TransferInfo && d.trc20TransferInfo.length) {
        const t = d.trc20TransferInfo[0];
        log(`  TRC20: symbol=${t.symbol}, amount_str=${t.amount_str}, decimals=${t.decimals}`);
      } else if (d.tokenTransferInfo) {
        const t = d.tokenTransferInfo;
        log(`  Token: symbol=${t.symbol}, amount_str=${t.amount_str}`);
      }
      if (res.status !== 200) log(`Body (resumo): ${JSON.stringify(d).slice(0, 200)}...`);
    } else {
      log(`Body: ${String(res.data).slice(0, 300)}`);
    }
    return res.status === 200 && res.data && res.data.hash;
  } catch (err) {
    log(`Erro: ${err.message}`);
    if (err.response) log(`  Response status: ${err.response.status}, data: ${JSON.stringify(err.response.data).slice(0, 150)}`);
    return false;
  }
}

async function testarEtherscanReceipt(hashNorm, apiKey) {
  log('--- Etherscan eth_getTransactionReceipt ---');
  const txhash = hashNorm.sem0x.length === 64 ? '0x' + hashNorm.sem0x : hashNorm.original;
  try {
    const res = await axios.get(ETHERSCAN_URL, {
      params: {
        module: 'proxy',
        action: 'eth_getTransactionReceipt',
        txhash,
        ...(apiKey && { apikey: apiKey }),
      },
      timeout: 15000,
      validateStatus: () => true,
    });
    log(`Status HTTP: ${res.status}`);
    const data = res.data;
    if (data && typeof data === 'object') {
      log(`error=${data.error || '(nenhum)'}, result=${data.result ? 'objeto' : '(null)'}`);
      if (data.error) log(`  Error: ${JSON.stringify(data.error)}`);
      if (data.result && typeof data.result === 'object') {
        const r = data.result;
        log(`  status=${r.status}, blockNumber=${r.blockNumber}, logs count=${(r.logs && r.logs.length) || 0}`);
        if (r.logs && r.logs.length) {
          r.logs.slice(0, 3).forEach((l, i) => {
            log(`  log[${i}] address=${(l.address || '').slice(0, 18)}..., topics=${(l.topics && l.topics.length) || 0}, data length=${(l.data || '').length}`);
          });
        }
      }
    }
    return res.status === 200 && data && data.result && typeof data.result === 'object';
  } catch (err) {
    log(`Erro: ${err.message}`);
    return false;
  }
}

async function testarEtherscan(hashNorm, apiKey) {
  log('--- Etherscan eth_getTransactionByHash ---');
  const txhash = hashNorm.sem0x.length === 64 ? '0x' + hashNorm.sem0x : hashNorm.original;
  log(`txhash=${txhash}, apikey=${apiKey ? '***' + apiKey.slice(-4) : '(vazio)'}`);
  try {
    const res = await axios.get(ETHERSCAN_URL, {
      params: {
        module: 'proxy',
        action: 'eth_getTransactionByHash',
        txhash,
        ...(apiKey && { apikey: apiKey }),
      },
      timeout: 15000,
      validateStatus: () => true,
    });
    log(`Status HTTP: ${res.status}`);
    const data = res.data;
    if (data && typeof data === 'object') {
      log(`Resposta: error=${data.error || '(nenhum)'}, result=${data.result ? (typeof data.result === 'object' ? 'objeto' : data.result) : '(vazio)'}`);
      if (data.result && typeof data.result === 'object') {
        const tx = data.result;
        log(`  Tx: to=${tx.to}, blockNumber=${tx.blockNumber || '(pending)'}, input length=${(tx.input || '').length}`);
      }
      if (data.error) log(`  Error: ${JSON.stringify(data.error)}`);
    } else {
      log(`Body: ${String(data).slice(0, 300)}`);
    }
    return res.status === 200 && data && data.result && typeof data.result === 'object';
  } catch (err) {
    log(`Erro: ${err.message}`);
    if (err.response) log(`  Response status: ${err.response.status}`);
    return false;
  }
}

async function main() {
  const hashArg = process.argv[2] || HASH_EXEMPLO;
  const hashNorm = normalizarHash(hashArg);
  const apiKey = process.env.ETHERSCAN_API_KEY || '';

  log(`Hash original: ${hashNorm.original}`);
  log(`Hash sem 0x (64 chars): ${hashNorm.sem0x.length === 64 ? hashNorm.sem0x : '(não é 64)'}`);
  log(`Hash com 0x: ${hashNorm.com0x}`);
  log('');

  const tronOk = await testarTronScan(hashNorm);
  log('');

  const receiptOk = await testarEtherscanReceipt(hashNorm, apiKey);
  log('');

  const ethOk = await testarEtherscan(hashNorm, apiKey);
  log('');

  log('--- Resumo ---');
  log(`TronScan: ${tronOk ? 'ENCONTRADO' : 'não encontrado'}`);
  log(`Etherscan Receipt: ${receiptOk ? 'ENCONTRADO' : 'não encontrado'}`);
  log(`Etherscan Tx: ${ethOk ? 'ENCONTRADO' : 'não encontrado'}`);
  if (!tronOk && !ethOk) {
    log('');
    log('Dica: TronScan espera hash SEM prefixo 0x (64 caracteres hex).');
    log('       Etherscan espera hash COM prefixo 0x.');
    log('       Hashes Tron têm 64 chars; hashes Ethereum também. Teste com um hash conhecido da sua planilha.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
