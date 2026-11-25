CREATE TABLE IF NOT EXISTS menu_items (
  id text PRIMARY KEY,
  name varchar(100) NOT NULL,
  category varchar(60) NOT NULL DEFAULT 'Tradicional',
  prices jsonb NOT NULL,
  available boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT menu_prices_are_object CHECK (jsonb_typeof(prices) = 'object')
);

CREATE TABLE IF NOT EXISTS appointments (
  id uuid PRIMARY KEY,
  external_id varchar(120) NOT NULL,
  source varchar(60) NOT NULL,
  type varchar(10) NOT NULL CHECK (type IN ('massas', 'buffet')),
  name varchar(120) NOT NULL,
  phone varchar(30) NOT NULL,
  appointment_date date NOT NULL,
  appointment_time time NOT NULL,
  street varchar(150) NOT NULL,
  street_number varchar(20) NOT NULL,
  neighborhood varchar(100) NOT NULL,
  complement varchar(100) NOT NULL DEFAULT '',
  reference_point varchar(150) NOT NULL DEFAULT '',
  people integer,
  status varchar(30) NOT NULL DEFAULT 'Agendado'
    CHECK (status IN ('Agendado', 'Recebido', 'Em preparo', 'Saiu para entrega', 'Entregue', 'Cancelado')),
  payment_form varchar(30) NOT NULL DEFAULT 'Pendente'
    CHECK (payment_form IN ('Dinheiro', 'Pix', 'Cartão', 'Pendente')),
  delivery_fee numeric(12, 2) NOT NULL DEFAULT 0 CHECK (delivery_fee >= 0),
  discount_type varchar(10) NOT NULL DEFAULT 'amount' CHECK (discount_type IN ('amount', 'percent')),
  discount_value numeric(12, 2) NOT NULL DEFAULT 0 CHECK (discount_value >= 0),
  discount_amount numeric(12, 2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  subtotal numeric(12, 2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  total numeric(12, 2) NOT NULL DEFAULT 0 CHECK (total >= 0),
  deposit numeric(12, 2) NOT NULL DEFAULT 0 CHECK (deposit >= 0),
  eta_minutes integer CHECK (eta_minutes IS NULL OR eta_minutes > 0),
  notes varchar(1000) NOT NULL DEFAULT '',
  order_number integer,
  order_date date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT buffet_people_positive CHECK (people IS NULL OR people > 0),
  CONSTRAINT unique_external_appointment UNIQUE (source, external_id)
);

CREATE INDEX IF NOT EXISTS appointments_by_schedule
  ON appointments (type, appointment_date, appointment_time);
CREATE INDEX IF NOT EXISTS appointments_by_created
  ON appointments (created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS unique_massas_order_number_per_day
  ON appointments (order_date, order_number)
  WHERE type = 'massas' AND order_number IS NOT NULL;

CREATE TABLE IF NOT EXISTS appointment_items (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  appointment_id uuid NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  flavor varchar(100) NOT NULL,
  category varchar(60) NOT NULL DEFAULT 'Personalizado',
  size varchar(20) NOT NULL CHECK (size IN ('Broto', 'Média', 'Grande')),
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_price numeric(12, 2) NOT NULL CHECK (unit_price >= 0),
  menu_id text
);

CREATE INDEX IF NOT EXISTS appointment_items_by_appointment
  ON appointment_items (appointment_id);

CREATE TABLE IF NOT EXISTS feedback (
  id uuid PRIMARY KEY,
  external_id varchar(120) NOT NULL,
  source varchar(60) NOT NULL,
  appointment_id uuid REFERENCES appointments(id) ON DELETE SET NULL,
  customer_name varchar(120) NOT NULL DEFAULT '',
  rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment varchar(2000) NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT unique_external_feedback UNIQUE (source, external_id)
);

CREATE INDEX IF NOT EXISTS feedback_by_created
  ON feedback (created_at DESC);
CREATE INDEX IF NOT EXISTS feedback_by_appointment
  ON feedback (appointment_id);

CREATE TABLE IF NOT EXISTS daily_order_counters (
  order_date date PRIMARY KEY,
  last_number integer NOT NULL CHECK (last_number > 0)
);
