begin;

update public.styles
set base_price = least(10000, greatest(0, coalesce(base_price, 0))),
    price_display_min = least(10000, greatest(0, coalesce(price_display_min, base_price, 0))),
    price_display_max = least(10000, greatest(0, coalesce(price_display_max, price_display_min, base_price, 0))),
    duration_min_hours = least(24, greatest(0, coalesce(duration_min_hours, 0))),
    duration_max_hours = least(24, greatest(0, coalesce(duration_max_hours, duration_min_hours, 0))),
    own_material_price_reduction = 0,
    own_material_duration_reduction_minutes = 0;

update public.styles
set price_display_max = greatest(price_display_min, price_display_max),
    duration_max_hours = greatest(duration_min_hours, duration_max_hours);

alter table public.styles drop constraint if exists styles_price_bounds_check;
alter table public.styles add constraint styles_price_bounds_check check (
  base_price between 0 and 10000
  and price_display_min between 0 and 10000
  and price_display_max between price_display_min and 10000
);
alter table public.styles drop constraint if exists styles_duration_bounds_check;
alter table public.styles add constraint styles_duration_bounds_check check (
  duration_min_hours between 0 and 24
  and duration_max_hours between duration_min_hours and 24
);

update public.style_materials set price = least(10000, greatest(0, coalesce(price, 0)));
alter table public.style_materials drop constraint if exists style_materials_price_upper_bound_check;
alter table public.style_materials add constraint style_materials_price_upper_bound_check check (price between 0 and 10000);

update public.salon_products set price = least(10000, greatest(0, coalesce(price, 0)));
alter table public.salon_products drop constraint if exists salon_products_price_bounds_check;
alter table public.salon_products add constraint salon_products_price_bounds_check check (price between 0 and 10000);

update public.stylists set years_experience = least(70, greatest(0, coalesce(years_experience, 0)));
alter table public.stylists drop constraint if exists stylists_years_experience_bounds_check;
alter table public.stylists add constraint stylists_years_experience_bounds_check check (years_experience between 0 and 70);

update public.promo_codes set discount_value = least(10000, greatest(0.01, discount_value));
alter table public.promo_codes drop constraint if exists promo_codes_value_upper_bound_check;
alter table public.promo_codes add constraint promo_codes_value_upper_bound_check check (discount_value between 0.01 and 10000);

create or replace function public.validate_style_numeric_bounds()
returns trigger language plpgsql security invoker set search_path = public as $$
declare option_row jsonb;
begin
  for option_row in
    select value from jsonb_array_elements(coalesce(new.size_options, '[]'::jsonb))
    union all select value from jsonb_array_elements(coalesce(new.length_options, '[]'::jsonb))
    union all select value from jsonb_array_elements(coalesce(new.addons, '[]'::jsonb))
  loop
    if coalesce(nullif(option_row->>'price_add', '')::numeric, 0) not between 0 and 10000 then
      raise exception 'Option prices must be between $0 and $10,000.' using errcode = '23514';
    end if;
  end loop;
  return new;
end $$;

drop trigger if exists styles_validate_numeric_bounds on public.styles;
create trigger styles_validate_numeric_bounds
before insert or update of base_price, price_display_min, price_display_max,
  duration_min_hours, duration_max_hours, size_options, length_options, addons
on public.styles for each row execute function public.validate_style_numeric_bounds();

commit;
