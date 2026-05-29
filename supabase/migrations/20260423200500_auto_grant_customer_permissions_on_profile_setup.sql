-- Automatically grant customer portal permissions when customer profile setup is completed.

create or replace function public.grant_customer_portal_permissions(_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_permissions (user_id, feature, granted)
  values
    (_user_id, 'my_bookings', true),
    (_user_id, 'customer_consent', true)
  on conflict (user_id, feature)
  do update set granted = true;
end;
$$;

create or replace function public.handle_customer_profile_permission_grants()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(new.customer_profile_completed, false) then
    perform public.grant_customer_portal_permissions(new.user_id);
  end if;
  return new;
end;
$$;

drop trigger if exists on_customer_profile_completed_grants on public.profiles;
create trigger on_customer_profile_completed_grants
after insert or update of customer_profile_completed on public.profiles
for each row
when (coalesce(new.customer_profile_completed, false) = true)
execute function public.handle_customer_profile_permission_grants();

-- Backfill users who already completed profile setup.
with completed_customers as (
  select p.user_id
  from public.profiles p
  where coalesce(p.customer_profile_completed, false) = true
)
insert into public.user_permissions (user_id, feature, granted)
select cc.user_id, f.feature, true
from completed_customers cc
cross join (values ('my_bookings'::text), ('customer_consent'::text)) as f(feature)
on conflict (user_id, feature)
do update set granted = true;
