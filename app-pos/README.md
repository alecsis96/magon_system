# Magon POS Wrapper

Wrapper Android para cargar `admin-web` dentro de una `WebView` y exponer
capacidades nativas al POS.

## Objetivo de esta primera base

- Cargar la URL de `admin-web`
- Exponer `window.AndroidPrinter.imprimirTicket(texto)` al frontend web
- Recibir mensajes de `window.ReactNativeWebView.postMessage(...)`
- Dejar aislado el adaptador de impresion para conectarlo despues

## Variables esperadas

- `EXPO_PUBLIC_ADMIN_WEB_URL`: URL publica del `admin-web`

## Comandos

```powershell
npm install
npx expo start
```

Para APK con EAS:

```powershell
npx eas build -p android --profile preview
```

## Siguiente paso tecnico

Implementar el adaptador real de impresion Bluetooth/ESC-POS en:

- `src/printing/print-ticket.ts`

Ese modulo es el unico punto que falta para que el bridge complete el flujo
de impresion del ticket.
