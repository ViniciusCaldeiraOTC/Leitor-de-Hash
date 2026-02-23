# Validação OTC – Hashes

Sistema em Node.js para validação automática de hashes de operações OTC (USDT/USDC nas redes TRC20 e ERC20).

## Funcionalidades

- Leitura de planilha Excel com colunas **Cliente**, **Valor ME**, **Hash** (opcional: **REDE**, **Moeda**).
- Identificação de hashes únicos e detecção de **duplicidade** (mesmo hash para clientes diferentes).
- Detecção de **Rede/Moeda diferentes para o mesmo hash** (várias linhas com o mesmo hash devem ter REDE e Moeda idênticos).
- Identificação de **registros sem hash** (linhas com cliente/valor preenchidos e hash vazio).
- Consulta automática às blockchains:
  - **TRC20**: API pública [TronScan](https://apilist.tronscanapi.com/api/transaction-info?hash=HASH).
  - **ERC20**: API [Etherscan](https://api.etherscan.io/api) (requer API key).
- Validação do valor total da planilha versus valor na blockchain; sugestão de **ajuste na planilha** (Rede/Moeda) quando o valor confere mas as colunas divergem.
- **Conferência de carteiras**: quando configurado, valida se o **destino** (quem recebe) na blockchain está entre as carteiras cadastradas do cliente (pasta `carteiras-clientes/` ou arquivo legado `carteiras-clientes.json`).
- Geração de `relatorio_hash.csv`, listagem de inconsistências no terminal e log em `execucao.log`.
- **Interface web (React)** para envio da planilha, barra de progresso, tabela de resultados, inconsistências com cópia de hash e marcação de itens como corrigidos, e download do CSV.

## Requisitos

- Node.js 18+
- Planilha Excel (`.xlsx`) com pelo menos as colunas: **Cliente**, **Valor ME**, **Hash**.

## Instalação

1. Clone ou copie o projeto e entre na pasta:

```bash
cd "Leitor de Hash"
```

2. Instale as dependências:

```bash
npm install
```

3. Configure o ambiente:

- Copie o arquivo de exemplo e edite com sua chave do Etherscan:

```bash
copy .env.example .env
```

- Abra `.env` e defina:

```
ETHERSCAN_API_KEY=sua_chave_etherscan
```

Para obter a API key: [Etherscan – API Keys](https://etherscan.io/apis).

- (Opcional) Defina o caminho da planilha no `.env`:

```
PLANILHA_PATH=C:\caminho\para\sua\planilha.xlsx
```

## Uso

### Interface web (React)

1. Instale as dependências do frontend (uma vez):

```bash
cd frontend
npm install
cd ..
```

2. Inicie o servidor da API (em um terminal):

```bash
npm run server
```

3. Em outro terminal, inicie o frontend:

```bash
npm run frontend
```

4. Abra no navegador: **http://localhost:5173**. Arraste ou selecione a planilha, clique em **Validar planilha** e veja os resultados. Use **Baixar relatório CSV** para o arquivo gerado.

Para produção: gere o build do frontend (`npm run build:frontend`), depois rode o servidor com `NODE_ENV=production node server.js` — a API servirá a interface em `http://localhost:3001`.

### Executar com planilha padrão (CLI)

Se você configurou `PLANILHA_PATH` no `.env` ou colocou um arquivo `planilha.xlsx` na pasta do projeto:

```bash
npm start
```

ou:

```bash
node index.js
```

### Executar informando a planilha na linha de comando

```bash
node index.js --planilha="C:\pasta\operacoes.xlsx"
```

No PowerShell:

```powershell
node index.js --planilha="C:\pasta\operacoes.xlsx"
```

## Formato da planilha

**Mínimo (importação simples):**

| Cliente | Valor ME | Hash |
|--------|----------|------|
| João   | 24650    | 1a703760d0982d5e... |
| Maria  | 1000     | 1a703760d0982d5e... |

- **Cliente**: identificador do cliente.
- **Valor ME**: valor em USDT ou USDC (número; use ponto ou vírgula como decimal).
- **Hash**: hash da transação na blockchain. O prefixo **0x** é convenção da ERC20 (Ethereum); na TRC20 (Tron) o hash costuma vir sem 0x. O sistema aceita os dois formatos e normaliza nas consultas (TronScan sem 0x, Etherscan com 0x).

**Recomendado:** colunas **REDE** (TRC20 ou ERC20) e **Moeda** (Tether/USDT ou USDC) para priorizar a rede na consulta e permitir sugestões de ajuste.

### Testar as APIs (diagnóstico)

Para verificar se um hash é encontrado na TronScan ou Etherscan sem rodar a validação completa:

```bash
node scripts/test-apis.js
node scripts/test-apis.js <hash>
npm run test:apis
```

O script exibe a URL chamada, o status HTTP e um resumo da resposta de cada API.

Quando o mesmo hash aparece em várias linhas, o sistema **soma** o Valor ME da planilha e compara com o valor total da transferência na blockchain.  
Se o mesmo hash estiver associado a **clientes diferentes**, o status **DUPLICIDADE** é marcado para ficar no radar.

## Status de validação

| Status                      | Significado |
|-----------------------------|-------------|
| `OK`                        | Valor da planilha confere com a blockchain. |
| `Ajuste` (CORRECAO_PLANILHA) | Valor confere; Rede ou Moeda na planilha devem ser corrigidos. |
| `Divergência` (DIVERGENCIA_VALOR) | Valor total na planilha difere do valor na blockchain. |
| `Divergência` (DIVERGENCIA_REDE_MOEDA) | Mesmo hash em várias linhas com Rede/Moeda diferentes. |
| `HASH_NAO_ENCONTRADO`      | Hash não encontrado na blockchain (ou erro na consulta). |
| `DUPLICIDADE`               | Mesmo hash utilizado para mais de um cliente. |
| `CARTEIRA_DESTINO_NAO_CONFERE` | Destino na blockchain não está entre as carteiras cadastradas do(s) cliente(s) da planilha (quem recebe). |

## Carteiras dos clientes

As carteiras dos clientes **persistem em arquivos JSON** na pasta `carteiras-clientes/` (um arquivo por cliente) ou no arquivo legado `carteiras-clientes.json`. Não precisam estar na planilha.

- **Pasta `carteiras-clientes/`** – Um arquivo `.json` por cliente, com formato `{ "nome": "NOME DO CLIENTE", "carteiras": ["T...", "0x..."] }`. O nome deve coincidir com o da planilha.
- **Arquivo legado `carteiras-clientes.json`** – Objeto cuja chave é o **nome do cliente** e o valor é um **array de endereços** (TRC20 com `T` ou ERC20 com `0x`). Um cliente pode ter várias carteiras.

Se houver clientes cadastrados, a validação **confere** para cada hash se o **destino** (quem recebe) na blockchain está entre as carteiras do(s) cliente(s) da planilha. Endereços inválidos (ex.: "ETHERSCON") são ignorados ao carregar.

## Arquivos gerados

- **`relatorio_hash.csv`** – Uma linha por hash com: hash, clientes, rede, moeda, valor_total_planilha, valor_blockchain, status_validacao, motivo_erro, orientacao_correcao, endereco_remetente, endereco_destino, carteira_destino_ok, data_consulta.
- **`execucao.log`** – Log com data/hora de cada execução (append).

## Estrutura do código

- `config.js` – Caminho da planilha e API key (via `.env` e `--planilha`).
- `planilha.js` – `carregarPlanilha()`, `extrairHashesUnicos()`.
- `blockchain.js` – `consultarBlockchain()` (TronScan + Etherscan).
- `validacao.js` – `validarValores()` (OK, DIVERGENCIA_VALOR, HASH_NAO_ENCONTRADO, DUPLICIDADE).
- `relatorio.js` – `gerarRelatorio()`, `listarInconsistencias()`.
- `logger.js` – Log em arquivo e console.
- `runValidation.js` – Pipeline de validação reutilizado pela CLI e pela API.
- `index.js` – CLI: planilha → validação → relatório e log.
- `server.js` – API Express (upload, validação, download do CSV).
- `frontend/` – Aplicação React (Vite): upload, tabela de resultados, inconsistências.

## Dependências

- **axios** – Requisições HTTP às APIs.
- **sqlite3** – Banco de dados.
- **exceljs** – Leitura da planilha Excel.
- **express**, **cors**, **multer** – API e upload de arquivos.
- **dotenv** – Variáveis de ambiente (`.env`).
