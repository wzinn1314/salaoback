# Jaiane Neves - Backend

API de agendamento e autenticacao administrativa. Frontend separado em https://github.com/wzinn1314/salaofront.

## Desenvolvimento local

Requer Node.js 24. Execute npm start. API em http://localhost:5500/api, verificacao em /api/health. Sem dependencias externas.

SQLite e credenciais locais ficam em .local/, fora do Git. Uma instalacao nova gera a senha inicial no terminal. O banco e a senha do computador original nao sao incluidos.

npm test verifica autenticacao, privacidade, horarios, conflitos, capacidade e cancelamento.

## Producao

worker.mjs e um Cloudflare Worker. Configure D1 com binding DB, aplique as migracoes de drizzle/ e configure ADMIN_BOOTSTRAP_HASH como segredo no formato salt:hash gerado por passwordHash. A configuracao de hospedagem ainda precisa dos identificadores da sua conta.

dev-server.mjs e exclusivo para desenvolvimento: escuta apenas 127.0.0.1 e adapta cookies para HTTP. Nao e servidor de producao para Render ou Vercel. Nao use SQLite efemero como banco de funcoes serverless.

## Frontend

As paginas chamam /api/* no dominio do frontend. Apos hospedar esta API, configure um proxy de mesma origem na Vercel que encaminhe requisicoes e cookies. O backend valida Origin: o proxy deve validar a origem do frontend antes de encaminhar a origem do backend. O envio para GitHub nao publica a API automaticamente.
