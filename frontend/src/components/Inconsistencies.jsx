import React, { useState, useCallback } from 'react';
import styles from './Inconsistencies.module.css';

const TITLES = {
  DIVERGENCIA_VALOR: 'Divergência de Valor',
  HASH_NAO_ENCONTRADO: 'Hash não encontrado',
  DUPLICIDADE: 'Duplicidade (Mesmo Hash, Clientes Diferentes)',
  CORRECAO_PLANILHA: 'Ajuste Sugerido na Planilha',
  REDE_MOEDA_DIVERGENTES_MESMO_HASH: 'Rede/Moeda Diferentes Para o Mesmo Hash',
  CARTEIRA_DESTINO_NAO_CONFERE: 'Carteira de Destino Não Confere com Cliente',
};

function formatValor(v) {
  if (v == null || v === '') return '—';
  const n = Number(v);
  return Number.isNaN(n) ? String(v) : n.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function formatHash(hash) {
  if (!hash || !hash.trim()) return '—';
  const h = hash.trim();
  if (h.length <= 20) return h;
  return `${h.slice(0, 10)}…${h.slice(-10)}`;
}

const ID_INCONSISTENCIA = 'inc';
const ID_SEM_HASH = 'sem';

export function Inconsistencies({ inconsistencias, linhasSemHash, corrigidosCards = new Set(), onMarcarCorrigido }) {
  const [copiado, setCopiado] = useState(null);

  const copiarHash = useCallback((hash, e) => {
    e.preventDefault();
    if (!hash) return;
    navigator.clipboard?.writeText(hash.trim()).then(() => {
      setCopiado(hash.trim());
      setTimeout(() => setCopiado(null), 2000);
    });
  }, []);

  const incVisiveis = (inconsistencias || []).filter((_, i) => !corrigidosCards.has(`${ID_INCONSISTENCIA}-${i}`));
  const semHashComIndice = (linhasSemHash || []).map((item, i) => ({ item, i }));
  const semHashVisiveis = semHashComIndice.filter(({ i }) => !corrigidosCards.has(`${ID_SEM_HASH}-${i}`));

  const temInconsistencias = incVisiveis.length > 0;
  const temSemHash = semHashVisiveis.length > 0;
  const totalVisivel = incVisiveis.length + semHashVisiveis.length;
  if (totalVisivel === 0 && (inconsistencias?.length > 0 || linhasSemHash?.length > 0)) {
    return (
      <section className={styles.section} aria-labelledby="inconsistencias-heading">
        <div className={styles.todasCorrigidasBlock}>
          <h2 id="inconsistencias-heading" className={styles.title}>
            Inconsistências (todas marcadas como corrigidas)
          </h2>
          <p className={styles.todasCorrigidas}>
            Todas as inconsistências foram marcadas como corrigidas. Execute uma nova validação para conferir.
          </p>
        </div>
      </section>
    );
  }
  if (totalVisivel === 0) return null;

  return (
    <section className={styles.section} aria-labelledby="inconsistencias-heading">
      <h2 id="inconsistencias-heading" className={styles.title}>
        Inconsistências
        {totalVisivel > 0 && ` (${totalVisivel})`}
      </h2>
      {temSemHash && (
        <div className={styles.semHash} role="status">
          <h3 className={styles.subtitle}>Registros sem hash informado</h3>
          <p className={styles.semHashIntro}>
            {semHashVisiveis.length} cliente(s) com linha preenchida e hash vazio — informe o hash na planilha para validar.
          </p>
          <ul className={styles.list} aria-label="Clientes sem hash">
            {semHashVisiveis.map(({ item, i }) => {
              const id = `${ID_SEM_HASH}-${i}`;
              return (
                <li key={id} className={styles.item} data-tipo="SEM_HASH">
                  <span className={styles.detail}>
                    <strong>{item.cliente}</strong>
                    {item.valorME != null && item.valorME !== 0 && (
                      <> — Valor ME: {Number(item.valorME).toLocaleString('pt-BR')}</>
                    )}
                    {item.numeroLinha != null && (
                      <> (linha {item.numeroLinha})</>
                    )}
                  </span>
                  <label className={styles.corrigidoLabel}>
                    <input
                      type="checkbox"
                      checked={false}
                      onChange={() => onMarcarCorrigido?.(id)}
                      className={styles.corrigidoCheckbox}
                    />
                    <span>Marcar como corrigido</span>
                  </label>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {temInconsistencias && (
        <ul className={styles.list}>
          {inconsistencias.map((inc, i) => {
            const id = `${ID_INCONSISTENCIA}-${i}`;
            if (corrigidosCards.has(id)) return null;
            return (
            <li key={inc.hash ?? id} className={styles.item} data-tipo={inc.tipo}>
              <div className={styles.cardHeader}>
                <span className={styles.tipo}>{TITLES[inc.tipo] ?? inc.tipo}</span>
                {inc.hash && (
                  <button
                    type="button"
                    className={styles.hashButton}
                    onClick={(e) => copiarHash(inc.hash, e)}
                    title="Clique para copiar o hash completo"
                  >
                    <code className={styles.hashCode} title={inc.hash}>
                      {formatHash(inc.hash)}
                    </code>
                    {copiado === inc.hash?.trim() && (
                      <span className={styles.copiado}>Copiado!</span>
                    )}
                  </button>
                )}
              </div>

              <div className={styles.cardMeta}>
                {inc.clientes?.length > 0 && (
                  <div className={styles.metaRow}>
                    <span className={styles.metaLabel}>Cliente(s):</span>
                    <span className={styles.metaValue}>
                      {inc.tipo === 'DUPLICIDADE' ? inc.clientes.join(' / ') : inc.clientes.join(', ')}
                    </span>
                  </div>
                )}
                {(inc.valor_planilha != null || inc.valor_blockchain != null) && (
                  <>
                    <div className={styles.metaRow}>
                      <span className={styles.metaLabel}>Planilha:</span>
                      <span className={styles.metaValue}>{formatValor(inc.valor_planilha)}</span>
                    </div>
                    <div className={styles.metaRow}>
                      <span className={styles.metaLabel}>Blockchain:</span>
                      <span className={styles.metaValue}>{formatValor(inc.valor_blockchain)}</span>
                    </div>
                  </>
                )}
                {inc.tipo === 'REDE_MOEDA_DIVERGENTES_MESMO_HASH' && inc.numero_linhas?.length > 0 && (
                  <div className={styles.metaRow}>
                    <span className={styles.metaLabel}>Linha(s) na planilha:</span>
                    <span className={styles.metaValue}>{inc.numero_linhas.join(', ')}</span>
                  </div>
                )}
                {(inc.tipo === 'CARTEIRA_DESTINO_NAO_CONFERE' && inc.endereco_destino) && (
                  <div className={styles.metaRow}>
                    <span className={styles.metaLabel}>Destino na blockchain:</span>
                    <span className={styles.metaValue} title={inc.endereco_destino}>
                      {formatHash(inc.endereco_destino)}
                    </span>
                  </div>
                )}
                {(inc.rede || inc.moeda) && (
                  <>
                    {inc.rede && (
                      <div className={styles.metaRow}>
                        <span className={styles.metaLabel}>Rede:</span>
                        <span className={styles.metaValue}>{inc.rede}</span>
                      </div>
                    )}
                    {inc.moeda && (
                      <div className={styles.metaRow}>
                        <span className={styles.metaLabel}>Moeda:</span>
                        <span className={styles.metaValue}>{inc.moeda}</span>
                      </div>
                    )}
                  </>
                )}
              </div>

              {inc.motivo_erro && (
                <div className={styles.motivo} title={inc.motivo_erro}>
                  <span className={styles.motivoLabel}>Motivo:</span> {inc.motivo_erro}
                </div>
              )}

              {inc.orientacao_correcao && (
                <div className={styles.orientacao} title={inc.orientacao_correcao}>
                  {inc.tipo === 'CORRECAO_PLANILHA' ? '→ ' : ''}{inc.orientacao_correcao}
                </div>
              )}

              <label className={styles.corrigidoLabel}>
                <input
                  type="checkbox"
                  checked={false}
                  onChange={() => onMarcarCorrigido?.(id, inc.hash)}
                  className={styles.corrigidoCheckbox}
                />
                <span>Marcar como corrigido</span>
              </label>
            </li>
          );
          })}
        </ul>
      )}
    </section>
  );
}
