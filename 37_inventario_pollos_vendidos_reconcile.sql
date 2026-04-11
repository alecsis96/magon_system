-- Reconciliacion de pollos_vendidos con el total real por piezas vendidas.
-- Idempotente: solo actualiza filas donde exista diferencia.

update public.inventario_diario
set pollos_vendidos =
  coalesce(ventas_alas, 0)
  + coalesce(ventas_piernas, 0)
  + coalesce(ventas_muslos, 0)
  + coalesce(ventas_pechugas_g, 0)
  + coalesce(ventas_pechugas_c, 0)
where coalesce(pollos_vendidos, 0) <>
  coalesce(ventas_alas, 0)
  + coalesce(ventas_piernas, 0)
  + coalesce(ventas_muslos, 0)
  + coalesce(ventas_pechugas_g, 0)
  + coalesce(ventas_pechugas_c, 0);
