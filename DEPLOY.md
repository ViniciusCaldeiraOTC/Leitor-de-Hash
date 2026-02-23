# Deploy – Caldeira OTC

Frontend no **Vercel** e backend no **Railway**. Faça o deploy do backend primeiro para ter a URL e configurar o frontend.

---

## 1. Backend no Railway

1. Acesse [railway.app](https://railway.app), crie uma conta ou faça login.
2. **New Project** → **Deploy from GitHub repo** (conecte o repositório do projeto).
3. Railway vai detectar o Node e usar `npm start`. O `package.json` já está com `"start": "node server.js"`.
4. Na aba **Variables** do serviço, adicione as variáveis de ambiente (copie do seu `.env`, **não** commite o `.env`):

   | Variável | Obrigatória | Descrição |
   |----------|-------------|-----------|
   | `ETHERSCAN_API_KEY` | Sim | Chave da API Etherscan (ERC20). |
   | `GOOGLE_SERVICE_ACCOUNT_JSON` | Para Google Sheets | JSON da conta de serviço (relatório e modelo). |
   | `GOOGLE_SHEETS_SPREADSHEET_ID` | Para relatório | ID da planilha onde o **relatório** da análise é enviado. |
   | `GOOGLE_SHEETS_MODELO_SPREADSHEET_ID` | Para modelo | ID da planilha **modelo** (entrada: Cliente, Valor ME, REDE, Moeda, Hash). |

   Para `GOOGLE_SERVICE_ACCOUNT_JSON`: cole o JSON inteiro. No Railway você pode colar como está; se precisar escapar aspas, use o mesmo formato do `.env` (ex.: `"{\"type\":\"service_account\", ...}"`).

5. **Settings** → **Networking** → **Generate Domain**. Anote a URL (ex.: `https://leitor-hash-otc-production.up.railway.app`).  
   Essa será a **URL do backend** para usar no frontend.

6. Confirme que o deploy subiu e teste: `https://SUA-URL-RAILWAY/api/health` deve retornar `{"ok":true,"message":"API Validação OTC"}`.

---

## 2. Frontend no Vercel

1. Acesse [vercel.com](https://vercel.com), crie uma conta ou faça login.
2. **Add New** → **Project** → importe o mesmo repositório.
3. **Root Directory**: deixe em **.** (raiz do repositório). O `vercel.json` na raiz já define:
   - build do frontend (`frontend/dist`)
   - rewrites para SPA (React)
4. **Environment Variables** – adicione:

   | Nome | Valor |
   |------|--------|
   | `VITE_API_URL` | URL do backend no Railway **sem** barra no final (ex.: `https://leitor-hash-otc-production.up.railway.app`) |

   O frontend usa essa URL para chamar `/api/*` em produção.

5. **Deploy**. O Vercel vai rodar `npm install` na raiz e, no build, `cd frontend && npm install && npm run build` e publicar `frontend/dist`.

6. Após o deploy, acesse a URL do projeto (ex.: `https://caldeira-otc.vercel.app`) e teste:
   - Abrir a planilha modelo (Modelo no Google Sheets).
   - Validar uma planilha e, se configurado, abrir o relatório no Google Sheets.

---

## Resumo

| Parte | Onde | URL / Comando |
|-------|------|----------------|
| Backend | Railway | `npm start` → `node server.js`, porta via `PORT` |
| Frontend | Vercel | Build: `frontend/dist`, variável `VITE_API_URL` = URL do Railway |

Nenhuma das duas plataformas usa a outra no deploy: o frontend só precisa da URL do backend nas variáveis de ambiente.
