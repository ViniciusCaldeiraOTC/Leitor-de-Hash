/**
 * Consulta às blockchains TRC20 (TronScan) e ERC20 (Etherscan)
 *
 * EXTRAÇÃO ERC20 (Etherscan):
 * 1. eth_getTransactionReceipt(txhash) — obtém o receipt com os logs da transação.
 * 2. Nos logs, procura evento Transfer(address,address,uint256):
 *    - topics[0] = keccak256("Transfer(address,address,uint256)") = 0xddf252ad...
 *    - data = valor em wei (uint256, 32 bytes hex). Converte para valor humano com 6 decimais (USDT/USDC).
 * 3. Se não achar Transfer nos logs (ex.: tx via contrato intermediário), fallback:
 *    - eth_getTransactionByHash(txhash) — decodifica tx.input como transfer(address,uint256) (selector 0xa9059cbb).
 *    - Valor em 6 decimais.
 * Defina DEBUG_ETHERSCAN=1 para ver no console onde a extração falha quando ERC20 retorna null.
 */
const axios = require('axios');

const TRONSCAN_URL = 'https://apilist.tronscanapi.com/api/transaction-info';
const ETHERSCAN_URL = 'https://api.etherscan.io/v2/api';
const ETHERSCAN_CHAIN_ID = 1;

const DELAY_APOS_429_MS = 6000;
const MAX_TENTATIVAS_429 = 2;

// Contratos conhecidos ERC20 (Ethereum mainnet)
const USDT_ERC20 = '0xdac17f958d2ee523a2206206994597c13d831ec7';
const USDC_ERC20 = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';

/**
 * Normaliza moeda: Tether (ou USDT) → USDT; qualquer outra → USDC.
 */
function normalizarMoeda(moeda) {
  const m = (moeda || '').toString().toLowerCase().trim();
  if (!m) return 'USDC';
  if (m === 'usdt' || m.includes('tether')) return 'USDT';
  return 'USDC';
}

/**
 * Consulta TronScan por hash e extrai result + valor transferido + token.
 * TRC20 (Tron) usa hash sem prefixo 0x; o prefixo 0x é convenção da ERC20 (Ethereum).
 * @param {string} hash - com ou sem 0x (será removido antes de enviar)
 * @returns {Promise<{ result: string, valor: number, moeda: string, rede: string }|null>}
 */
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function consultarTronScan(hash) {
  const hashTron = (hash || '').trim().replace(/^0x/i, '');
  if (!hashTron || hashTron.length !== 64) return null;
  let tentativa = 0;
  while (true) {
    try {
      const res = await axios.get(TRONSCAN_URL, {
        params: { hash: hashTron },
        timeout: 15000,
      });
      const data = res.data;
      if (!data) return null;
      const respHash = (data.hash || '').toString().trim().replace(/^0x/i, '').toLowerCase();
      if (respHash && respHash !== hashTron.toLowerCase()) return null;
      const result = data.contractRet === 'SUCCESS' ? 'SUCCESSFUL' : (data.contractRet || 'UNKNOWN');
      let valor = 0;
      let moeda = '';

      const transfers = data.trc20TransferInfo || (data.tokenTransferInfo ? [data.tokenTransferInfo] : []);
      if (transfers.length) {
        for (const t of transfers) {
          const decimals = t.decimals || 6;
          const amountStr = t.amount_str || t.amount || '0';
          valor += Number(amountStr) / Math.pow(10, decimals);
          if (!moeda) moeda = (t.symbol || t.name || '').toUpperCase();
        }
      }
      if (valor === 0 && data.trigger_info && data.trigger_info.parameter) {
        const p = data.trigger_info.parameter;
        const decimals = (data.contractInfo && data.contractInfo[data.toAddress]) ? 6 : 6;
        valor = Number(p._value || 0) / Math.pow(10, decimals);
        moeda = (data.contractInfo && data.contractInfo[data.toAddress]?.tag1) ? 'USDT' : 'USDT';
      }
      if (!moeda && data.contractInfo) {
        const first = Object.values(data.contractInfo)[0];
        if (first && first.tag1) moeda = first.tag1.replace(' Token', '').toUpperCase();
      }
      if (!moeda) moeda = 'USDT';
      const firstTransfer = transfers[0];
      const endereco_remetente = (firstTransfer?.from_address || firstTransfer?.fromAddress || data.ownerAddress || '').toString().trim();
      const endereco_destino = (firstTransfer?.to_address || firstTransfer?.toAddress || data.toAddress || '').toString().trim();
      return {
        result,
        valor,
        moeda: normalizarMoeda(moeda),
        rede: 'TRC20',
        endereco_remetente: endereco_remetente || undefined,
        endereco_destino: endereco_destino || undefined,
      };
    } catch (err) {
      if (err.response && err.response.status === 404) return null;
      if (err.response && err.response.status === 429 && tentativa < MAX_TENTATIVAS_429) {
        tentativa++;
        await delay(DELAY_APOS_429_MS);
        continue;
      }
      throw err;
    }
  }
}

