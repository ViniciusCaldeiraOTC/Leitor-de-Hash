/**
 * Lógica de validação: compara valor planilha x blockchain e define status
 */
const TOLERANCIA = 0.01; // diferença aceitável em unidade (ex: 0.01 USDT)

/**
 * Compara valor_total_planilha com valor_blockchain e define status
 * @param {number} valorPlanilha
 * @param {number} valorBlockchain
 * @param {boolean} duplicidade - mesmo hash para clientes diferentes
 */
function validarValores(valorPlanilha, valorBlockchain, duplicidade) {
  if (duplicidade) return 'DUPLICIDADE';
  if (valorBlockchain == null || valorBlockchain === undefined) return 'HASH_NAO_ENCONTRADO';
  const diff = Math.abs(Number(valorPlanilha) - Number(valorBlockchain));
  if (diff <= TOLERANCIA) return 'OK';
  return 'DIVERGENCIA_VALOR';
}

module.exports = {
  validarValores,
  TOLERANCIA,
};
