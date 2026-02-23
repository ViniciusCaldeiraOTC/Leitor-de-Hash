import React, { useState, useCallback, useEffect } from 'react';
import { StatusBadge } from './StatusBadge';
import styles from './ResultsTable.module.css';

function formatValor(v) {
  if (v == null || v === '') return '—';
  const n = Number(v);
  return Number.isNaN(n) ? String(v) : n.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function formatHash(hash) {
  if (!hash || !hash.trim()) return '—';
  const h = hash.trim();
  if (h.length <= 16) return h;
  return `${h.slice(0, 8)}…${h.slice(-8)}`;
}

function normalizarHash(h) {
  return (h || '').trim().toLowerCase();
}

export function ResultsTable({ registros, corrigidosHashes = new Set() }) {
  const [copiado, setCopiado] = useState(null);
  const [apenasComApontamento, setApenasComApontamento] = useState(false);

  const copiarHash = useCallback((hash, e) => {
    e.preventDefault();
    if (!hash) return;
    navigator.clipboard?.writeText(hash.trim()).then(() => {
      setCopiado(hash.trim());
      setTimeout(() => setCopiado(null), 2000);
    });
  }, []);

  if (!registros?.length) return null;

  const statusExibido = (r) => {
    const status = r.status_validacao || '';
    if (status === 'HASH_NAO_ENCONTRADO') return status;
    return corrigidosHashes.has(normalizarHash(r.hash)) ? 'OK' : status;
  };
  const comApontamento = registros.filter((r) => {
    const corrigido = corrigidosHashes.has(normalizarHash(r.hash));
    if (corrigido) return false;
    const status = r.status_validacao || '';
    const temOrientacao = !!(r.orientacao_correcao && r.orientacao_correcao.trim());
    return status !== 'OK' || temOrientacao;
  });
  const temAlgumApontamento = comApontamento.length > 0;

  useEffect(() => {
    if (!temAlgumApontamento && apenasComApontamento) {
      setApenasComApontamento(false);
    }
  }, [temAlgumApontamento, apenasComApontamento]);

  const exibidos = apenasComApontamento ? comApontamento : registros;

  return (
    <div className={styles.container}>
      {temAlgumApontamento && (
        <div className={styles.filtro}>
          <label className={styles.filtroLabel}>
            <input
              type="checkbox"
              checked={apenasComApontamento}
              onChange={(e) => setApenasComApontamento(e.target.checked)}
              className={styles.filtroCheckbox}
            />
            <span>Exibir apenas com apontamento (diferente de OK)</span>
          </label>
          {apenasComApontamento && (
            <span className={styles.filtroContagem}>
              Exibindo {exibidos.length} de {registros.length} registros
            </span>
          )}
        </div>
      )}
      <div className={styles.wrapper}>
        <table className={styles.table}>
            <thead>
              <tr>
                <th>Hash</th>
                <th>Cliente(s)</th>
                <th>Rede</th>
                <th>Moeda</th>
                <th className={styles.num}>Valor planilha</th>
                <th className={styles.num}>Valor blockchain</th>
                <th className={styles.statusCol}>Status</th>
                <th className={styles.carteira}>Carteira</th>
              </tr>
            </thead>
          <tbody>
            {exibidos.length === 0 ? (
              <tr>
                <td colSpan={8} className={styles.empty}>
                  {apenasComApontamento
                    ? 'Nenhum registro com apontamento (todos OK).'
                    : 'Nenhum registro.'}
                </td>
              </tr>
            ) : (
              exibidos.map((r, i) => (
                <tr key={r.hash ?? i}>
                <td
                  className={styles.hash}
                  title={r.hash ? `Hash completo (clique para copiar): ${r.hash}` : ''}
                >
                  <button
                    type="button"
                    className={styles.hashButton}
                    onClick={(e) => copiarHash(r.hash, e)}
                    title="Clique para copiar o hash completo"
                  >
                    <code>{formatHash(r.hash)}</code>
                    {copiado === r.hash?.trim() && <span className={styles.copiado}>Copiado!</span>}
                  </button>
                </td>
                <td className={styles.clientes}>
                  {Array.isArray(r.clientes) && r.clientes.length
                    ? r.clientes.join(', ')
                    : '—'}
                </td>
                <td>{r.rede || '—'}</td>
                <td>{r.moeda || '—'}</td>
                <td className={styles.num}>{formatValor(r.valor_total_planilha)}</td>
                <td className={styles.num}>{formatValor(r.valor_blockchain)}</td>
                <td className={styles.statusCell}>
                  <StatusBadge status={statusExibido(r)} />
                </td>
                <td className={styles.carteira} title={r.orientacao_carteira_destino || r.endereco_destino || undefined}>
                  {r.carteira_destino_ok === true && <span className={styles.carteiraOk}>OK</span>}
                  {r.carteira_destino_ok === false && (
                    <span className={styles.carteiraNao}>Não confere</span>
                  )}
                  {(r.carteira_destino_ok !== true && r.carteira_destino_ok !== false) && '—'}
                </td>
              </tr>
              )))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