/**
 * Decodifica transferência ERC20 do campo input (transfer(address,uint256))
 */
function decodificarTransferERC20(input) {
  if (!input || typeof input !== 'string' || !input.startsWith('0x')) return null;
  const hex = input.slice(2);
  if (hex.length < 136) return null;
  const methodId = hex.slice(0, 8);
  if (methodId !== 'a9059cbb') return null;
  const amountHex = hex.slice(72, 136);
  return BigInt('0x' + amountHex);
}

const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

/**
 * Extrai valor de evento Transfer(address,address,uint256) dos logs.
 * Aceita qualquer contrato ERC20 (inclui proxies USDT/USDC).
 * Topic[0] = keccak256("Transfer(address,address,uint256)")
 * Valor pode estar em data (padrão) ou em topics[3] quando value é indexed (não padrão ERC20).
 */
function extrairTransferDosLogs(logs) {
  if (!Array.isArray(logs)) return null;
  for (const log of logs) {
    const topics = log.topics || log.Topics || [];
    if (!Array.isArray(topics) || topics.length < 3) continue;
    const topic0 = (topics[0] || '').toString().toLowerCase();
    if (topic0 !== TRANSFER_TOPIC.toLowerCase()) continue;
    let amountWei = null;
    const data = log.data || log.Data || '';
    const dataStr = typeof data === 'string' ? data : '';
    if (dataStr.startsWith('0x') && dataStr.length >= 66) {
      const dataHex = dataStr.slice(2);
      const amountHex = dataHex.length >= 64 ? dataHex.slice(0, 64) : dataHex.padStart(64, '0');
      try {
        amountWei = BigInt('0x' + amountHex);
      } catch (_) {}
    }
    if (amountWei == null && topics.length >= 4 && topics[3]) {
      try {
        const t3 = (topics[3] || '').toString().replace(/^0x/i, '');
        if (t3.length <= 64) amountWei = BigInt('0x' + t3.padStart(64, '0'));
      } catch (_) {}
    }
    if (amountWei == null) continue;
    const decimals = 6;
    const valor = Number(amountWei) / Math.pow(10, decimals);
    const address = (log.address || log.Address || '').toString().toLowerCase();
    const isUSDC = address === USDC_ERC20.toLowerCase();
    let fromAddr = '';
    let toAddr = '';
    if (topics.length >= 3) {
      const t1 = (topics[1] || '').toString().replace(/^0x/i, '');
      const t2 = (topics[2] || '').toString().replace(/^0x/i, '');
      if (t1.length >= 40) fromAddr = '0x' + t1.slice(-40).toLowerCase();
      if (t2.length >= 40) toAddr = '0x' + t2.slice(-40).toLowerCase();
    }
    return { valor, moeda: normalizarMoeda(isUSDC ? 'USDC' : 'USDT'), from: fromAddr || undefined, to: toAddr || undefined };
  }
  return null;
}

/**
 * Consulta Etherscan por hash e extrai valor ERC20 (USDT/USDC) e result.
 * Usa Transaction Receipt para ler eventos Transfer, mais confiável que decodificar input.
 * @param {string} hash - com ou sem 0x
 * @param {string} apiKey
 * @returns {Promise<{ result: string, valor: number, moeda: string, rede: string }|null>}
 */
