alter table if exists pedidos
drop constraint if exists pedidos_cliente_id_fkey;

alter table if exists pedidos
add constraint pedidos_cliente_id_fkey
foreign key (cliente_id)
references clientes (id)
on delete cascade;
