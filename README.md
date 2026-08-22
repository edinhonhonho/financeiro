# Financeiro

Aplicativo de controle financeiro pessoal (receitas, despesas, cartões de crédito e divisão de gastos entre pessoas), com autenticação e persistência de dados via [Supabase](https://supabase.com).

## Configurar o Supabase

1. Crie um projeto em [supabase.com](https://supabase.com) (ou use um existente).
2. Abra o **SQL Editor** do projeto e rode o script [`supabase/schema.sql`](supabase/schema.sql) inteiro. Ele cria as tabelas, as políticas de RLS (cada usuário só acessa os próprios dados) e a função usada para operações em lote (séries recorrentes, parcelamentos, etc).
3. Em **Project Settings > API**, copie a `Project URL` e a chave `anon`/`publishable`.
4. Em **Authentication > Providers**, confirme que o provedor **Email** está habilitado (é o método de login usado pelo app).

## Rodar localmente

**Pré-requisitos:** Node.js

1. Instale as dependências:
   `npm install`
2. Copie `.env.example` para `.env.local` e preencha `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` com os valores do seu projeto Supabase.
3. Rode o app:
   `npm run dev`
