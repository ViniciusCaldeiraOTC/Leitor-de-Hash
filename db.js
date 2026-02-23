/**
 * Módulo de banco de dados SQLite para validações de hash
 */
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(__dirname, 'hash_validations.db');
let db = null;

/**
 * Inicializa a conexão e cria a tabela se não existir (idempotente).
 */
function inicializarBanco() {
  return new Promise((resolve, reject) => {
    if (db) {
      resolve();
      return;
    }
    db = new sqlite3.Database(DB_PATH, (err) => {
      if (err) {
        reject(err);
        return;
      }
      db.run(
        `CREATE TABLE IF NOT EXISTS hash_validations (
          hash TEXT PRIMARY KEY,
          rede TEXT,
          moeda TEXT,
          valor_total_planilha REAL,
          valor_blockchain REAL,
          status_validacao TEXT,
          motivo_erro TEXT,
          data_consulta DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,
        (err) => {
          if (err) {
            reject(err);
            return;
          }
          db.all('PRAGMA table_info(hash_validations)', (errP, cols) => {
            const colNames = (cols || []).map((c) => c.name);
            const faltaMotivo = !colNames.includes('motivo_erro');
            const faltaOrientacao = !colNames.includes('orientacao_correcao');
            const done = () => resolve();
            if (faltaMotivo) {
              db.run('ALTER TABLE hash_validations ADD COLUMN motivo_erro TEXT', () =>
                faltaOrientacao
                  ? db.run('ALTER TABLE hash_validations ADD COLUMN orientacao_correcao TEXT', done)
                  : done()
              );
            } else if (faltaOrientacao) {
              db.run('ALTER TABLE hash_validations ADD COLUMN orientacao_correcao TEXT', done);
            } else done();
          });
        }
      );
    });
  });
}

/**
 * Verifica se um hash já existe no banco (já foi consultado)
 * @param {string} hash
 * @returns {Promise<boolean>}
 */
function hashJaConsultado(hash) {
  return new Promise((resolve, reject) => {
    db.get(
      'SELECT 1 FROM hash_validations WHERE hash = ?',
      [hash.trim().toLowerCase()],
      (err, row) => {
        if (err) reject(err);
        else resolve(!!row);
      }
    );
  });
}

function normalizarHashKey(h) {
  const x = (h || '').trim().toLowerCase().replace(/^0x/, '');
  return x.length === 64 ? x : (h || '').trim().toLowerCase();
}

/**
 * Salva o resultado da validação no banco (chave normalizada: 64 hex sem 0x)
 * @param {Object} dados - { hash, rede, moeda, valor_total_planilha, valor_blockchain, status_validacao, motivo_erro, orientacao_correcao }
 */
function salvarValidacao(dados) {
  return new Promise((resolve, reject) => {
    const hashKey = normalizarHashKey(dados.hash);
    const sql = `INSERT OR REPLACE INTO hash_validations 
      (hash, rede, moeda, valor_total_planilha, valor_blockchain, status_validacao, motivo_erro, orientacao_correcao, data_consulta) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`;
    db.run(
      sql,
      [
        hashKey,
        dados.rede || null,
        dados.moeda || null,
        dados.valor_total_planilha ?? null,
        dados.valor_blockchain ?? null,
        dados.status_validacao || null,
        dados.motivo_erro ?? null,
        dados.orientacao_correcao ?? null,
      ],
      function (err) {
        if (err) reject(err);
        else resolve({ lastID: this.lastID });
      }
    );
  });
}

/**
 * Busca validação já salva por hash (para não consultar de novo)
 * @param {string} hash
 * @returns {Promise<Object|null>}
 */
function buscarValidacaoPorHash(hash) {
  return new Promise((resolve, reject) => {
    db.get(
      'SELECT * FROM hash_validations WHERE hash = ?',
      [hash.trim().toLowerCase()],
      (err, row) => {
        if (err) reject(err);
        else resolve(row || null);
      }
    );
  });
}

/**
 * Busca validações já salvas para uma lista de hashes
 * @param {string[]} hashes
 * @returns {Promise<Map<string, Object>>} mapa hash -> registro
 */
function buscarValidacoesPorHashes(hashes) {
  return new Promise((resolve, reject) => {
    if (!hashes.length) {
      resolve(new Map());
      return;
    }
    const placeholders = hashes.map(() => '?').join(',');
    const normalized = hashes.map((h) => normalizarHashKey(h));
    db.all(
      `SELECT * FROM hash_validations WHERE hash IN (${placeholders})`,
      normalized,
      (err, rows) => {
        if (err) {
          reject(err);
          return;
        }
        const map = new Map();
        for (const r of rows || []) map.set(r.hash, r);
        resolve(map);
      }
    );
  });
}

/**
 * Fecha a conexão com o banco
 */
function fecharBanco() {
  return new Promise((resolve) => {
    if (db) {
      db.close((err) => {
        if (err) console.error('Erro ao fechar banco:', err.message);
        db = null;
        resolve();
      });
    } else resolve();
  });
}

module.exports = {
  inicializarBanco,
  hashJaConsultado,
  salvarValidacao,
  buscarValidacaoPorHash,
  buscarValidacoesPorHashes,
  fecharBanco,
  getDb: () => db,
};
