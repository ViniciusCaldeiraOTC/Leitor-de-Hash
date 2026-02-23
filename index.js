/**
 * CLI: Sistema de validação automática de hashes OTC (execução por terminal)
 */
const config = require('./config');
const { runValidation } = require('./runValidation');
const logger = require('./logger');

async function main() {
  logger.abrirLog();

  try {
    if (!config.ETHERSCAN_API_KEY) {
      logger.log('Aviso: ETHERSCAN_API_KEY não definida no .env. Consultas ERC20 podem falhar.');
    }
    logger.log(`Planilha: ${config.PLANILHA_PATH}`);

    const { registros, duplicidades, inconsistencias, caminhoCsv, erro } = await runValidation(
      config.PLANILHA_PATH,
      { etherscanApiKey: config.ETHERSCAN_API_KEY }
    );

    if (erro) {
      logger.log(erro);
      return;
    }

    logger.log(`Linhas com hash processadas. Hashes únicos: ${registros.length}`);
    if (duplicidades.length > 0) {
      logger.log(`Atenção: ${duplicidades.length} hash(es) com clientes diferentes (duplicidade).`);
    }
    if (caminhoCsv) logger.log(`Relatório gerado: ${caminhoCsv}`);

    if (inconsistencias.length > 0) {
      logger.log('\n--- INCONSISTÊNCIAS ---');
      for (const inc of inconsistencias) {
        if (inc.tipo === 'DIVERGENCIA_VALOR') {
          logger.log(
            `DIVERGENCIA_VALOR | Hash: ${inc.hash} | Planilha: ${inc.valor_planilha} | Blockchain: ${inc.valor_blockchain}`
          );
        } else if (inc.tipo === 'HASH_NAO_ENCONTRADO') {
          logger.log(`HASH_NAO_ENCONTRADO | Hash: ${inc.hash}`);
        } else if (inc.tipo === 'DUPLICIDADE') {
          logger.log(`DUPLICIDADE | Hash: ${inc.hash} | Clientes: ${(inc.clientes || []).join(', ')}`);
        } else if (inc.tipo === 'CORRECAO_PLANILHA') {
          logger.log(`CORRECAO_PLANILHA | Hash: ${inc.hash} | Clientes: ${(inc.clientes || []).join(', ')} | ${inc.orientacao_correcao || ''}`);
        } else if (inc.tipo === 'REDE_MOEDA_DIVERGENTES_MESMO_HASH') {
          logger.log(`REDE_MOEDA_DIVERGENTES_MESMO_HASH | Hash: ${inc.hash} | Linhas: ${(inc.numero_linhas || []).join(', ')} | ${inc.orientacao_correcao || ''}`);
        } else if (inc.tipo === 'CARTEIRA_DESTINO_NAO_CONFERE') {
          logger.log(`CARTEIRA_DESTINO_NAO_CONFERE | Hash: ${inc.hash} | Destino: ${inc.endereco_destino || ''} | ${inc.orientacao_correcao || ''}`);
        }
      }
    } else {
      logger.log('Nenhuma inconsistência encontrada.');
    }
    logger.log('\nExecução concluída com sucesso.');
  } catch (err) {
    logger.log(`Erro: ${err.message}`);
    if (err.stack) logger.log(err.stack);
    process.exitCode = 1;
  } finally {
    logger.fecharLog();
  }
}

main();
