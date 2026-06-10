type ErrorLike = unknown;

function normalize(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ');
}

function includesAny(text: string, needles: string[]): boolean {
  return needles.some((n) => text.includes(n));
}

export function toUserFacingErrorMessage(
  error: ErrorLike,
  fallback = 'Algo salió mal. Inténtalo de nuevo.',
): string {
  const raw =
    typeof error === 'string'
      ? error
      : error instanceof Error
        ? error.message
        : fallback;
  const msg = normalize(raw);
  const low = msg.toLowerCase();

  if (!msg) return fallback;

  if (
    includesAny(low, [
      'failed to fetch',
      'network request failed',
      'load failed',
      'connection reset',
      'err_connection_reset',
      'network connection was lost',
      'internet',
      'sin conexión',
      'no se pudo conectar',
    ])
  ) {
    return 'No pudimos conectar con el servidor. Revisa tu internet e inténtalo de nuevo.';
  }

  if (includesAny(low, ['aborterror', 'timeout', 'no respondió a tiempo', 'timed out'])) {
    return 'La app tardó demasiado en responder. Inténtalo de nuevo en unos segundos.';
  }

  if (
    includesAny(low, [
      '401',
      'no autenticado',
      'token expirado',
      'token inválido',
      'token invalido',
      'sesion expirada',
      'sesión expirada',
      'tu sesión ha caducado',
      'session expired',
      'sin sesión activa',
      'inicia sesión de nuevo',
      'vuelve a iniciar sesión',
    ])
  ) {
    return 'Tu sesión ha caducado. Vuelve a iniciar sesión para continuar.';
  }

  if (includesAny(low, ['403', 'forbidden'])) {
    return 'No tienes permiso para hacer esta acción.';
  }

  if (includesAny(low, ['429', 'rate limit', 'too many requests', 'rate_limit_exceeded'])) {
    return 'Hay mucha carga ahora mismo. Inténtalo de nuevo en unos segundos.';
  }

  if (includesAny(low, ['413', 'request too large', 'payload too large', 'tokens per minute'])) {
    return 'La solicitud es demasiado grande para procesarla ahora. Prueba de nuevo con un mensaje más corto.';
  }

  if (includesAny(low, ['500', '502', '503', '504', 'internal server error'])) {
    return 'Tuvimos un problema en el servidor. Vuelve a intentarlo en un momento.';
  }

  if (includesAny(low, ['permission', 'permiso', 'denied'])) {
    return 'Necesitamos permisos del dispositivo para completar esta acción.';
  }

  // Evita mostrar trazas o mensajes técnicos largos al usuario final.
  if (msg.length > 180 || includesAny(low, ['traceback', 'sqlalchemy', 'jsondecodeerror'])) {
    console.warn('[userFacingError] Mensaje técnico ocultado al usuario:', msg);
    return fallback;
  }

  return msg;
}
