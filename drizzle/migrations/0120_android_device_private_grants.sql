REVOKE ALL ON public.courier_device_pairs,public.courier_android_devices FROM anon,authenticated;
GRANT ALL ON public.courier_device_pairs,public.courier_android_devices TO service_role;
