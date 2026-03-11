/**
 * Lógica de validação: compara valor planilha x blockchain e define status.
 * Valores são arredondados para 2 casas decimais antes de comparar, para que
 * diferenças apenas de arredondamento não gerem divergência.
 */
const TOLERANCIA = 0.01; // diferença aceitável após arredondamento (ex: 0.01 USDT)

/** Arredonda para 2 casas decimais (evita divergência por arredondamento). */
function arredondar2(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

/**
 * Compara valor_total_planilha com valor_blockchain e define status.
 * Se a única diferença for arredondamento (ex.: planilha 1000,13 e blockchain 1000,126), considera OK.
 * @param {number} valorPlanilha
 * @param {number} valorBlockchain
 * @param {boolean} duplicidade - mesmo hash para clientes diferentes
 */
function validarValores(valorPlanilha, valorBlockchain, duplicidade) {
  if (duplicidade) return 'DUPLICIDADE';
  if (valorBlockchain == null || valorBlockchain === undefined) return 'HASH_NAO_ENCONTRADO';
  const p = arredondar2(valorPlanilha);
  const b = arredondar2(valorBlockchain);
  const diff = Math.abs(p - b);
  if (diff <= TOLERANCIA) return 'OK';
  return 'DIVERGENCIA_VALOR';
}

module.exports = {
  validarValores,
  TOLERANCIA,
  arredondar2,
};
