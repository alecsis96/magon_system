# Build Android

## Objetivo recomendado

Para operacion real del repartidor, usa Android instalado como APK.

- `preview`: genera APK para instalar directo
- `development`: genera development build para pruebas mas cercanas a produccion
- `production`: genera `aab` para Play Store

## Paso 1: iniciar sesion en Expo / EAS

```powershell
npx eas login
```

## Paso 2: vincular el proyecto a Expo

Desde `app-repartidor`:

```powershell
npx eas init
```

Esto agregara el `projectId` real de Expo al proyecto.

## Paso 3: generar APK

Desde `app-repartidor`:

```powershell
npx eas build -p android --profile preview
```

Si quieres un build de desarrollo:

```powershell
npx eas build -p android --profile development
```

## Push notifications

Para push real en Android, no dependas de Expo Go.

Necesitas:

1. Tener el proyecto vinculado con `eas init`
2. Configurar credenciales Android push / FCM en Expo
3. Probar la app instalada desde APK o development build

## Instalacion del APK

Cuando termine el build, Expo te dara una URL de descarga.

Descarga el APK en el telefono del repartidor e instalalo manualmente.