async function consultarEtherscan(hash, apiKey) {
  const txhash = hash.startsWith('0x') ? hash : '0x' + hash;
  let tentativa = 0;
  while (true) {
    try {
      const paramsReceipt = {
        chainid: ETHERSCAN_CHAIN_ID,
        module: 'proxy',
        action: 'eth_getTransactionReceipt',
        txhash,
      };
      if (apiKey) paramsReceipt.apikey = apiKey;
      const resReceipt = await axios.get(ETHERSCAN_URL, { params: paramsReceipt, timeout: 15000 });
      const dataReceipt = resReceipt.data;
      const debug = process.env.DEBUG_ETHERSCAN === '1' || process.env.DEBUG_ETHERSCAN === 'true';
      if (dataReceipt.error) {
        const errMsg = (dataReceipt.error.message || dataReceipt.error).toString().slice(0, 120);
        console.warn('[Etherscan] receipt error:', errMsg, '| Status:', resReceipt.status);
        return null;
      }
      const rawResult = dataReceipt.result;
      if (rawResult == null || rawResult === '' || rawResult === 'null' || typeof rawResult !== 'object') {
        if (debug) console.warn('[Etherscan] receipt result inválido. Tipo:', typeof rawResult, 'Valor:', String(rawResult).slice(0, 80));
        return null;
      }
      const receipt = rawResult;
      const logs = receipt.logs || receipt.Logs || [];
      if (!receipt.status || receipt.status === '0x0') {
        if (debug) console.warn('[Etherscan] receipt status falhou:', receipt.status);
        return null;
      }
      const result = receipt.blockNumber ? 'SUCCESSFUL' : 'PENDING';
      const transfer = extrairTransferDosLogs(Array.isArray(logs) ? logs : []);
      if (transfer) {
        return {
          result,
          valor: transfer.valor,
          moeda: normalizarMoeda(transfer.moeda),
          rede: 'ERC20',
          endereco_remetente: transfer.from,
          endereco_destino: transfer.to,
        };
      }
      if (debug && logs.length > 0) {
        const first = logs[0];
        console.warn('[Etherscan] Nenhum Transfer nos logs. Total logs:', logs.length, 'Primeiro log topics:', first?.topics?.length ?? first?.Topics?.length, 'data length:', (first?.data || first?.Data || '').length);
      }
      const paramsTx = {
        chainid: ETHERSCAN_CHAIN_ID,
        module: 'proxy',
        action: 'eth_getTransactionByHash',
        txhash,
      };
      if (apiKey) paramsTx.apikey = apiKey;
      const resTx = await axios.get(ETHERSCAN_URL, { params: paramsTx, timeout: 15000 });
      const dataTx = resTx.data;
      const rawTx = dataTx.result;
      if (dataTx.error || rawTx == null || rawTx === '' || rawTx === 'null' || typeof rawTx !== 'object') {
        if (debug) console.warn('[Etherscan] tx fallback inválido. error:', dataTx.error, 'result tipo:', typeof rawTx);
        return null;
      }
      const tx = rawTx;
      const input = tx.input || tx.Data || '';
      const amountWei = decodificarTransferERC20(input);
      if (amountWei === null) return null;
      const decimals = 6;
      const valor = Number(amountWei) / Math.pow(10, decimals);
      const to = (tx.to || tx.To || '').toString().toLowerCase();
      const isUSDC = to === USDC_ERC20.toLowerCase();
      const from = (tx.from || tx.From || '').toString().toLowerCase();
      const inputHex = (input || '').slice(2);
      let toAddr = '';
      if (inputHex.length >= 72) toAddr = '0x' + inputHex.slice(32, 72).toLowerCase();
      return {
        result,
        valor,
        moeda: normalizarMoeda(isUSDC ? 'USDC' : 'USDT'),
        rede: 'ERC20',
        endereco_remetente: from || undefined,
        endereco_destino: toAddr || undefined,
      };
    } catch (err) {
      const status = err.response?.status;
      const errData = err.response?.data;
      if (tentativa === 0) {
        const msg = (errData?.message || errData?.error || err.message || '').toString().slice(0, 100);
        console.warn('[Etherscan] exceção:', err.message, '| HTTP', status, msg ? '|' : '', msg);
      }
      if (err.response && err.response.status === 404) return null;
      if (err.response?.data?.error && err.response?.status !== 429) return null;
      if (err.response?.status === 429 && tentativa < MAX_TENTATIVAS_429) {
        tentativa++;
        console.warn('[Etherscan] rate limit 429, aguardando', DELAY_APOS_429_MS, 'ms antes de retry', tentativa);
        await delay(DELAY_APOS_429_MS);
        continue;
      }
      throw err;
    }
  }
}

/**
 * Consulta blockchain: tenta TRC20 primeiro; se não achar, tenta ERC20 (se tiver API key)
 * @param {string} hash
 * @param {string} etherscanApiKey
 * @param {string} redePreferida - '' | 'TRC20' | 'ERC20' (quando a planilha informa REDE)
 */
async function consultarBlockchain(hash, etherscanApiKey, redePreferida = '') {
  const hashNorm = (hash || '').trim().toLowerCase().replace(/^0x/, '');
  const com0x = hashNorm.length === 64 ? '0x' + hashNorm : (hash || '').trim();

  if (redePreferida === 'ERC20') {
    const eth = await consultarEtherscan(com0x, etherscanApiKey);
    if (eth) return eth;
    const tron = await consultarTronScan(hashNorm.length === 64 ? hashNorm : com0x);
    return tron;
  }

  const tron = await consultarTronScan(hashNorm.length === 64 ? hashNorm : com0x);
  if (tron) return tron;
  if (etherscanApiKey && hashNorm.length === 64) {
    const eth = await consultarEtherscan(com0x, etherscanApiKey);
    if (eth) return eth;
  }
  return null;
}

/**
 * Consulta as duas redes (TRC20 e ERC20) para o mesmo hash.
 * Usado quando há apontamento diferente de OK, para identificar em qual rede a transação foi concluída.
 * @param {string} hash
 * @param {string} etherscanApiKey
 * @returns {Promise<{ trc20: Object|null, erc20: Object|null }>}
 */
async function consultarAmbasRedes(hash, etherscanApiKey) {
  const hashNorm = (hash || '').trim().toLowerCase().replace(/^0x/, '');
  const com0x = hashNorm.length === 64 ? '0x' + hashNorm : (hash || '').trim();
  const [trc20, erc20] = await Promise.all([
    consultarTronScan(hashNorm.length === 64 ? hashNorm : com0x),
    hashNorm.length === 64 ? consultarEtherscan(com0x, etherscanApiKey || '') : Promise.resolve(null),
  ]);
  return { trc20: trc20 || null, erc20: erc20 || null };
}

module.exports = {
  consultarTronScan,
  consultarEtherscan,
  consultarBlockchain,
  consultarAmbasRedes,
};
