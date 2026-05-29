-- Remove legacy Skin Art company from billing.
-- Reassign linked rows to Inkaholics when possible, otherwise set NULL.

DO $$
DECLARE
  skin_art_id uuid;
  inkaholics_id uuid;
BEGIN
  SELECT id INTO skin_art_id
  FROM public.companies
  WHERE lower(name) = 'skin art'
     OR lower(legal_name) = 'skin art solutions ltd'
  LIMIT 1;

  IF skin_art_id IS NULL THEN
    RETURN;
  END IF;

  SELECT id INTO inkaholics_id
  FROM public.companies
  WHERE lower(name) = 'inkaholics'
  LIMIT 1;

  IF inkaholics_id IS NOT NULL THEN
    UPDATE public.bookings
    SET company_id = inkaholics_id
    WHERE company_id = skin_art_id;

    UPDATE public.invoices
    SET company_id = inkaholics_id
    WHERE company_id = skin_art_id;
  ELSE
    UPDATE public.bookings
    SET company_id = NULL
    WHERE company_id = skin_art_id;

    UPDATE public.invoices
    SET company_id = NULL
    WHERE company_id = skin_art_id;
  END IF;

  DELETE FROM public.companies
  WHERE id = skin_art_id;
END $$;

