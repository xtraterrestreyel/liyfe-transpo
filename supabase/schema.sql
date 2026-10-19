-- =====================================================================
-- Liyfe Transpo — Supabase database schema
-- Run this whole file once in Supabase: Dashboard > SQL Editor > New query
-- =====================================================================

-- ---------- Customer profiles (one per Google sign-in) ----------
create table if not exists public.profiles (
  id                          uuid primary key references auth.users(id) on delete cascade,
  email                       text,
  full_name                   text,
  date_of_birth               date,
  phone                       text,
  address_line1               text,
  address_line2               text,
  city                        text,
  state                       text default 'IL',
  zip                         text,
  preferred_pharmacy_name     text,
  preferred_pharmacy_address  text,
  pharmacy_notice_ack         boolean not null default false,  -- customer confirmed they told their pharmacy
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

-- ---------- Signed pickup authorizations (customer hires Liyfe Transpo as their agent) ----------
create table if not exists public.authorizations (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references public.profiles(id) on delete cascade,
  signature_name     text not null,
  agreement_version  text not null,
  agreement_sha256   text not null,       -- fingerprint of the exact text the customer signed
  signed_at          timestamptz not null default now(),
  ip_address         text,
  user_agent         text,
  revoked_at         timestamptz
);
create index if not exists authorizations_user_idx on public.authorizations(user_id);

-- ---------- Delivery orders ----------
create table if not exists public.orders (
  id                     uuid primary key default gen_random_uuid(),
  order_number           bigint generated always as identity (start with 1001),
  user_id                uuid not null references public.profiles(id) on delete cascade,
  authorization_id       uuid references public.authorizations(id),
  pharmacy_name          text not null,
  pharmacy_address       text not null,
  pharmacy_phone         text,
  rx_numbers             text,
  rx_ready               boolean not null default false,
  controlled_substance   boolean not null default false,
  copay_option           text not null check (copay_option in ('no_copay','prepaid','need_help')),
  delivery_address       text not null,
  delivery_instructions  text,
  miles                  numeric(6,1) not null,
  tiers                  int not null,
  delivery_fee_cents     int not null,
  service_fee_cents      int not null,
  total_cents            int not null,
  status                 text not null default 'pending_payment'
                         check (status in ('pending_payment','paid','pharmacy_confirmed','picked_up',
                                           'out_for_delivery','delivered','issue','canceled')),
  stripe_session_id      text,
  stripe_payment_intent  text,
  staff_notes            text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  paid_at                timestamptz,
  delivered_at           timestamptz
);
create index if not exists orders_user_idx   on public.orders(user_id);
create index if not exists orders_status_idx on public.orders(status);

-- ---------- Pharmacies that know Liyfe Transpo (shown publicly only when listed = true) ----------
create table if not exists public.pharmacies (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  address     text,
  phone       text,
  listed      boolean not null default false,   -- only list a pharmacy after it agrees to be listed
  notes       text,
  created_at  timestamptz not null default now()
);

-- ---------- Messages from pharmacies via the "For Pharmacies" page ----------
create table if not exists public.pharmacy_inquiries (
  id             uuid primary key default gen_random_uuid(),
  pharmacy_name  text not null,
  contact_name   text,
  email          text,
  phone          text,
  message        text,
  created_at     timestamptz not null default now()
);

-- ---------- Keep updated_at current ----------
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

drop trigger if exists orders_touch on public.orders;
create trigger orders_touch before update on public.orders
  for each row execute function public.touch_updated_at();

-- ---------- Create a profile row automatically when someone signs in the first time ----------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- =====================================================================
-- Row Level Security: customers can only ever see their own data.
-- The Render backend uses the service-role key and does everything else.
-- =====================================================================
alter table public.profiles            enable row level security;
alter table public.authorizations      enable row level security;
alter table public.orders              enable row level security;
alter table public.pharmacies          enable row level security;
alter table public.pharmacy_inquiries  enable row level security;

drop policy if exists "profiles: read own"   on public.profiles;
drop policy if exists "profiles: insert own" on public.profiles;
drop policy if exists "profiles: update own" on public.profiles;
create policy "profiles: read own"   on public.profiles for select using (auth.uid() = id);
create policy "profiles: insert own" on public.profiles for insert with check (auth.uid() = id);
create policy "profiles: update own" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "authorizations: read own" on public.authorizations;
create policy "authorizations: read own" on public.authorizations for select using (auth.uid() = user_id);
-- (signing and revoking go through the backend so the time and IP are recorded reliably)

drop policy if exists "orders: read own" on public.orders;
create policy "orders: read own" on public.orders for select using (auth.uid() = user_id);
-- (orders are created through the backend so prices can't be tampered with)

drop policy if exists "pharmacies: public listed" on public.pharmacies;
create policy "pharmacies: public listed" on public.pharmacies for select using (listed = true);

-- pharmacy_inquiries: no public policies (backend only)
