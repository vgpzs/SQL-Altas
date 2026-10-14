export const SAMPLE = `-- SQL Atlas · exemplo de uma loja
-- Edite o código ou selecione uma tabela no diagrama.

CREATE TABLE clientes (
  id INTEGER PRIMARY KEY,
  nome VARCHAR(100) NOT NULL,
  email VARCHAR(150) UNIQUE,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE categorias (
  id INTEGER PRIMARY KEY,
  nome VARCHAR(80) NOT NULL,
  descricao TEXT
);

CREATE TABLE produtos (
  id INTEGER PRIMARY KEY,
  categoria_id INTEGER NOT NULL,
  nome VARCHAR(120) NOT NULL,
  preco DECIMAL(10, 2) NOT NULL,
  estoque INTEGER DEFAULT 0,
  FOREIGN KEY (categoria_id) REFERENCES categorias(id)
);

CREATE TABLE pedidos (
  id INTEGER PRIMARY KEY,
  cliente_id INTEGER NOT NULL,
  data_pedido TIMESTAMP NOT NULL,
  status VARCHAR(30) DEFAULT 'pendente',
  total DECIMAL(10, 2),
  FOREIGN KEY (cliente_id) REFERENCES clientes(id)
);

CREATE TABLE itens_pedido (
  id INTEGER PRIMARY KEY,
  pedido_id INTEGER NOT NULL,
  produto_id INTEGER NOT NULL,
  quantidade INTEGER NOT NULL,
  preco_unitario DECIMAL(10, 2) NOT NULL,
  FOREIGN KEY (pedido_id) REFERENCES pedidos(id),
  FOREIGN KEY (produto_id) REFERENCES produtos(id)
);

CREATE TABLE pagamentos (
  id INTEGER PRIMARY KEY,
  pedido_id INTEGER NOT NULL,
  metodo VARCHAR(30) NOT NULL,
  valor DECIMAL(10, 2) NOT NULL,
  pago_em TIMESTAMP,
  FOREIGN KEY (pedido_id) REFERENCES pedidos(id)
);

INSERT INTO clientes (id, nome, email, criado_em) VALUES
  (1, 'Ana Souza', 'ana@exemplo.com', '2026-09-01 10:00:00'),
  (2, 'Lucas Silva', 'lucas@exemplo.com', '2026-09-03 14:30:00'),
  (3, 'Beatriz Lima', 'bia@exemplo.com', '2026-09-05 09:15:00');
INSERT INTO categorias VALUES (1, 'Tecnologia', 'Acessórios e eletrônicos'), (2, 'Escritório', 'Para sua mesa');
INSERT INTO produtos VALUES (1, 1, 'Teclado mecânico', 289.90, 24), (2, 1, 'Mouse sem fio', 129.90, 48), (3, 2, 'Caderno pontilhado', 39.90, 100);
INSERT INTO pedidos VALUES (1, 1, '2026-09-10 11:20:00', 'concluído', 419.80), (2, 2, '2026-09-12 16:40:00', 'pendente', 39.90);
INSERT INTO itens_pedido VALUES (1, 1, 1, 1, 289.90), (2, 1, 2, 1, 129.90), (3, 2, 3, 1, 39.90);
INSERT INTO pagamentos VALUES (1, 1, 'pix', 419.80, '2026-09-10 11:23:00');
`;
