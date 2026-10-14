# SQL Atlas

Site estático para explorar e editar arquivos SQL em três vistas: diagrama de entidades, grade de dados e código. HTML, CSS e JavaScript ES modules, sem dependências de produção e sem build.

## Executar

Requer Node.js 20 ou superior.

```powershell
cd C:\Users\Casa\Documents\ChatGPT\TCC\sql-studio
npm start
```

Abra http://127.0.0.1:4173. `npm test` executa os testes do analisador e das edições. `npm run check` verifica a sintaxe. Qualquer servidor HTTP pode servir `dist/`; não abra index.html diretamente porque módulos e Web Workers dependem de HTTP.

## Uso

- Importar um `.sql` UTF-8 de até 5 MB ou arrastar o arquivo para a página.
- Selecionar tabelas no explorador ou no diagrama para editar tipos, chave primária e nulabilidade.
- Criar tabelas, colunas e chaves estrangeiras pelos formulários. Renomear tabelas/colunas e revisar dependências no código.
- Arrastar entidades, mover a área com o mouse, usar zoom e enquadramento.
- Na grade, clicar em um valor para editar o literal SQL do `INSERT` correspondente.
- Editar SQL com sincronização após 450 ms; Ctrl+Enter também atualiza. Usar desfazer/refazer e exportar para salvar.

## Consistência e desempenho

O SQL original é a fonte de verdade. O analisador guarda offsets dos tokens, colunas e valores; alterações visuais aplicam patches aos trechos relevantes, preservando comandos e comentários fora desses trechos. Toda alteração visual é analisada antes de permanecer no documento. Erros mantêm o último modelo válido e pausam as ações visuais.

A análise roda em Web Worker, com descarte de respostas antigas durante digitação rápida. Há fallback para análise na thread principal caso Worker seja indisponível. A grade rende 50 linhas por página e limita a prévia a 20.000 registros por tabela. O diagrama rende até 150 entidades, mais a selecionada. O histórico guarda até 30 documentos; tabelas e colunas com dependências exigem edição no código para remoção.

## Compatibilidade e limites

Suporta a estrutura comum de `CREATE TABLE`, identificadores entre aspas duplas, crases ou colchetes, schemas qualificados, tipos parametrizados, PK/FK simples e compostas, `ALTER TABLE ADD` de chaves, e `INSERT INTO ... VALUES` com listas opcionais de colunas. Nomes são comparados sem diferenciar maiúsculas/minúsculas; identificadores distintos apenas por caixa não são suportados. Literais aceitos na edição de células: texto com aspas simples e escapes `''`, números, TRUE/FALSE e NULL.

Este é um **analisador estrutural limitado**, não um servidor de banco de dados nem validador integral dos dialetos SQL. Não executa comandos, consultas, triggers, views, UPDATE, DELETE, COPY ou alterações de colunas via ALTER. Esses comandos ficam no código e geram avisos. A grade é uma prévia dos VALUES do arquivo, não o resultado de sua execução: defaults omitidos, conflitos, expressões, conversões de tipo e regras de integridade não são avaliados. Recursos específicos de PostgreSQL, MySQL e SQL Server podem exigir ajustes pelo editor ou um parser de dialeto dedicado.

Adicionar/remover colunas em tabelas com INSERTs é feito pelo código, para ajustar também os valores. A edição visual não valida dados contra novos tipos, chaves ou nulabilidade; valide o arquivo no banco de destino antes de executá-lo. Estruturas sem suporte permanecem no arquivo; sintaxe incompleta dos comandos reconhecidos pausa a edição visual.

Arquivos ficam somente na memória da aba, sem envio ao servidor, conexão a banco ou armazenamento remoto. Recarregar descarta alterações: exporte para salvar. Posições dos nós são apenas apresentação e não integram o SQL. O próprio site publicado exige autenticação privada da plataforma, mas o editor não transmite os SQLs importados.

## Organização

- `dist/index.html`, `styles.css`, `app.js`: interface e controle de estado.
- `dist/sql-engine.js`: tokenização, modelo estrutural e patches sem execução de SQL.
- `dist/worker.js`: análise fora da thread da interface.
- `dist/sample.js`: exemplo de loja com seis tabelas.
- `server.mjs`: servidor HTTP local, vinculado a 127.0.0.1.
- `tests/engine.test.mjs`: testes de formatos, edição, preservação e limites.

Referências de sintaxe: [PostgreSQL CREATE TABLE](https://www.postgresql.org/docs/18/sql-createtable.html), [SQLite INSERT](https://www.sqlite.org/lang_insert.html).
