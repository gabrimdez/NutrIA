import { QueryClient } from '@tanstack/react-query';

/** En dev, sin reintentos: timeout 25s × 3 intentos = espera larga si el backend no está. */
const defaultRetry =
  typeof __DEV__ !== 'undefined' && __DEV__ ? 0 : 2;

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 2,
      retry: defaultRetry,
      refetchOnWindowFocus: false,
    },
  },
});
