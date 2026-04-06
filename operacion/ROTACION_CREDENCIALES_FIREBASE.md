# Runbook Operativo: Rotacion y Revocacion de Credenciales Firebase/GCP

## Objetivo
Ejecutar contencion, rotacion y revocacion de credenciales comprometidas en Firebase/GCP de forma segura, trazable y en menos de 60 minutos.

## Alcance
Aplicable a:
- Service Account Keys (JSON) usadas por backend, CI/CD, scripts o integraciones.
- Credenciales asociadas a proyectos Firebase sobre Google Cloud.

No aplica a credenciales de usuarios finales (Auth tokens de cliente).

## Roles minimos
- Incident Commander (IC): coordina el incidente y aprueba cierre.
- Operador GCP: ejecuta cambios en IAM.
- Owner de Aplicacion: actualiza secretos y valida funcionamiento.

## Preparacion (antes de tocar nada)
- Confirmar proyecto afectado (`project_id`) y service account involucrada (`sa-name@project.iam.gserviceaccount.com`).
- Abrir ticket/incidente con hora de inicio.
- Congelar despliegues no urgentes hasta finalizar la rotacion.

---

## 1) Contencion inmediata (0-15 min)

1. Considerar la key comprometida como expuesta publicamente.
2. Detener el uso de la key vieja en donde sea posible:
   - Pausar pipelines que la usen.
   - Deshabilitar jobs/cron que dependan de esa key.
3. Identificar superficie de exposicion:
   - Repositorios, artefactos, logs, tickets, chats, buckets.
4. Eliminar material sensible visible:
   - Borrar el JSON de repositorios/adjuntos.
   - Invalidar enlaces compartidos que la contengan.
5. Si hubo leak en Git, preparar limpieza de historia y rotacion completa (igual se rota aunque se limpie).

**Salida esperada:** uso de key vieja minimizado y alcance del leak identificado.

---

## 2) Rotacion de Service Account Key (Google Cloud Console)

1. Ir a **Google Cloud Console** -> **IAM y administracion** -> **Cuentas de servicio**.
2. Seleccionar la service account afectada.
3. Abrir pestaña **Claves**.
4. Crear nueva key:
   - **Agregar clave** -> **Crear clave nueva** -> **JSON**.
5. Descargar el archivo JSON en entorno seguro temporal.
6. Registrar metadata en el incidente:
   - Service account
   - Key ID nueva
   - Fecha/hora de creacion
   - Operador

**Importante:** no enviar la key por chat/correo. Cargarla directamente al gestor de secretos.

---

## 3) Distribucion segura de la key nueva

1. Cargar la key nueva en el gestor de secretos (ej.: GitHub Actions Secrets, Secret Manager, Vault).
2. Actualizar variables/secretos en todos los entornos impactados:
   - Produccion
   - Staging
   - CI/CD
   - Jobs programados
3. Reiniciar/redeploy de servicios para tomar el secreto nuevo.
4. Validar que no quede referencia al JSON viejo en:
   - Variables de entorno
   - Archivos locales en servidores
   - Configuracion de runners

**Salida esperada:** todos los servicios usan la key nueva.

---

## 4) Revocacion/invalidacion de la key vieja

Ejecutar solo cuando la verificacion basica con key nueva este en verde.

### Opcion A (Consola)
1. Google Cloud Console -> IAM y administracion -> Cuentas de servicio.
2. Service account afectada -> pestaña **Claves**.
3. Ubicar la key vieja por Key ID.
4. **Eliminar** key vieja.

### Opcion B (gcloud)
```bash
gcloud iam service-accounts keys list \
  --iam-account="SA_EMAIL" \
  --project="PROJECT_ID"

gcloud iam service-accounts keys delete "OLD_KEY_ID" \
  --iam-account="SA_EMAIL" \
  --project="PROJECT_ID"
```

Registrar en el incidente:
- Key ID revocada
- Hora de revocacion
- Evidencia (captura o salida de comando)

---

## 5) Verificacion post-rotacion (obligatoria)

### Verificacion tecnica
- Login/autenticacion del servicio principal: OK
- Operaciones Firebase criticas (leer/escribir donde corresponda): OK
- Pipelines CI/CD que usan la credencial: OK
- Jobs/cron automatizados: OK
- Errores 401/403 en logs posteriores a la rotacion: 0 criticos

### Verificacion de seguridad
- No existen keys activas antiguas en la service account.
- Secretos antiguos removidos de gestores y entornos.
- Repositorio escaneado sin secretos expuestos (ver plan de prevencion).

**Criterio de exito:** operacion estable + key vieja eliminada + evidencia documentada.

---

## 6) Checklist de cierre de incidente

- [ ] Incidente creado con timeline completo.
- [ ] Alcance del leak identificado (donde estuvo expuesta la key).
- [ ] Key nueva creada y distribuida a todos los entornos.
- [ ] Servicios reiniciados/redeployados con secreto nuevo.
- [ ] Key vieja revocada/eliminada.
- [ ] Pruebas funcionales criticas en OK.
- [ ] Monitoreo 30-60 min sin errores criticos.
- [ ] Evidencias adjuntas (capturas, logs, comandos, responsables).
- [ ] Lecciones aprendidas documentadas con acciones y owner.

---

## 7) Plan de prevencion (ejecutar hoy)

## 7.1 Git hooks con git-secrets
1. Instalar `git-secrets` en equipos de desarrollo y CI.
2. Configurar hooks pre-commit/pre-push para bloquear patrones de keys/JSON de service accounts.
3. Versionar una configuracion comun del equipo.

## 7.2 Escaneo continuo con TruffleHog
1. Agregar job en CI para escanear cada PR y cada push a ramas protegidas.
2. Falla obligatoria del pipeline ante hallazgos de alta confianza.
3. Escaneo semanal del historial completo del repo.

## 7.3 Revision de PR orientada a secretos
1. Checklist obligatorio en PR:
   - "No se suben credenciales/JSON/key files"
   - "No hay secretos hardcodeados"
2. Requerir al menos 1 revisor tecnico en cambios de infraestructura/auth.
3. Bloquear merge si falla scan de secretos.

## 7.4 Endurecimiento recomendado
- Migrar de claves JSON persistentes a Workload Identity Federation donde sea posible.
- Aplicar minimo privilegio en service accounts (roles estrictamente necesarios).
- Definir politica de rotacion periodica (ej.: cada 90 dias) con recordatorios automatizados.

---

## Anexo rapido (datos a completar en incidente)
- Proyecto GCP/Firebase:
- Service account afectada:
- Key ID vieja:
- Key ID nueva:
- Hora deteccion:
- Hora contencion:
- Hora revocacion:
- Responsable IC:
- Responsable tecnico:
