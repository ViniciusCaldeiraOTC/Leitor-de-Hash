import React, { useState, useEffect, useCallback, useRef } from 'react';
import { getCarteirasClientes, adicionarCarteiraCliente, removerCarteiraCliente } from '../services/api';
import styles from './Cadastro.module.css';

const OPCAO_OUTRO = '__outro__';
const LABEL_OUTRO = '➕ Outro (novo cliente)';

export function Cadastro() {
  const [clientes, setClientes] = useState([]);
  const [carteirasPorCliente, setCarteirasPorCliente] = useState({});
  const [selectedCliente, setSelectedCliente] = useState('');
  const [nomeOutroCliente, setNomeOutroCliente] = useState('');
  const [carteira, setCarteira] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [searchCliente, setSearchCliente] = useState('');
  const [removendoAddr, setRemovendoAddr] = useState(null);
  const dropdownRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getCarteirasClientes();
      setClientes(data.clientes || []);
      setCarteirasPorCliente(data.carteiras || {});
      if (!selectedCliente || !data.clientes.includes(selectedCliente)) {
        setSelectedCliente('');
      }
    } catch (err) {
      setMessage({ type: 'error', text: err.message || 'Erro ao carregar clientes.' });
    } finally {
      setLoading(false);
    }
  }, [selectedCliente]);

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const searchTerm = (searchCliente || '').trim().toLowerCase();
  const clientesFiltrados = searchTerm
    ? clientes.filter((c) => c.toLowerCase().includes(searchTerm))
    : clientes;
  const opcoes = [...clientesFiltrados, OPCAO_OUTRO];

  const isOutro = selectedCliente === OPCAO_OUTRO;
  const clienteFinal = isOutro ? nomeOutroCliente.trim() : selectedCliente;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage({ type: '', text: '' });
    if (!clienteFinal) {
      setMessage({ type: 'error', text: 'Selecione um cliente ou informe o nome do novo cliente.' });
      return;
    }
    const endereco = carteira.trim();
    if (!endereco) {
      setMessage({ type: 'error', text: 'Informe o endereço da carteira (TRC20 ou ERC20).' });
      return;
    }
    setSaving(true);
    try {
      await adicionarCarteiraCliente(clienteFinal, endereco);
      setCarteira('');
      setMessage({ type: 'success', text: `Carteira adicionada para "${clienteFinal}".` });
      if (isOutro) {
        setNomeOutroCliente('');
        setSelectedCliente('');
      }
      load();
    } catch (err) {
      setMessage({ type: 'error', text: err.message || 'Erro ao adicionar carteira.' });
    } finally {
      setSaving(false);
    }
  };

  const carteirasDoSelecionado = selectedCliente && selectedCliente !== OPCAO_OUTRO
    ? (carteirasPorCliente[selectedCliente] || [])
    : [];

  const handleRemoverCarteira = async (addr) => {
    if (!selectedCliente || selectedCliente === OPCAO_OUTRO) return;
    setMessage({ type: '', text: '' });
    setRemovendoAddr(addr);
    try {
      await removerCarteiraCliente(selectedCliente, addr);
      setMessage({ type: 'success', text: 'Carteira removida.' });
      load();
    } catch (err) {
      setMessage({ type: 'error', text: err.message || 'Erro ao remover carteira.' });
    } finally {
      setRemovendoAddr(null);
    }
  };

  if (loading) {
    return (
      <div className={styles.wrap}>
        <p className={styles.loading}>Carregando clientes…</p>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <h2 className={styles.title}>Cadastro de carteiras</h2>
      <p className={styles.desc}>
        Selecione um cliente e informe o endereço da carteira (TRC20 ou ERC20) para vincular.
      </p>

      <form className={styles.form} onSubmit={handleSubmit}>
        <div className={styles.field} ref={dropdownRef}>
          <label htmlFor="cadastro-cliente-search" className={styles.label}>
            Cliente
          </label>
          <div className={styles.comboboxWrap}>
            <input
              id="cadastro-cliente-search"
              type="text"
              className={styles.comboboxInput}
              placeholder="Selecione o cliente ou pesquise pelo nome..."
              value={dropdownOpen ? searchCliente : (selectedCliente === OPCAO_OUTRO ? LABEL_OUTRO : selectedCliente)}
              onChange={(e) => {
                setSearchCliente(e.target.value);
                setDropdownOpen(true);
              }}
              onFocus={() => setDropdownOpen(true)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setDropdownOpen(false);
                  setSearchCliente('');
                }
              }}
              autoComplete="off"
              aria-expanded={dropdownOpen}
              aria-haspopup="listbox"
              aria-label="Pesquisar ou selecionar cliente"
            />
            <button
              type="button"
              className={styles.comboboxChevron}
              onClick={() => setDropdownOpen((v) => !v)}
              aria-label={dropdownOpen ? 'Fechar lista' : 'Abrir lista'}
              tabIndex={-1}
            >
              ▼
            </button>
            {dropdownOpen && (
              <div className={styles.comboboxDropdown} role="listbox">
                <ul className={styles.comboboxList}>
                  {opcoes.length === 0 ? (
                    <li className={styles.comboboxItemEmpty}>Nenhum cliente encontrado</li>
                  ) : (
                    opcoes.map((op) => (
                      <li
                        key={op}
                        role="option"
                        className={styles.comboboxItem}
                        aria-selected={selectedCliente === op}
                        onClick={() => {
                          setSelectedCliente(op);
                          setSearchCliente('');
                          setDropdownOpen(false);
                        }}
                      >
                        {op === OPCAO_OUTRO ? LABEL_OUTRO : op}
                      </li>
                    ))
                  )}
                </ul>
              </div>
            )}
          </div>
          {isOutro && (
            <input
              id="cadastro-outro"
              type="text"
              className={styles.input}
              placeholder="Nome do novo cliente"
              value={nomeOutroCliente}
              onChange={(e) => setNomeOutroCliente(e.target.value)}
              aria-label="Nome do novo cliente"
            />
          )}
        </div>

        <div className={styles.field}>
          <label htmlFor="cadastro-carteira" className={styles.label}>
            Endereço da carteira
          </label>
          <input
            id="cadastro-carteira"
            type="text"
            className={styles.input}
            placeholder="T... ou 0x..."
            value={carteira}
            onChange={(e) => setCarteira(e.target.value)}
            aria-describedby="cadastro-carteira-hint"
          />
          <span id="cadastro-carteira-hint" className={styles.hint}>
            TRC20 (Tron) ou ERC20 (Ethereum)
          </span>
        </div>

        <button
          type="submit"
          className={styles.button}
          disabled={saving || !clienteFinal || !carteira.trim()}
        >
          {saving ? 'Salvando…' : 'Adicionar carteira'}
        </button>
      </form>

      {message.text && (
        <p
          className={message.type === 'error' ? styles.messageError : styles.messageSuccess}
          role="alert"
        >
          {message.text}
        </p>
      )}

      {selectedCliente && selectedCliente !== OPCAO_OUTRO && carteirasDoSelecionado.length > 0 && (
        <div className={styles.listaWrap}>
          <h3 className={styles.listaTitle}>Carteiras de {selectedCliente}</h3>
          <ul className={styles.lista}>
            {carteirasDoSelecionado.map((addr) => (
              <li key={addr} className={styles.listaItem}>
                <code>{addr}</code>
                <button
                  type="button"
                  className={styles.listaItemRemover}
                  onClick={() => handleRemoverCarteira(addr)}
                  disabled={removendoAddr !== null}
                  title="Excluir carteira"
                  aria-label={`Excluir carteira ${addr}`}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
