-- Seed de dados de teste para o Supabase LOCAL (Docker).
-- NÃO usar em produção — cria um usuário admin com senha conhecida.
-- Aplicado por scripts/local-db-reset.sh, depois das migrations.

-- Usuário admin do painel web (Supabase Auth por e-mail/senha)
do $$
begin
  if not exists (select 1 from auth.users where email = 'admin@local.test') then
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, last_sign_in_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, email_change, email_change_token_new, recovery_token
    ) values (
      '00000000-0000-0000-0000-000000000000',
      gen_random_uuid(),
      'authenticated',
      'authenticated',
      'admin@local.test',
      crypt('admin123', gen_salt('bf')),
      now(), now(),
      '{"provider":"email","providers":["email"]}',
      '{"full_name":"Admin Local"}',
      now(), now(),
      '', '', '', ''
    );

    insert into auth.identities (
      id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
    )
    select
      gen_random_uuid(),
      u.id::text,
      u.id,
      jsonb_build_object('sub', u.id::text, 'email', u.email),
      'email',
      now(), now(), now()
    from auth.users u
    where u.email = 'admin@local.test';
  end if;
end $$;

-- O trigger on_auth_user_created cria o profile com role='user' por padrão;
-- promove pra admin (mesmo padrão usado em produção, ver 20250226_configurar_admin_mateus.sql).
update public.profiles set role = 'admin' where email = 'admin@local.test';

-- Nota: os logins de equipe (CNT 01, MNT 01, etc., senha "Teccel2025") já vêm
-- seedados pela própria migration 20250211_sistema_login_por_equipe.sql — não
-- precisa duplicar aqui.
