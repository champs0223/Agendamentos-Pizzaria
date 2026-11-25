# Mascavo Pizzas

Painel web para administrar agendamentos de massas para pizzarias, eventos de buffet, cardápio e satisfação dos clientes.

## Backend PostgreSQL

O projeto inclui um backend Node.js e um esquema PostgreSQL em `db/schema.sql`. As tabelas armazenam sabores do cardápio, agendamentos e seus itens, avaliações e números de pedido diários.

1. Instale Node.js 20.6 ou superior e PostgreSQL. No Garuda/Arch Linux, inicialize o serviço PostgreSQL e crie um usuário e banco locais (execute `initdb` apenas na primeira instalação; nunca apague um diretório de dados existente):

   ```bash
   sudo pacman -S --needed postgresql
   sudo -iu postgres initdb -D /var/lib/postgres/data
   sudo systemctl enable --now postgresql
   sudo -iu postgres createuser --login "$USER"
   sudo -iu postgres createdb --owner="$USER" mascavo
   ```

2. Copie `.env.example` para `.env`; a URL local usa autenticação por socket e o usuário PostgreSQL com o mesmo nome do usuário Linux que inicia o servidor. Gere três tokens distintos com pelo menos 32 caracteres para `ORDERS_BOT_TOKEN`, `SATISFACTION_BOT_TOKEN` e `ADMIN_API_TOKEN` (por exemplo, com `openssl rand -hex 32`). Não compartilhe nem versione o arquivo `.env`.
3. Instale as dependências e inicie o servidor:

   ```bash
   npm install
   npm start
   ```

O servidor executa o esquema SQL ao iniciar e serve o painel e a API na porta definida por `PORT` (8000 por padrão). A inicialização falha claramente se o banco ou as configurações necessárias estiverem indisponíveis. O painel faz login com `ADMIN_API_TOKEN`; o navegador recebe somente uma sessão temporária HTTP-only, nunca o token administrativo.

## API disponível

- `POST /api/v1/agendamentos`: recebe pedidos de massas ou buffet usando `ORDERS_BOT_TOKEN`. Exige `externalId` único por pedido, `type` (`massas` ou `buffet`), cliente, telefone, data e horário ISO, endereço e lista `pizzas`. Os valores são recalculados no servidor; reenvios com o mesmo identificador são idempotentes.
- `POST /api/v1/avaliacoes`: recebe avaliações usando `SATISFACTION_BOT_TOKEN`, com `externalId`, `rating` de 1 a 5 e, opcionalmente, `appointmentId`, `customerName`, `comment` e `createdAt`.
- `GET /api/v1/cardapio`: retorna apenas os sabores disponíveis, para o chatbot consultar.
- `GET /api/v1/admin/agendamentos`, `GET /api/v1/admin/satisfacao` e `GET /api/v1/admin/cardapio`: leitura administrativa protegida pela sessão do painel ou `ADMIN_API_TOKEN`.
- `PUT /api/v1/admin/agendamentos/:id`, `DELETE /api/v1/admin/agendamentos/:id`, `PATCH /api/v1/admin/agendamentos/:id/status` e `PUT /api/v1/admin/cardapio`: alterações administrativas; o painel usa uma sessão HTTP-only.
- `POST /api/v1/admin/session`: troca o token administrativo por uma sessão temporária segura para o painel.
- `GET /api/v1/health`: verifica a conexão com o banco.

Os três tokens são credenciais de servidor para servidor. **Não coloque `ADMIN_API_TOKEN` no JavaScript do navegador.** Use HTTPS na hospedagem pública e forneça os tokens aos bots por configuração segura.

### Formatos dos webhooks

Envie `Authorization: Bearer <token>` e `Content-Type: application/json`. `externalId` deve ser estável e único em cada chatbot para permitir reenvios seguros.

Pedido (`POST /api/v1/agendamentos`):

```json
{
  "externalId": "pedido-123",
  "type": "massas",
  "name": "Pizzaria Exemplo",
  "phone": "11987654321",
  "date": "2026-12-10",
  "time": "18:30",
  "street": "Rua Principal",
  "number": "12",
  "neighborhood": "Centro",
  "pizzas": [
    { "flavor": "Mussarela", "category": "Tradicional", "size": "Grande", "quantity": 2, "unitPrice": 58 }
  ]
}
```

Para buffet, use `"type": "buffet"` e inclua `"people"`; taxas, descontos, sinal e observações são opcionais. Avaliação (`POST /api/v1/avaliacoes`):

```json
{
  "externalId": "avaliacao-123",
  "rating": 5,
  "customerName": "Cliente",
  "comment": "Adorei!",
  "createdAt": "2026-12-10T20:00:00-03:00"
}
```

## Estado da integração

O painel consulta e grava agendamentos, status e cardápio no PostgreSQL. Na primeira execução, carrega o cardápio local já existente ou publica os sabores iniciais. Se encontrar agendamentos/avaliações antigos no `localStorage`, importa-os com proteção contra reenvio e preserva as referências entre avaliações e pedidos.

Os endpoints dos chatbots estão prontos para receber pedidos e avaliações, mas os formatos são uma base provisória e precisam ser conferidos com a documentação da equipe. Para os bots acessarem a API fora do computador local, publique o backend atrás de HTTPS e configure os tokens no ambiente seguro da hospedagem; não exponha o token administrativo no navegador.

## Testes

```bash
npm test
```
