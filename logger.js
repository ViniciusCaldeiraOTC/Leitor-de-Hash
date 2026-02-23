/**
 * Log com data e hora da execução (arquivo + console)
 */
const fs = require('fs');
const path = require('path');

let stream = null;
const LOG_FILE = path.join(__dirname, 'execucao.log');

function abrirLog() {
  const linha = '\n' + '='.repeat(60) + '\n';
  const cabecalho = `[${new Date().toISOString()}] Início da execução\n`;
  stream = fs.createWriteStream(LOG_FILE, { flags: 'a' });
  stream.write(linha + cabecalho);
}

function log(mensagem) {
  const texto = `[${new Date().toISOString()}] ${mensagem}\n`;
  if (stream) stream.write(texto);
  console.log(mensagem);
}

function fecharLog() {
  if (stream) {
    stream.write(`[${new Date().toISOString()}] Fim da execução\n`);
    stream.end();
    stream = null;
  }
}

module.exports = {
  abrirLog,
  log,
  fecharLog,
  LOG_FILE,
};
