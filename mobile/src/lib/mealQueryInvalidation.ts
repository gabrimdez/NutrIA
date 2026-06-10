import { QueryClient } from '@tanstack/react-query';

/** Tras crear/editar/borrar comidas: refresca inicio, diario y resumen. */
export function invalidateMealRelatedQueries(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: ['diary'] });
  queryClient.invalidateQueries({ queryKey: ['recentMeals'] });
  queryClient.invalidateQueries({ queryKey: ['progress'] });
  queryClient.invalidateQueries({ queryKey: ['diary-month-summary'] });
}
