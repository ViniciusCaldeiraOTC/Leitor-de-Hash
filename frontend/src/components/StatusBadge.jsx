import React from 'react';
import styles from './StatusBadge.module.css';

const LABELS = {
  OK: 'OK',
  CORRECAO_PLANILHA: 'Ajuste',
  DIVERGENCIA_VALOR: 'Divergência',
  DIVERGENCIA_REDE_MOEDA: 'Divergência',
  HASH_NAO_ENCONTRADO: 'Não encontrado',
  DUPLICIDADE: 'Duplicidade',
};

export function StatusBadge({ status }) {
  const label = LABELS[status] ?? status;
  return (
    <span className={`${styles.badge} ${styles[status] ?? ''}`} data-status={status}>
      {label}
    </span>
  );
}
