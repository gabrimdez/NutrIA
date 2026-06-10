import { describe, expect, it } from 'vitest';

import { toUserFacingErrorMessage } from './userFacingError';

describe('toUserFacingErrorMessage', () => {
  it('does not treat a missing previous workout as an expired auth session', () => {
    expect(toUserFacingErrorMessage('No hay sesión anterior del mismo día de la semana.')).toBe(
      'No hay sesión anterior del mismo día de la semana.',
    );
  });

  it('still maps explicit auth expiry messages', () => {
    expect(toUserFacingErrorMessage('Token expirado')).toBe(
      'Tu sesión ha caducado. Vuelve a iniciar sesión para continuar.',
    );
  });
});
