CREATE OR REPLACE FUNCTION public.exec_sql(query text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result json;
  is_select boolean;
BEGIN
  -- Determine if the query is a SELECT statement (simplistic check)
  is_select := (LOWER(TRIM(query)) LIKE 'select%');

  IF is_select THEN
    EXECUTE 'SELECT json_agg(t) FROM (' || query || ') t' INTO result;
    RETURN COALESCE(result, '[]'::json);
  ELSE
    EXECUTE query;
    RETURN json_build_object('success', true);
  END IF;
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;
