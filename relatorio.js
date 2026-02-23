/**
 * Geração de relatório CSV e listagem de inconsistências
 */
const fs = require('fs');
const path = require('path');

const NOME_RELATORIO = 'relatorio_hash.csv';
const SEP = ';';

/**
 * Gera o arquivo CSV com todas as validações
 * @param {Array<Object>} registros - lista de { hash, rede, moeda, valor_total_planilha, valor_blockchain, status_validacao, data_consulta }
 * @param {string} pastaSaida - diretório onde salvar (default: mesma pasta do projeto)
 */
function gerarRelatorio(registros, pastaSaida = __dirname) {
  const caminho = path.join(pastaSaida, NOME_RELATORIO);
  const header = [
    'hash',
    'clientes',
    'rede',
    'moeda',
    'valor_total_planilha',
    'valor_blockchain',
    'status_validacao',
    'motivo_erro',
    'orientacao_correcao',
    'endereco_remetente',
    'endereco_destino',
    'carteira_destino_ok',
    'data_consulta',
  ].join(SEP);
  const linhas = [header];
  for (const r of registros) {
    const clientesStr = Array.isArray(r.clientes) ? r.clientes.join(' | ') : '';
    linhas.push(
      [
        r.hash || '',
        clientesStr,
        r.rede || '',
        r.moeda || '',
        String(r.valor_total_planilha ?? '').replace('.', ','),
        String(r.valor_blockchain ?? '').replace('.', ','),
        r.status_validacao || '',
        (r.motivo_erro || '').replace(/;/g, ','),
        (r.orientacao_correcao || '').replace(/;/g, ','),
        r.endereco_remetente || '',
        r.endereco_destino || '',
        r.carteira_destino_ok === true ? 'SIM' : r.carteira_destino_ok === false ? 'NAO' : '',
        r.data_consulta || '',
      ].join(SEP)
    );
  }
  fs.writeFileSync(caminho, '\uFEFF' + linhas.join('\n'), 'utf8'); // BOM para Excel
  return caminho;
}

/**
 * Retorna lista de inconsistências para exibir no terminal
 * @param {Array<Object>} registros
 * @param {Array<Object>} duplicidades - lista de { hash, clientes }
 * @param {Array<Object>} redeMoedaDivergentesMesmoHash - lista de { hash, clientes, orientacao_correcao }
 */
function listarInconsistencias(registros, duplicidades = [], redeMoedaDivergentesMesmoHash = []) {
  const erros = [];
  for (const r of registros) {
    const base = { hash: r.hash, orientacao_correcao: r.orientacao_correcao || null };
    if (r.status_validacao === 'DIVERGENCIA_VALOR') {
      erros.push({
        ...base,
        tipo: 'DIVERGENCIA_VALOR',
        valor_planilha: r.valor_total_planilha,
        valor_blockchain: r.valor_blockchain,
      });
    }
    if (r.status_validacao === 'HASH_NAO_ENCONTRADO') {
      erros.push({
        ...base,
        tipo: 'HASH_NAO_ENCONTRADO',
        motivo_erro: r.motivo_erro || null,
        clientes: r.clientes || [],
      });
    }
    if (r.status_validacao === 'DUPLICIDADE') {
      erros.push({
        ...base,
        tipo: 'DUPLICIDADE',
        clientes: duplicidades.find((d) => d.hash === r.hash)?.clientes || [],
      });
    }
    if ((r.status_validacao === 'OK' || r.status_validacao === 'CORRECAO_PLANILHA') && r.orientacao_correcao) {
      erros.push({
        ...base,
        tipo: 'CORRECAO_PLANILHA',
        clientes: r.clientes || [],
        valor_planilha: r.valor_total_planilha,
        valor_blockchain: r.valor_blockchain,
        rede: r.rede,
        moeda: r.moeda,
      });
    }
    if (r.carteira_destino_ok === false) {
      erros.push({
        ...base,
        tipo: 'CARTEIRA_DESTINO_NAO_CONFERE',
        clientes: r.clientes || [],
        endereco_destino: r.endereco_destino,
        orientacao_correcao: r.orientacao_carteira_destino || null,
      });
    }
  }
  for (const item of redeMoedaDivergentesMesmoHash) {
    erros.push({
      hash: item.hash,
      tipo: 'REDE_MOEDA_DIVERGENTES_MESMO_HASH',
      clientes: item.clientes || [],
      valor_planilha: item.valor_planilha,
      numero_linhas: item.numero_linhas,
      orientacao_correcao: item.orientacao_correcao || null,
    });
  }
  return erros;
}

module.exports = {
  gerarRelatorio,
  listarInconsistencias,
  NOME_RELATORIO,
};
