# Despliegue temporal de Farmear Aura

La primera publicación usa únicamente las direcciones gratuitas de Vercel y Render. No modifica DNS, Cloudflare ni el proyecto actual de `bacalarlegends-ar.com`.

- `https://farmear-aura-azucardefrutas-projects.vercel.app`: torneo público.
- `https://farmear-aura-azucardefrutas-projects.vercel.app/admin`: panel administrativo.
- `https://farmear-aura-azucardefrutas-projects.vercel.app/live`: pantalla pública en vivo.
- `https://farmear-aura-api.onrender.com`: API segura.

## 1. Publicar la API en Render

1. En Render selecciona **New > Blueprint** y conecta `https://github.com/Galery2345/farmiar-aura`.
2. Render detectará `render.yaml` y creará `farmear-aura-api` en Virginia.
3. Cuando lo solicite, agrega `SUPABASE_SECRET_KEY` desde el panel de Supabase. No uses la publishable key y no guardes este secreto en Git.
4. `ADMIN_JWT_SECRET` se genera automáticamente con 256 bits.
5. Espera a que `https://farmear-aura-api.onrender.com/health` responda `{"ok":true}`. Si el nombre ya estuviera ocupado, usa el hostname exacto asignado por Render y actualiza `VITE_API_URL` en Vercel.

El plan inicial es gratuito para evitar cargos durante esta etapa temporal. Antes de un torneo real conviene cambiar a una instancia sin suspensión para evitar que la primera petición tarde en despertar.

## 2. Publicar el frontend en Vercel

1. Importa el mismo repositorio en Vercel con el nombre `farmear-aura`.
2. Configura **Root Directory** como `frontend` y Framework Preset como **Vite**.
3. Build command: `npm run build`. Output directory: `dist`.
4. Agrega en Production estas variables, usando `frontend/.env.production.example` como referencia:

   - `VITE_API_URL=https://farmear-aura-api.onrender.com/api/v1`
   - `VITE_SUPABASE_URL=https://ioelbxhahahjcpmhkotz.supabase.co`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`: la publishable key del proyecto.
   - `VITE_ADMIN_URL`: déjala vacía mientras se use la ruta `/admin`.
   - `VITE_TURNSTILE_SITE_KEY`: puede quedar vacío hasta configurar Turnstile.

La configuración `frontend/vercel.json` conserva las rutas de React al recargar directamente `/admin` o `/live`.

## 3. Ajustes necesarios en Supabase

1. Habilita **Anonymous Sign-Ins** en Authentication.
2. En Auth > URL Configuration establece `https://farmear-aura-azucardefrutas-projects.vercel.app` como Site URL.
3. Si más adelante se usan enlaces de acceso, agrega `https://farmear-aura-azucardefrutas-projects.vercel.app/**` a Redirect URLs.
4. Mantén `SUPABASE_SECRET_KEY` exclusivamente en Render.

## 4. Crear el primer administrador

Después del primer despliegue, abre la consola de Render y ejecuta temporalmente:

```powershell
$env:BOOTSTRAP_ADMIN_USERNAME='tu_usuario'
$env:BOOTSTRAP_ADMIN_PASSWORD='una_contrasena_larga_y_unica'
npm run admin:create --workspace backend
Remove-Item Env:BOOTSTRAP_ADMIN_USERNAME
Remove-Item Env:BOOTSTRAP_ADMIN_PASSWORD
```

No agregues esas dos variables permanentes al servicio.

## 5. Verificación final

- `https://farmear-aura-api.onrender.com/health` devuelve `{"ok":true}`.
- `https://farmear-aura-azucardefrutas-projects.vercel.app` abre el torneo.
- `https://farmear-aura-azucardefrutas-projects.vercel.app/admin` abre el acceso administrativo.
- `https://farmear-aura-azucardefrutas-projects.vercel.app/live` abre la vista de transmisión.
- Un voto aparece una sola vez y actualiza las demás pantallas en tiempo real.
- El panel puede iniciar, pausar, reanudar y finalizar una batalla.

## Dominio propio más adelante

Cuando la plataforma esté validada se pueden agregar `aura.bacalarlegends-ar.com`, `admin-aura.bacalarlegends-ar.com` y `api-aura.bacalarlegends-ar.com` como CNAME nuevos. No será necesario mover ni modificar el sitio principal.
