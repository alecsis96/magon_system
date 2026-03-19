# Deploy en Vercel

## Root Directory

Configura el proyecto de Vercel con:

- `Root Directory`: `admin-web`

## Build Settings

- `Framework Preset`: `Vite`
- `Build Command`: `npm run build`
- `Output Directory`: `dist`

## Variables de Entorno

Agrega estas variables en Vercel:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

## Notas

- El archivo `vercel.json` ya incluye rewrite a `index.html` para que la app funcione como SPA.
- Si cambias de proyecto Supabase, actualiza primero las variables y luego redeploy.
