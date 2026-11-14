# Backend da agenda compartilhada

API Node.js para hospedagem serverless, com banco PostgreSQL persistente. As reservas não ficam na memória da função nem no navegador. Os registros do caderno são inseridos uma única vez; uma exclusão não volta após novo deploy.

## Publicar

1. Importe este repositório como projeto **Other**, com **Root Directory vazio**. A pasta `api/` já fica na raiz deste repositório. Sem comando de build ou diretório de saída personalizado.
2. Na hospedagem, conecte um banco PostgreSQL (por exemplo, Neon pelo Marketplace/Storage). Salve a conexão **pooled** na variável secreta `DATABASE_URL`. Use os parâmetros TLS fornecidos pelo serviço.
3. Configure `FRONTEND_ORIGINS` com a origem HTTPS exata do frontend, sem barra no final. Para múltiplas origens, separe por vírgula. Não use `*`.
4. No computador, rode `npm install` e `npm run password`. Crie sua senha de pelo menos 12 caracteres e salve o hash gerado na variável secreta `ADMIN_PASSWORD_HASH`. Não publique sua senha nem sua conexão do banco no Git.
5. Publique. As tabelas e a agenda do caderno são criadas automaticamente no primeiro acesso. `GET /api/health` deve retornar `ok: true` com `storage: postgresql`.
6. No frontend, preencha `window.AGENDA_API_URL` em `config.js` com a URL HTTPS deste backend e publique o frontend. O painel busca atualizações a cada 5 segundos enquanto está aberto.

O envio ao GitHub não cria o banco nem as variáveis de ambiente. Sem `DATABASE_URL`, a API retorna 503, sem simular uma reserva salva.

## Desenvolvimento e testes

Node.js 24. Copie `.env.example` para `.env` e preencha os valores localmente. `npm start` inicia na porta 3001 e `npm test` usa PostgreSQL embutido isolado, sem clientes ou senhas reais. O teste cobre dois clientes independentes, consulta administrativa, concorrência, limite diário, persistência, cancelamento, origem, sessão e senha.

## API

- `GET /api/availability?month=2026-12`: somente horários ocupados, sem nomes.
- `POST /api/bookings`: reserva validada no servidor, com preço e capacidade calculados pelo servidor.
- `POST /api/admin/login`: senha administrativa; retorna sessão de 8 horas.
- `GET /api/admin/bookings`: lista protegida por `Authorization: Bearer TOKEN`.
- `DELETE /api/admin/bookings/ID`: exclusão protegida, incluindo registros do caderno.
- `POST /api/admin/password` e `/api/admin/logout`: troca de senha e encerramento de sessão.

O frontend não tem permissão de acesso direto ao banco. A sessão de login fica em sessionStorage; clientes e reservas ficam exclusivamente no PostgreSQL. Dados antigos gravados em navegadores não são importados automaticamente. O período de atendimento termina em 27/12/2026.
