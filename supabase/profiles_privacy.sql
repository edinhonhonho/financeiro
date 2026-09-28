-- ============================================================================
-- Financeiro — privacidade dos perfis
-- Rode no SQL Editor do Supabase. Idempotente.
--
-- Antes: qualquer usuário logado lia o perfil completo de todos (inclusive o
-- e-mail). Agora:
--  • cada um lê só o próprio perfil completo;
--  • para achar/vincular outras pessoas existe a view public_profiles, que
--    mostra apenas nome, apelido, usuário e foto — nunca o e-mail.
-- ============================================================================

-- 1. Perfil completo: só o dono
drop policy if exists "profiles_read_all" on public.profiles;
drop policy if exists "profiles_read_own" on public.profiles;
create policy "profiles_read_own" on public.profiles
  for select using (id = auth.uid());

-- 2. Diretório público (sem e-mail), só para usuários logados.
--    A view roda com as permissões do dono (padrão), então enxerga todos os
--    perfis, mas expõe apenas as colunas abaixo.
create or replace view public.public_profiles as
  select id, nickname, "firstName", "lastName", "username", "photoURL"
  from public.profiles;

revoke all on public.public_profiles from anon, public;
grant select on public.public_profiles to authenticated;

-- 3. Visitantes sem login não leem nada da tabela de perfis.
revoke select on public.profiles from anon;

-- Faz a API do Supabase enxergar a view na hora.
notify pgrst, 'reload schema';
