-- Limpieza de residuos decimales en datos historicos de inventario.
-- No altera tipos de columnas ni constraints.

update public.inventario_diario
set
  stock_anterior = round(stock_anterior),
  nuevos_ingresos = round(nuevos_ingresos),
  pollos_vendidos = round(pollos_vendidos),
  ajustes_admin = round(ajustes_admin),
  ventas_alas = round(ventas_alas),
  ventas_piernas = round(ventas_piernas),
  ventas_muslos = round(ventas_muslos),
  ventas_pechugas_g = round(ventas_pechugas_g),
  ventas_pechugas_c = round(ventas_pechugas_c),
  mermas_quemados = round(mermas_quemados),
  mermas_caidos = round(mermas_caidos),
  mermas_alas = round(mermas_alas),
  mermas_piernas = round(mermas_piernas),
  mermas_muslos = round(mermas_muslos),
  mermas_pechugas_g = round(mermas_pechugas_g),
  mermas_pechugas_c = round(mermas_pechugas_c),
  ajustes_alas = round(ajustes_alas),
  ajustes_piernas = round(ajustes_piernas),
  ajustes_muslos = round(ajustes_muslos),
  ajustes_pechugas_g = round(ajustes_pechugas_g),
  ajustes_pechugas_c = round(ajustes_pechugas_c),
  conteo_fisico_cierre = round(conteo_fisico_cierre),
  diferencia_cierre = round(diferencia_cierre)
where
  (stock_anterior is not null and stock_anterior <> trunc(stock_anterior))
  or (nuevos_ingresos is not null and nuevos_ingresos <> trunc(nuevos_ingresos))
  or (pollos_vendidos is not null and pollos_vendidos <> trunc(pollos_vendidos))
  or (ajustes_admin is not null and ajustes_admin <> trunc(ajustes_admin))
  or (ventas_alas is not null and ventas_alas <> trunc(ventas_alas))
  or (ventas_piernas is not null and ventas_piernas <> trunc(ventas_piernas))
  or (ventas_muslos is not null and ventas_muslos <> trunc(ventas_muslos))
  or (ventas_pechugas_g is not null and ventas_pechugas_g <> trunc(ventas_pechugas_g))
  or (ventas_pechugas_c is not null and ventas_pechugas_c <> trunc(ventas_pechugas_c))
  or (mermas_quemados is not null and mermas_quemados <> trunc(mermas_quemados))
  or (mermas_caidos is not null and mermas_caidos <> trunc(mermas_caidos))
  or (mermas_alas is not null and mermas_alas <> trunc(mermas_alas))
  or (mermas_piernas is not null and mermas_piernas <> trunc(mermas_piernas))
  or (mermas_muslos is not null and mermas_muslos <> trunc(mermas_muslos))
  or (mermas_pechugas_g is not null and mermas_pechugas_g <> trunc(mermas_pechugas_g))
  or (mermas_pechugas_c is not null and mermas_pechugas_c <> trunc(mermas_pechugas_c))
  or (ajustes_alas is not null and ajustes_alas <> trunc(ajustes_alas))
  or (ajustes_piernas is not null and ajustes_piernas <> trunc(ajustes_piernas))
  or (ajustes_muslos is not null and ajustes_muslos <> trunc(ajustes_muslos))
  or (ajustes_pechugas_g is not null and ajustes_pechugas_g <> trunc(ajustes_pechugas_g))
  or (ajustes_pechugas_c is not null and ajustes_pechugas_c <> trunc(ajustes_pechugas_c))
  or (conteo_fisico_cierre is not null and conteo_fisico_cierre <> trunc(conteo_fisico_cierre))
  or (diferencia_cierre is not null and diferencia_cierre <> trunc(diferencia_cierre));

update public.inventario_movimientos
set
  cantidad_equivalente = round(cantidad_equivalente),
  cantidad_piezas = round(cantidad_piezas)
where
  (cantidad_equivalente is not null and cantidad_equivalente <> trunc(cantidad_equivalente))
  or (cantidad_piezas is not null and cantidad_piezas <> trunc(cantidad_piezas));
