import React, { useCallback, useState } from 'react';
import styles from './UploadZone.module.css';

const ACCEPT = '.xlsx,.xls';
const MAX_SIZE_MB = 10;

export function UploadZone({ onFileSelect, disabled }) {
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState('');

  const validate = useCallback((file) => {
    setError('');
    if (!file) return false;
    if (!/\.(xlsx|xls)$/i.test(file.name)) {
      setError('Envie um arquivo Excel (.xlsx ou .xls).');
      return false;
    }
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      setError(`Tamanho máximo: ${MAX_SIZE_MB} MB.`);
      return false;
    }
    return true;
  }, []);

  const handleDrop = useCallback(
    (e) => {
      e.preventDefault();
      setDragActive(false);
      if (disabled) return;
      const file = e.dataTransfer?.files?.[0];
      if (validate(file)) onFileSelect(file);
    },
    [disabled, onFileSelect, validate]
  );

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    setDragActive(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    if (!e.currentTarget.contains(e.relatedTarget)) {
      setDragActive(false);
    }
  }, []);

  const handleChange = useCallback(
    (e) => {
      setError('');
      const file = e.target.files?.[0];
      if (validate(file)) onFileSelect(file);
      e.target.value = '';
    },
    [onFileSelect, validate]
  );

  return (
    <div className={styles.wrapper}>
      <label
        className={`${styles.zone} ${dragActive ? styles.zoneActive : ''} ${disabled ? styles.zoneDisabled : ''}`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        <input
          type="file"
          accept={ACCEPT}
          onChange={handleChange}
          disabled={disabled}
          className={styles.input}
          aria-label="Selecionar planilha Excel"
        />
        <span className={styles.icon} aria-hidden>
          📊
        </span>
        <span className={styles.text}>
          Arraste a planilha aqui ou <strong>clique para escolher</strong>
        </span>
        <span className={styles.hint}>.xlsx ou .xls — até {MAX_SIZE_MB} MB</span>
      </label>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
