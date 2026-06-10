# Rate limiting y proxies

El backend usa **slowapi** con una clave por defecto igual a la dirección remota (`request.client.host`).

## Despliegue detrás de reverse proxy

Sin configuración extra, todas las peticiones pueden verse con la **misma IP** (la del proxy). Eso aplasta los límites por cliente real.

Opciones:

1. **`RATE_LIMIT_TRUST_X_FORWARDED_FOR=true`** en el servidor: la clave de rate limit usa el **primer IP válido** de la cabecera `X-Forwarded-For`.

   Usar **solo** si:

   - El proxy (nginx, Traefik, Cloudflare, etc.) **añade o sobrescribe** `X-Forwarded-For` y los clientes **no** pueden enviar peticiones directamente al backend saltándose el proxy.

   Si activas esto sin proxy de confianza, un atacante puede falsificar la cabecera y eludir límites.

2. Configurar el proxy para enviar la IP real por otro mecanismo y que uvicorn/Gunicorn la exponga (p. ej. `--proxy-headers` / trusted hosts), según tu stack.

## Variables de entorno relevantes

| Variable | Descripción |
|----------|-------------|
| `RATE_LIMIT_ENABLED` | `false` en tests para evitar 429 masivos. |
| `RATE_LIMIT_TRUST_X_FORWARDED_FOR` | `true` solo con proxy de confianza (ver arriba). |

## Límites por usuario autenticado

Los endpoints de **auth** combinan slowapi (por IP o IP forwarded) con **límites por cuenta** en base de datos (`account_rate_limit`) para login/registro, reduciendo fuerza bruta por email.

Para rutas ya autenticadas, el límite sigue siendo principalmente por IP; endurecer por `user_id` sería un cambio de diseño aparte.
