# Backend da agenda — Firebase Realtime Database

API Node.js para Vercel. Salva reservas online em `salon/bookings` no Realtime Database. A profissional consulta a mesma agenda em qualquer aparelho. PostgreSQL e `DATABASE_URL` não são utilizados.

Banco: `https://salao-884a5-default-rtdb.firebaseio.com`

Frontend: `https://agendamentos-amber-xi.vercel.app`

Backend: `https://salaoback.vercel.app`

## Configuração necessária na Vercel

No projeto **salaoback**, abra Settings → Environment Variables e configure:

- `FIREBASE_DATABASE_URL`: `https://salao-884a5-default-rtdb.firebaseio.com` (já é o padrão no código).
- `FIREBASE_SERVICE_ACCOUNT_JSON`: conteúdo completo do JSON da conta de serviço, exclusivamente como variável secreta do backend.
- `FRONTEND_ORIGINS`: `https://agendamentos-amber-xi.vercel.app` (sem barra final; já é o padrão).
- `ADMIN_PASSWORD`: senha administrativa escolhida por você, de 12 a 128 caracteres, exclusivamente nas variáveis secretas do backend. Somente o hash será gravado no banco. Como alternativa, use `ADMIN_PASSWORD_HASH` gerado com `npm run password`.

Para obter a credencial Firebase: Console Firebase → projeto **salao-884a5** → Configurações do projeto → Contas de serviço → Gerar nova chave privada. Guarde esse JSON em local seguro e preencha a variável secreta da Vercel. Não envie o arquivo ao GitHub, ao frontend ou ao chat. Depois de configurar as variáveis, faça um novo deploy.

Em Realtime Database → Regras, publique o conteúdo de `database.rules.json`: leitura e escrita diretas bloqueadas. O backend usa Firebase Admin autenticado; não é necessário deixar o banco público.

`GET /api/health` retorna `ok: true` e `storage: firebase-realtime-database` quando a credencial estiver funcionando. Sem credencial, a API retorna 503 e não confirma reservas falsas.

## Dados

- `salon/bookings`: nome, telefone, serviço, preço, data, horário e confirmação.
- `salon/sessions`: hashes de sessões administrativas com expiração.
- `salon/password_hash`: hash da senha, nunca a senha em texto.
- `salon/rates`: contadores de limite de requisições.

Os registros do caderno são inseridos uma única vez. Excluir uma reserva não a recria no deploy seguinte. Transações Firebase protegem o limite de dois atendimentos e impedem duas reservas na mesma vaga. A API pública retorna somente disponibilidade; nomes e telefones exigem sessão administrativa.

## Desenvolvimento e testes

Node.js 24. `npm install`; copie `.env.example` para `.env` e configure os valores localmente. `npm start` inicia a API local na porta 3001.

Para testes, inicie o emulador Realtime Database em `127.0.0.1:9000` usando um projeto de demonstração `demo-salao`, configure `FIREBASE_DATABASE_EMULATOR_HOST=127.0.0.1:9000` e execute `npm test`. O teste se recusa a usar um host de produção. Não configure a variável de emulador na Vercel.

O frontend usa `config.js` com a URL pública deste backend e atualiza a administração a cada 5 segundos. Dados antigos salvos em navegadores não são importados automaticamente. O atendimento termina em 27/12/2026.
