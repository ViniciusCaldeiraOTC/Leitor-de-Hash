# Deploy: Backend no Railway + Frontend na Vercel

O **backend** (API Node/Express) sobe no **Railway**. O **frontend** (React) sobe na **Vercel** e aponta para a URL da API.

---

## Parte 1 – Backend no Railway

1. Acesse [railway.app](https://railway.app) e faça login (GitHub, por exemplo).

2. **New Project** → **Deploy from GitHub repo** e selecione o repositório do Leitor de Hash.

3. Railway vai criar um serviço. Se perguntar “What do you want to deploy?”, escolha o **repositório** (não template).

4. **Configurar o serviço:**
   - Clique no serviço (card do deploy).
   - Abra **Settings**.
   - Em **Build**:
     - **Build Command:** `npm install` (ou deixe em branco; o padrão já instala).
   - Em **Deploy**:
     - **Start Command:** `node server.js`  
     (O repositório tem um `Procfile` com `web: node server.js`; se o Railway usar o Procfile, o start já será esse.)

5. **Domínio público:**
   - Em **Settings** → **Networking** → **Generate Domain** (ou **Public Networking**).
   - Anote a URL (ex.: `https://leitor-hash-production.up.railway.app`).

6. **Variáveis de ambiente** (opcional):
   - **Variables** (ou **Environment**) no serviço.
   - `ETHERSCAN_API_KEY` – para validação ERC20 (Ethereum).
   - `GOOGLE_SERVICE_ACCOUNT_JSON` – (opcional) para o botão **Abrir no Google Sheets**. Ver seção abaixo.

7. Aguarde o deploy. A URL do domínio é a **URL do backend** que você vai usar na Vercel.

---

## Parte 2 – Frontend na Vercel

1. Acesse [vercel.com](https://vercel.com) e faça login.

2. **Add New** → **Project** e importe o **mesmo** repositório do Leitor de Hash.

3. **Configure Project:**
   - **Root Directory:** em branco (raiz do repositório).
   - **Build Command:** já vem do `vercel.json`: `cd frontend && npm install && npm run build`.
   - **Output Directory:** já vem do `vercel.json`: `frontend/dist`.

4. **Variável de ambiente obrigatória:**
   - **Environment Variables**
   - Nome: `VITE_API_URL`  
   - Valor: **URL do backend no Railway**, **sem** barra no final.  
     Exemplo: `https://leitor-hash-production.up.railway.app`
   - Marque **Production**, **Preview** e **Development** (se quiser usar em todos).

5. **Deploy.** O frontend vai chamar a API usando essa URL.

---

## Resumo

| Onde     | O quê        | URL / variável |
|----------|--------------|----------------|
| Railway  | API (backend)| URL gerada (ex.: `https://xxx.up.railway.app`) |
| Vercel   | Site (frontend) | URL gerada (ex.: `https://xxx.vercel.app`) |
| Vercel   | Variável     | `VITE_API_URL` = URL do backend (Railway) |

O `server.js` já usa `cors()`, então a Vercel consegue chamar a API no Railway sem ajuste extra. Só não esqueça de preencher `VITE_API_URL` na Vercel com a URL do serviço no Railway.

---

## (Opcional) Botão “Abrir no Google Sheets”

Para o botão **Abrir no Google Sheets** funcionar no backend (Railway):

1. No [Google Cloud Console](https://console.cloud.google.com), crie um projeto (ou use um existente).
2. Ative as APIs **Google Sheets API** e **Google Drive API**.
3. Em **Credenciais** → **Criar credenciais** → **Conta de serviço**. Crie a conta e baixe o JSON da chave.
4. No Railway, em **Variables**, crie a variável:
   - **Name:** `GOOGLE_SERVICE_ACCOUNT_JSON`
   - **Value:** o **conteúdo completo** do arquivo JSON da conta de serviço (copie e cole como uma única linha).
5. Faça um novo deploy. Depois disso, ao clicar em **Abrir no Google Sheets**, o sistema criará uma planilha com o relatório e abrirá o link (qualquer pessoa com o link pode ver).

**Se aparecer "The caller does not have permission" ou "quota exceeded":** use uma **planilha fixa** que você cria e compartilha com a conta de serviço:

1. No Google Sheets, crie uma planilha nova ([sheets.new](https://sheets.new)) ou use uma existente.
2. Clique em **Compartilhar** e adicione o **e-mail da conta de serviço** (ex.: `leitor-hash-sheets@leitor-hash-otc-488317.iam.gserviceaccount.com`) com permissão **Editor**.
3. Copie o **ID da planilha** na URL: `https://docs.google.com/spreadsheets/d/ESTE_É_O_ID/edit`
4. No servidor (ou no `.env`), defina a variável:
   - **Name:** `GOOGLE_SHEETS_SPREADSHEET_ID`
   - **Value:** o ID copiado (só o ID, sem barras nem espaços).
5. Reinicie o servidor. Ao clicar em **Abrir no Google Sheets**, o sistema **não criará** uma planilha nova; vai **escrever na sua planilha** em uma nova aba (ex.: `Relatório_2026_02_23`). Você abre o link da sua planilha e vê o relatório na nova aba.
