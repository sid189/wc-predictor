-- Restrict the app to an invited guest list. A Google sign-in only gets a
-- profile (and thus access) if its email is in allowed_emails; everyone else
-- is signed in but profile-less, and the app shows them a "not invited" screen.

create table if not exists public.allowed_emails (
  email      text primary key,
  added_at   timestamptz not null default now()
);

-- Seed the bootstrap admin so they can sign in and invite the others.
insert into public.allowed_emails (email)
values ('sid.s.deshpande@gmail.com')
on conflict (email) do nothing;

alter table public.allowed_emails enable row level security;

-- Only admins can view/manage the guest list (service role bypasses RLS; the
-- signup trigger below is SECURITY DEFINER so it reads the table regardless).
create policy "allowed_emails_admin" on public.allowed_emails
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Gate profile creation on the guest list.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from public.allowed_emails where lower(email) = lower(new.email)
  ) then
    return new;  -- not invited: no profile, no access
  end if;

  insert into public.profiles (id, display_name, avatar_url, is_admin)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name',
             new.raw_user_meta_data->>'name',
             split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'avatar_url',
    new.email = 'sid.s.deshpande@gmail.com'
  )
  on conflict (id) do nothing;
  return new;
end; $$;
