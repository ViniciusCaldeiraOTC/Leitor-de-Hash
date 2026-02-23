import React, { useState, useCallback, useEffect, useRef } from 'react';
import { UploadZone } from './components/UploadZone';
import { ResultsTable } from './components/ResultsTable';
import { Inconsistencies } from './components/Inconsistencies';
import { Cadastro } from './components/Cadastro';
import { validarPlanilhaStream, getRelatorioUrl, enviarRelatorioGoogleSheets, getSheetNamesFromFile, abrirModeloGoogleSheets } from './services/api';
import styles from './App.module.css';

function normalizarHash(h) {
  return (h || '').trim().toLowerCase();
}

const TAB_VALIDACAO = 'validacao';
const TAB_CADASTRO = 'cadastro';

export default function App() {
  const [activeTab, setActiveTab] = useState(TAB_VALIDACAO);
  const [file, setFile] = useState(null);
  const [sheetNames, setSheetNames] = useState([]);
  const [selectedAba, setSelectedAba] = useState('');
  const [abaDropdownOpen, setAbaDropdownOpen] = useState(false);
  const abaDropdownRef = useRef(null);
  const [loadingAbas, setLoadingAbas] = useState(false);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [corrigidosHashes, setCorrigidosHashes] = useState(() => new Set());
  const [corrigidosCards, setCorrigidosCards] = useState(() => new Set());

  useEffect(() => {
    setCorrigidosHashes(new Set());
    setCorrigidosCards(new Set());
  }, [result]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (abaDropdownRef.current && !abaDropdownRef.current.contains(e.target)) {
        setAbaDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleFileSelect = useCallback(async (selectedFile) => {
    setFile(selectedFile);
    setError('');
    setResult(null);
    setProgress({ current: 0, total: 0 });
    setSheetNames([]);
    setSelectedAba('');
    if (!selectedFile) return;
    setLoadingAbas(true);
    try {
      const names = await getSheetNamesFromFile(selectedFile);
      setSheetNames(names);
      setSelectedAba('');
    } catch {
      setSheetNames([]);
      setSelectedAba('');
    } finally {
      setLoadingAbas(false);
    }
  }, []);

  const handleValidar = useCallback(async () => {
    if (!file) {
      setError('Selecione uma planilha primeiro.');
      return;
    }
    setLoading(true);
    setError('');
    setResult(null);
    setProgress({ current: 0, total: 0 });
    try {
      const data = await validarPlanilhaStream(file, {
        onProgress: (current, total) => setProgress({ current, total }),
        aba: selectedAba || undefined,
      });
      setResult(data);
    } catch (err) {
      setError(err.message || 'Erro ao validar.');
    } finally {
      setLoading(false);
      setProgress({ current: 0, total: 0 });
    }
  }, [file, selectedAba]);

  const handleDownload = useCallback(() => {
    window.open(getRelatorioUrl(), '_blank', 'noopener,noreferrer');
  }, []);

  const [googleSheetsLoading, setGoogleSheetsLoading] = useState(false);
  const [googleSheetsError, setGoogleSheetsError] = useState('');
  const [modeloGoogleSheetsLoading, setModeloGoogleSheetsLoading] = useState(false);
  const [modeloGoogleSheetsError, setModeloGoogleSheetsError] = useState('');
  const handleModeloGoogleSheets = useCallback(async () => {
    setModeloGoogleSheetsError('');
    setModeloGoogleSheetsLoading(true);
    try {
      const url = await abrirModeloGoogleSheets();
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      const msg = err && err.message ? err.message : '';
      const naoConfigurado = msg.includes('não configurado') || msg.includes('GOOGLE_SERVICE_ACCOUNT');
      setModeloGoogleSheetsError(
        naoConfigurado
          ? 'Google Sheets não está configurado no servidor. Use «Baixar Modelo» para baixar o Excel.'
          : msg || 'Erro ao abrir modelo no Google Sheets.'
      );
    } finally {
      setModeloGoogleSheetsLoading(false);
    }
  }, []);
  const handleGoogleSheets = useCallback(async () => {
    setGoogleSheetsError('');
    setGoogleSheetsLoading(true);
    try {
      const url = await enviarRelatorioGoogleSheets();
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      const msg = err.message || '';
      const naoConfigurado = msg.includes('não configurado') || msg.includes('GOOGLE_SERVICE_ACCOUNT');
      setGoogleSheetsError(
        naoConfigurado
          ? 'Google Sheets não está configurado no servidor. Use «Baixar relatório CSV» para baixar o relatório.'
          : msg || 'Erro ao abrir no Google Sheets.'
      );
    } finally {
      setGoogleSheetsLoading(false);
    }
  }, []);

  const handleMarcarCorrigido = useCallback((id, hash) => {
    setCorrigidosCards((prev) => new Set([...prev, id]));
    if (hash) {
      setCorrigidosHashes((prev) => new Set([...prev, normalizarHash(hash)]));
    }
  }, []);

  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <h1 className={styles.title}>Caldeira OTC</h1>
        <p className={styles.subtitle}>
          Validação de hashes TRC20 e ERC20 (USDT/USDC)
        </p>
      </header>

      <nav className={styles.tabs} aria-label="Abas do sistema">
        <button
          type="button"
          className={activeTab === TAB_VALIDACAO ? styles.tabActive : styles.tab}
          onClick={() => setActiveTab(TAB_VALIDACAO)}
          aria-selected={activeTab === TAB_VALIDACAO}
        >
          Validação
        </button>
        <button
          type="button"
          className={activeTab === TAB_CADASTRO ? styles.tabActive : styles.tab}
          onClick={() => setActiveTab(TAB_CADASTRO)}
          aria-selected={activeTab === TAB_CADASTRO}
        >
          Cadastro
        </button>
      </nav>

      <main className={styles.main}>
        {activeTab === TAB_CADASTRO ? (
          <section className={styles.section}>
            <Cadastro />
          </section>
        ) : (
        <>
        <section className={styles.section}>
          <UploadZone onFileSelect={handleFileSelect} disabled={loading} />
          {file && (
            <p className={styles.fileName}>
              Arquivo: <strong>{file.name}</strong>
            </p>
          )}
          <div className={styles.buttonsRow}>
            <button
              type="button"
              className={styles.button}
              onClick={handleValidar}
              disabled={loading || !file || loadingAbas || (file && !loadingAbas && !selectedAba)}
              aria-busy={loading}
              title={file && !loadingAbas && !selectedAba ? 'Selecione a data (aba) da planilha antes de validar' : undefined}
            >
              {loading ? 'Validando…' : 'Validar Planilha'}
            </button>
            <button
              type="button"
              className={styles.button}
              onClick={handleModeloGoogleSheets}
              disabled={loading || modeloGoogleSheetsLoading}
              title="Abrir ou criar a planilha modelo no Google Sheets (aba Modelo)"
            >
              {modeloGoogleSheetsLoading ? 'Abrindo…' : 'Modelo no Google Sheets'}
            </button>
            {modeloGoogleSheetsError && (
              <p className={styles.googleSheetsError} role="alert" style={{ marginTop: 4 }}>
                {modeloGoogleSheetsError}
              </p>
            )}
            {file && (
              <div className={styles.abaDropdownWrap} ref={abaDropdownRef}>
                <button
                  type="button"
                  className={styles.abaSelect}
                  onClick={() => !loadingAbas && setAbaDropdownOpen((v) => !v)}
                  disabled={loading || loadingAbas}
                  aria-label="Selecione a aba (data) da planilha"
                  aria-expanded={abaDropdownOpen}
                  aria-haspopup="listbox"
                  title="Selecione a data"
                >
                  <span className={styles.abaSelectValue}>
                    {loadingAbas ? 'Carregando abas…' : (selectedAba || 'Selecione a data')}
                  </span>
                  <span className={styles.abaSelectChevron} aria-hidden>▼</span>
                </button>
                {abaDropdownOpen && (
                  <ul
                    className={styles.abaDropdownList}
                    role="listbox"
                    aria-label="Abas da planilha"
                  >
                    <li
                      role="option"
                      className={styles.abaDropdownItem}
                      aria-selected={!selectedAba}
                      onClick={() => { setSelectedAba(''); setAbaDropdownOpen(false); }}
                    >
                      Selecione a data
                    </li>
                    {sheetNames.map((name) => (
                      <li
                        key={name}
                        role="option"
                        className={styles.abaDropdownItem}
                        aria-selected={selectedAba === name}
                        onClick={() => { setSelectedAba(name); setAbaDropdownOpen(false); }}
                      >
                        {name}
                      </li>
                    ))}
                    {!loadingAbas && sheetNames.length === 0 && (
                      <li className={styles.abaDropdownItemEmpty}>
                        Nenhuma aba encontrada
                      </li>
                    )}
                  </ul>
                )}
              </div>
            )}
          </div>
          {loading && progress.total > 0 && (
            <div className={styles.progressWrap} role="progressbar" aria-valuenow={progress.current} aria-valuemin={0} aria-valuemax={progress.total} aria-label="Progresso da análise">
              <div className={styles.progressBar}>
                <div
                  className={styles.progressFill}
                  style={{ width: `${progress.total ? (100 * progress.current) / progress.total : 0}%` }}
                />
              </div>
              <p className={styles.progressText}>
                Analisando… {progress.current} de {progress.total} hashes
                {progress.total ? ` (${Math.round((100 * progress.current) / progress.total)}%)` : ''}
              </p>
            </div>
          )}
          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
        </section>

        {result && (
          <>
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>Resultados</h2>
              <ResultsTable registros={result.registros} corrigidosHashes={corrigidosHashes} />
              {result.temRelatorio && (
                <div className={styles.relatorioActions}>
                  <button
                    type="button"
                    className={styles.buttonSecondary}
                    onClick={handleDownload}
                  >
                    Baixar relatório CSV
                  </button>
                  <button
                    type="button"
                    className={styles.buttonSecondary}
                    onClick={handleGoogleSheets}
                    disabled={googleSheetsLoading}
                  >
                    {googleSheetsLoading ? 'Abrindo…' : 'Abrir no Google Sheets'}
                  </button>
                  {googleSheetsError && (
                    <p className={styles.googleSheetsError} role="alert">
                      {googleSheetsError}
                    </p>
                  )}
                </div>
              )}
            </section>
            {(result.inconsistencias?.length > 0 || result.linhasSemHash?.length > 0) && (
              <section className={styles.section}>
                <Inconsistencies
                  inconsistencias={result.inconsistencias}
                  linhasSemHash={result.linhasSemHash}
                  corrigidosCards={corrigidosCards}
                  onMarcarCorrigido={handleMarcarCorrigido}
                />
              </section>
            )}
          </>
        )}
        </>
        )}
      </main>

      <footer className={styles.footer}>
        <p>Planilha com colunas: REDE, Moeda, Valor ME, Cliente, Hash</p>
      </footer>
    </div>
  );
}
