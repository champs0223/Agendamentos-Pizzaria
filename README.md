# Mascavo Pizzas

Painel web para administrar agendamentos de massas para pizzarias, eventos de buffet, cardápio e satisfação dos clientes.

## Executar localmente

O projeto ainda é uma aplicação estática: os pedidos, o cardápio e as avaliações ficam no `localStorage` do navegador. Para abrir a pasta com um servidor local:

```bash
python3 -m http.server 8000
```

Acesse `http://localhost:8000`. Os dados ficam somente nesse navegador e não são sincronizados entre dispositivos.

## Dados dos agendamentos

Os registros novos usam `type: "massas"` ou `type: "buffet"` e incluem data e horário do compromisso. Registros antigos com `type: "presencial"` são lidos como `massas`; seus dados e números de pedido são preservados.

## Preparação para os chatbots

As APIs ainda não estão conectadas. A camada atual mantém o painel funcional localmente e define um formato de integração recomendado para um backend:

- `POST /api/v1/agendamentos`: recebe solicitações dos dois chatbots de pedidos. O campo `type` deve ser `massas` ou `buffet`; os demais campos podem seguir o modelo de agendamento já usado pelo painel (`name`, `phone`, `date`, `time`, `street`, `number`, `neighborhood`, `complement`, `reference`, `pizzas`, `total`, `notes`).
- `POST /api/v1/avaliacoes`: recebe `appointmentId`, `customerName`, `rating` (inteiro de 1 a 5), `comment`, `source` e `createdAt`.
- `GET /api/v1/dashboard/satisfacao`: fornece avaliações agregadas ou a lista para o dashboard.

O módulo `App.Satisfacao` já normaliza e disponibiliza avaliações ao dashboard. Para ligar os endpoints, o próximo passo é adicionar o backend e substituir as leituras/gravações locais por chamadas autenticadas à API.

### Persistência e segurança

Para produção, use um backend com banco de dados (por exemplo, PostgreSQL) para as tabelas de agendamentos, itens do pedido e avaliações; associe avaliações a agendamentos por ID e use um identificador externo para evitar duplicações em reenvios do chatbot. O backend deve validar os dados e proteger os endpoints. Chaves e tokens dos chatbots devem ficar apenas no servidor — nunca no JavaScript entregue ao navegador.
