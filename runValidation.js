/**
 * Pipeline de validação reutilizável (CLI e API).
 * Sem cache: cada execução consulta todos os hashes na blockchain.
 * @param {string} planilhaPath - Caminho do arquivo Excel
 * @param {Object} opts - { etherscanApiKey, delayEntreConsultas }
 * @returns {Promise<{ registros, duplicidades, inconsistencias, caminhoCsv }>}
 */
const { carregarPlanilha, extrairHashesUnicos } = require('./planilha');
const { consultarBlockchain, consultarAmbasRedes } = require('./blockchain');
const { validarValores, TOLERANCIA } = require('./validacao');
const { gerarRelatorio, listarInconsistencias } = require('./relatorio');
const { getCarteirasClientes, normalizarEndereco } = require('./config');
const path = require('path');

function normalizarHashKey(h) {
  const x = (h || '').trim().toLowerCase().replace(/^0x/, '');
  return x.length === 64 ? x : (h || '').trim().toLowerCase();
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runValidation(planilhaPath, opts = {}) {
  const etherscanApiKey = opts.etherscanApiKey ?? require('./config').ETHERSCAN_API_KEY;
  const pastaSaida = opts.pastaSaida || path.dirname(planilhaPath);
  const log = opts.log || (() => {});

  const { linhas, linhasSemHash } = await carregarPlanilha(planilhaPath, {
    nomeAba: opts.nomeAba,
  });
  log(`Planilha carregada: ${linhas.length} linhas com hash.${linhasSemHash.length ? ` ${linhasSemHash.length} registro(s) sem hash.` : ''}`);
  if (linhas.length === 0) {
    return {
      registros: [],
      duplicidades: [],
      inconsistencias: [],
      linhasSemHash: linhasSemHash || [],
      caminhoCsv: null,
      erro: linhasSemHash?.length ? undefined : 'Nenhuma linha com hash encontrada na planilha.',
    };
  }

  const { porHash, duplicidades } = extrairHashesUnicos(linhas);
  const hashesUnicos = [...porHash.keys()];
  const carteirasClientes = getCarteirasClientes();
  const validarCarteiras = Object.keys(carteirasClientes).length > 0;
  if (validarCarteiras) {
    log(`Validação de carteiras ativa: ${Object.keys(carteirasClientes).length} cliente(s) cadastrado(s).`);
  }
  log(`Hashes únicos: ${hashesUnicos.length}. Duplicidades (mesmo hash, clientes diferentes): ${duplicidades.length}.`);
  log(`A consultar na blockchain: ${hashesUnicos.length} (sem cache).`);

  const resultados = new Map();
  const delayEntreConsultas = Number(opts.delayEntreConsultas) || 1200;
  const onProgress = typeof opts.onProgress === 'function' ? opts.onProgress : () => {};
  if (hashesUnicos.length > 0 && delayEntreConsultas > 0) {
    log(`Intervalo entre consultas: ${delayEntreConsultas}ms (evita rate limit 429).`);
  }
  onProgress(0, hashesUnicos.length);
  function valorCompativel(valorPlanilha, valorBc) {
    if (valorBc == null) return false;
    return Math.abs(Number(valorPlanilha) - Number(valorBc)) <= TOLERANCIA;
  }

  /** Tether (ou USDT) → USDT; qualquer outra → USDC. Usado para não sugerir ajuste quando planilha tem "TETHER" e blockchain "USDT". */
  function normalizarMoeda(m) {
    const x = (m || '').toString().toLowerCase().trim();
    if (!x) return 'USDC';
    if (x === 'usdt' || x.includes('tether')) return 'USDT';
    return 'USDC';
  }

  /** Para cada hash com mais de uma linha, verifica se Rede e Moeda são iguais em todas; se não, aponta inconsistência. */
  const redeMoedaDivergentesMesmoHash = [];
  for (const [hash, info] of porHash) {
    if (info.linhas.length <= 1) continue;
    const combinacoes = new Set(
      info.linhas.map((lin) => {
        const r = (lin.rede || '').toString().trim().toUpperCase().replace(/\s/g, '') || '(vazio)';
        const m = normalizarMoeda(lin.moeda);
        return `${r}|${m}`;
      })
    );
    if (combinacoes.size > 1) {
      const numeroLinhas = (info.linhas || []).map((lin) => lin.numeroLinha).filter((n) => n != null);
      redeMoedaDivergentesMesmoHash.push({
        hash,
        clientes: info.clientes ? [...info.clientes] : [],
        valor_planilha: info.valorTotalPlanilha,
        numero_linhas: numeroLinhas.length ? numeroLinhas : undefined,
        orientacao_correcao:
          'Para o mesmo hash, as colunas Rede e Moeda devem ser idênticas em todas as linhas. Unifique os valores na planilha.',
      });
    }
  }
  if (redeMoedaDivergentesMesmoHash.length) {
    log(`Rede/Moeda divergentes para o mesmo hash: ${redeMoedaDivergentesMesmoHash.length} hash(es).`);
  }

  function montarOrientacaoAjuste(info, redePlanilha, moedaPlanilha, redeReal, moedaReal) {
    const clientes = info?.clientes ? [...info.clientes] : [];
    const clientesStr = clientes.length ? clientes.join(', ') : 'este registro';
    const partes = [];
    const redeP = (redePlanilha || '').toUpperCase().trim();
    const redeR = (redeReal || '').toUpperCase().trim();
    if (redeP !== redeR) {
      partes.push(`coluna "Rede" de ${redePlanilha || '(vazio)'} para ${redeReal}`);
    }
    if (normalizarMoeda(moedaPlanilha) !== normalizarMoeda(moedaReal)) {
      partes.push(`coluna "Moeda" de ${(moedaPlanilha || '').trim() || '(vazio)'} para ${moedaReal || ''}`);
    }
    if (partes.length === 0) return null;
    return `Atenção — Ajuste na planilha para o(s) cliente(s) ${clientesStr}: altere a ${partes.join(' e a ')}.`;
  }

  for (let i = 0; i < hashesUnicos.length; i++) {
    if (i > 0 && delayEntreConsultas > 0) await delay(delayEntreConsultas);
    const hash = hashesUnicos[i];
    const info = porHash.get(hash);
    const hashKey = normalizarHashKey(hash);
    const redePlanilha = (info.rede || '').toUpperCase().replace(/\s/g, '') || null;
    log(`[${i + 1}/${hashesUnicos.length}] Consultando hash: ${hashKey.slice(0, 16)}...`);
    let motivoErro = null;
    let orientacaoCorrecao = null;
    try {
      const redePreferida = redePlanilha === 'ERC20' ? 'ERC20' : '';
      const bc = await consultarBlockchain(hash, etherscanApiKey, redePreferida);
      const duplicidade = duplicidades.some((d) => d.hash === hash);
      let status = validarValores(
        info.valorTotalPlanilha,
        bc ? bc.valor : null,
        duplicidade
      );
      let redeFinal = bc ? bc.rede : null;
      let valorBcFinal = bc ? bc.valor : null;
      let moedaFinal = bc ? bc.moeda : null;

      if (status !== 'OK') {
        if (i > 0 && delayEntreConsultas > 0) await delay(delayEntreConsultas);
        log(`  -> Status não OK (${status}), consultando ambas as redes...`);
        const { trc20, erc20 } = await consultarAmbasRedes(hash, etherscanApiKey);
        log(`  -> TRC20: ${trc20 ? `valor=${trc20.valor}` : 'null'}, ERC20: ${erc20 ? `valor=${erc20.valor}` : 'null'}, planilha=${info.valorTotalPlanilha}`);
        const matchTrc20 = trc20 && valorCompativel(info.valorTotalPlanilha, trc20.valor);
        const matchErc20 = erc20 && valorCompativel(info.valorTotalPlanilha, erc20.valor);
        log(`  -> Match TRC20: ${matchTrc20}, Match ERC20: ${matchErc20}`);
        if (matchTrc20 && !matchErc20) {
          redeFinal = 'TRC20';
          valorBcFinal = trc20.valor;
          moedaFinal = trc20.moeda;
          status = 'OK';
          orientacaoCorrecao = montarOrientacaoAjuste(info, redePlanilha, info.moeda, 'TRC20', trc20.moeda) ||
            'A transação foi concluída na rede TRC20. Corrija na planilha a coluna "Rede" para TRC20.';
          log(`  -> Encontrado na outra rede: TRC20 valor=${trc20.valor}`);
        } else if (matchErc20 && !matchTrc20) {
          redeFinal = 'ERC20';
          valorBcFinal = erc20.valor;
          moedaFinal = erc20.moeda;
          status = 'OK';
          orientacaoCorrecao = montarOrientacaoAjuste(info, redePlanilha, info.moeda, 'ERC20', erc20.moeda) ||
            'A transação foi concluída na rede ERC20. Corrija na planilha a coluna "Rede" para ERC20.';
          log(`  -> Encontrado na outra rede: ERC20 valor=${erc20.valor}`);
        } else if (matchTrc20 && matchErc20) {
          redeFinal = bc?.rede || trc20?.rede || 'TRC20';
          valorBcFinal = trc20.valor;
          moedaFinal = trc20.moeda;
          status = 'OK';
          orientacaoCorrecao = montarOrientacaoAjuste(info, redePlanilha, info.moeda, redeFinal, moedaFinal) ||
            'Transação encontrada em TRC20 e ERC20. Confira na planilha qual rede/moeda foi utilizada e ajuste as colunas "Rede" e "Moeda".';
        } else {
          if (!bc) {
            motivoErro = 'Não encontrado em TRC20 nem ERC20 (ou rede indisponível).';
            log(`  -> Não encontrado. Hash: ${hashKey.slice(0, 16)}...`);
          } else {
            orientacaoCorrecao =
              'Valor na blockchain difere da planilha em ambas as redes. Verifique o valor e a rede (TRC20/ERC20) na planilha; se a operação foi em outra rede, corrija a coluna "Rede".';
          }
        }
      }

      if (status === 'OK' && !orientacaoCorrecao) {
        const redeP = (redePlanilha || '').toUpperCase();
        const redeF = (redeFinal || '').toUpperCase();
        const moedaP = normalizarMoeda(info.moeda);
        const moedaF = normalizarMoeda(moedaFinal);
        if (redeP !== redeF || moedaP !== moedaF) {
          orientacaoCorrecao = montarOrientacaoAjuste(info, redePlanilha || '', info.moeda || '', redeFinal, moedaFinal);
        }
      }

      if (!bc && status === 'HASH_NAO_ENCONTRADO' && !motivoErro) {
        motivoErro = 'Não encontrado em TRC20 nem ERC20 (ou rede indisponível).';
        log(`  -> Não encontrado. Hash: ${hashKey.slice(0, 16)}...`);
      } else if (status === 'OK' && !orientacaoCorrecao && bc) {
        log(`  -> OK ${redeFinal} ${moedaFinal} valor=${valorBcFinal}`);
      }

      let carteira_destino_ok = null;
      let orientacao_carteira_destino = null;
      if (validarCarteiras && bc) {
        const destinoNorm = bc.endereco_destino ? normalizarEndereco(bc.endereco_destino) : '';
        const clientesHash = info?.clientes ? [...info.clientes] : [];
        const carteirasDoCliente = new Set();
        for (const c of clientesHash) {
          const key = (c || '').toString().trim();
          const matchKey = Object.keys(carteirasClientes).find((k) => k.trim().toUpperCase() === key.toUpperCase());
          const addrs = matchKey ? (carteirasClientes[matchKey] || []) : [];
          addrs.forEach((a) => carteirasDoCliente.add(a));
        }
        if (Object.keys(carteirasClientes).length > 0 && destinoNorm) {
          if (carteirasDoCliente.size === 0) {
            carteira_destino_ok = null;
          } else {
            carteira_destino_ok = carteirasDoCliente.has(destinoNorm);
            if (!carteira_destino_ok) {
              const clientesPlanilha = clientesHash.join(', ');
              const clientesPlanilhaSet = new Set(clientesHash.map((c) => (c || '').toString().trim().toUpperCase()));
              let outroCliente = null;
              for (const [nomeCliente, addrs] of Object.entries(carteirasClientes)) {
                const nomeNorm = (nomeCliente || '').toString().trim().toUpperCase();
                if (Array.isArray(addrs) && addrs.includes(destinoNorm) && !clientesPlanilhaSet.has(nomeNorm)) {
                  outroCliente = nomeCliente;
                  break;
                }
              }
              if (outroCliente) {
                orientacao_carteira_destino = `A transferência foi para a carteira do cliente "${outroCliente}" (${bc.endereco_destino}), mas a planilha indica o(s) cliente(s): ${clientesPlanilha}. Verifique qual é a carteira de destino da operação.`;
                log(`  -> Carteira destino não confere: transferência para carteira de outro cliente (${outroCliente}): ${bc.endereco_destino}`);
              } else {
                orientacao_carteira_destino = `Destino na blockchain (${bc.endereco_destino}) não consta nas carteiras do(s) cliente(s) da planilha (${clientesPlanilha}) nem de outros clientes cadastrados. Verifique o cadastro em carteiras-clientes.`;
                log(`  -> Carteira destino não confere com cliente: ${bc.endereco_destino}`);
              }
            } else {
              log(`  -> Carteira destino OK (cliente): ${bc.endereco_destino}`);
            }
          }
        }
      }

      resultados.set(hashKey, {
        hash,
        rede: redeFinal,
        moeda: moedaFinal,
        valor_total_planilha: info.valorTotalPlanilha,
        valor_blockchain: valorBcFinal,
        status_validacao: status,
        motivo_erro: motivoErro,
        orientacao_correcao: orientacaoCorrecao,
        data_consulta: new Date().toISOString(),
        endereco_remetente: bc?.endereco_remetente ?? null,
        endereco_destino: bc?.endereco_destino ?? null,
        carteira_destino_ok,
        orientacao_carteira_destino,
      });
      onProgress(i + 1, hashesUnicos.length);
    } catch (err) {
      motivoErro = err.message || String(err);
      log(`  -> Erro: ${motivoErro}`);
      resultados.set(hashKey, {
        hash,
        rede: null,
        moeda: null,
        valor_total_planilha: info.valorTotalPlanilha,
        valor_blockchain: null,
        status_validacao: 'HASH_NAO_ENCONTRADO',
        motivo_erro: motivoErro,
        orientacao_correcao: null,
        data_consulta: new Date().toISOString(),
        endereco_remetente: null,
        endereco_destino: null,
        carteira_destino_ok: null,
        orientacao_carteira_destino: null,
      });
      onProgress(i + 1, hashesUnicos.length);
    }
  }

  const hashesRedeMoedaDivergentes = new Set(redeMoedaDivergentesMesmoHash.map((x) => x.hash.toLowerCase()));

  const registros = hashesUnicos.map((h) => {
    const r = resultados.get(normalizarHashKey(h));
    const info = porHash.get(h);
    const clientes = info?.clientes ? [...info.clientes] : [];
    const statusRedeMoedaDivergente = hashesRedeMoedaDivergentes.has(h.toLowerCase());
    const statusBase = statusRedeMoedaDivergente
      ? 'DIVERGENCIA_REDE_MOEDA'
      : (r?.status_validacao === 'OK' && r?.orientacao_correcao ? 'CORRECAO_PLANILHA' : (r?.status_validacao ?? null));
    return {
      hash: h,
      rede: r?.rede ?? null,
      moeda: r?.moeda ?? null,
      valor_total_planilha: r?.valor_total_planilha ?? null,
      valor_blockchain: r?.valor_blockchain ?? null,
      status_validacao: statusBase,
      data_consulta: r?.data_consulta ?? null,
      motivo_erro: r?.motivo_erro ?? null,
      orientacao_correcao: r?.orientacao_correcao ?? null,
      clientes,
      endereco_remetente: r?.endereco_remetente ?? null,
      endereco_destino: r?.endereco_destino ?? null,
      carteira_destino_ok: r?.carteira_destino_ok ?? null,
      orientacao_carteira_destino: r?.orientacao_carteira_destino ?? null,
    };
  });

  const caminhoCsv = gerarRelatorio(registros, pastaSaida);
  const inconsistencias = listarInconsistencias(registros, duplicidades, redeMoedaDivergentesMesmoHash);

  return {
    registros,
    duplicidades,
    inconsistencias,
    linhasSemHash: linhasSemHash || [],
    caminhoCsv,
  };
}

module.exports = { runValidation };
