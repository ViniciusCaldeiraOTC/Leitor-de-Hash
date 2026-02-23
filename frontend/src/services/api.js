import * as XLSX from 'xlsx';

/** Base da API. No Vercel defina VITE_API_URL com a URL do backend (ex.: https://seu-app.onrender.com). Em dev usa /api (proxy no Vite). */
const API_BASE =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL)
    ? `${String(import.meta.env.VITE_API_URL).replace(/\/$/, '')}/api`
    : '/api';

/**
 * Lê os nomes das abas de um arquivo Excel no navegador (sem enviar ao servidor).
 * @param {File} file - Arquivo .xlsx ou .xls
 * @returns {Promise<string[]>} - Nomes das abas
 */
export function getSheetNamesFromFile(file) {
  return new Promise((resolve, reject) => {
    if (!file) {
      resolve([]);
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array', bookSheets: true });
        const names = (workbook.SheetNames || []).filter((n) => n != null && String(n).trim() !== '');
        resolve(names);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error('Não foi possível ler o arquivo.'));
    reader.readAsArrayBuffer(file);
  });
}

export async function validarPlanilha(file) {
  const formData = new FormData();
  formData.append('planilha', file);
  const res = await fetch(`${API_BASE}/validar`, {
    method: 'POST',
    body: formData,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.erro || res.statusText || 'Erro ao validar planilha.');
  }
  return data;
}

/**
 * Valida a planilha com streaming de progresso (NDJSON).
 * @param {File} file
 * @param {Object} callbacks - { onProgress, aba }
 * @returns {Promise<{ registros, duplicidades, inconsistencias, temRelatorio }>}
 */
export function validarPlanilhaStream(file, callbacks = {}) {
  const formData = new FormData();
  formData.append('planilha', file);
  const params = new URLSearchParams();
  if (callbacks.aba) params.set('aba', callbacks.aba);
  const url = params.toString() ? `${API_BASE}/validar-stream?${params.toString()}` : `${API_BASE}/validar-stream`;
  return new Promise((resolve, reject) => {
    fetch(url, {
      method: 'POST',
      body: formData,
    })
      .then(async (res) => {
        if (!res.ok && !res.body) {
          const data = await res.json().catch(() => ({}));
          reject(new Error(data.erro || res.statusText || 'Erro ao validar planilha.'));
          return;
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let lastResult = null;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            try {
              const obj = JSON.parse(trimmed);
              if (obj.type === 'progress' && typeof obj.current === 'number' && typeof obj.total === 'number') {
                callbacks.onProgress?.(obj.current, obj.total);
              } else if (obj.type === 'result') {
                lastResult = obj;
              } else if (obj.type === 'error') {
                reject(new Error(obj.erro || 'Erro ao validar planilha.'));
                return;
              }
            } catch (_) {}
          }
        }
        if (buffer.trim()) {
          try {
            const obj = JSON.parse(buffer.trim());
            if (obj.type === 'result') lastResult = obj;
            else if (obj.type === 'error') reject(new Error(obj.erro || 'Erro ao validar planilha.'));
          } catch (_) {}
        }
        if (lastResult) resolve(lastResult);
        else if (!res.ok) {
          reject(new Error('Resposta inválida do servidor.'));
        } else {
          reject(new Error('Nenhum resultado recebido.'));
        }
      })
      .catch(reject);
  });
}

export function getRelatorioUrl() {
  return `${API_BASE}/relatorio`;
}

/** Cria uma cópia do relatório no Google Sheets e retorna a URL da planilha. */
export async function enviarRelatorioGoogleSheets() {
  const res = await fetch(`${API_BASE}/relatorio-google-sheets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.erro || 'Erro ao enviar para o Google Sheets.');
  return data.url;
}

/** Abre ou cria a planilha modelo no Google Sheets e retorna a URL da aba Modelo. */
export async function abrirModeloGoogleSheets() {
  const res = await fetch(`${API_BASE}/modelo-google-sheets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.erro || 'Erro ao abrir modelo no Google Sheets.');
  return data.url;
}

/** Lista clientes e carteiras (para aba Cadastro). */
export async function getCarteirasClientes() {
  let res;
  try {
    res = await fetch(`${API_BASE}/carteiras-clientes`);
  } catch (err) {
    const msg = err && err.message ? err.message : 'Erro de rede.';
    throw new Error(msg.includes('fetch') || msg.includes('Network') ? 'Não foi possível conectar ao servidor. Verifique se o servidor está rodando (npm run server).' : msg);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.erro || 'Erro ao carregar clientes.');
  return data;
}

/** Adiciona uma carteira a um cliente. */
export async function adicionarCarteiraCliente(cliente, carteira) {
  const res = await fetch(`${API_BASE}/carteiras-clientes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cliente: cliente.trim(), carteira: carteira.trim() }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.erro || 'Erro ao adicionar carteira.');
  return data;
}

/** Remove uma carteira de um cliente. */
export async function removerCarteiraCliente(cliente, carteira) {
  const res = await fetch(`${API_BASE}/carteiras-clientes`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cliente: cliente.trim(), carteira: carteira.trim() }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.erro || 'Erro ao remover carteira.');
  return data;
}
