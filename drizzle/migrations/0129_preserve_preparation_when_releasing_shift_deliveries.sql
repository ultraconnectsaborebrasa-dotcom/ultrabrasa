DO $$ DECLARE definition text; BEGIN
 SELECT pg_get_functiondef('public.guard_shift_exit_deliveries()'::regprocedure) INTO definition;
 IF position('position=0,status=''Pronto para entrega'',departed_at=NULL' IN definition)=0 THEN RAISE EXCEPTION 'Unexpected shift closure definition'; END IF;
 definition=replace(definition,'position=0,status=''Pronto para entrega'',departed_at=NULL','position=0,status=CASE WHEN d.status=''Em rota'' THEN ''Pronto para entrega'' ELSE d.status END,departed_at=NULL');
 EXECUTE definition;
END $$;