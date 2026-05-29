-- Allow stock requests to include supplier reference links.
alter table public.stock_requests
  add column if not exists supplier_name text,
  add column if not exists supplier_url text;

create table if not exists public.stock_supplier_links (
  id uuid primary key default gen_random_uuid(),
  stock_item_id uuid not null references public.stock_items(id) on delete cascade,
  supplier_name text,
  supplier_url text not null,
  created_by uuid not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists stock_supplier_links_item_url_uniq
  on public.stock_supplier_links(stock_item_id, supplier_url);

create index if not exists stock_supplier_links_item_idx
  on public.stock_supplier_links(stock_item_id);

alter table public.stock_supplier_links enable row level security;

create policy "Staff can view supplier links"
  on public.stock_supplier_links
  for select
  to authenticated
  using (true);

create policy "Staff can create supplier links"
  on public.stock_supplier_links
  for insert
  to authenticated
  with check (auth.uid() = created_by);

create policy "Admins can manage supplier links"
  on public.stock_supplier_links
  for all
  to authenticated
  using (public.has_role(auth.uid(), 'admin'));

drop trigger if exists update_stock_supplier_links_updated_at on public.stock_supplier_links;
create trigger update_stock_supplier_links_updated_at
before update on public.stock_supplier_links
for each row execute function update_updated_at_column();
