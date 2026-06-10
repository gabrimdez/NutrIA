/**
 * Helpers tipados sobre los endpoints de entrenamientos.
 *
 * Centraliza las URLs para no duplicar strings en pantallas y para que el cambio
 * de contrato sea trivial.
 */
import { api } from './api';
import type {
  WorkoutSession,
  QuickCompleteRoutinePayload,
  QuickCompleteOtherPayload,
  SessionUpdatePayload,
  SessionCreatePayload,
} from '../types/workout';

export function quickCompleteRoutine(
  payload: QuickCompleteRoutinePayload,
): Promise<WorkoutSession> {
  return api.post<WorkoutSession>('/api/v1/workouts/sessions/quick-complete', payload);
}

export function quickCompleteOther(
  payload: QuickCompleteOtherPayload,
): Promise<WorkoutSession> {
  return api.post<WorkoutSession>('/api/v1/workouts/sessions/quick-other', payload);
}

export function updateSession(
  sessionId: string,
  payload: SessionUpdatePayload,
): Promise<WorkoutSession> {
  return api.put<WorkoutSession>(`/api/v1/workouts/sessions/${sessionId}`, payload);
}

export function createSession(
  payload: SessionCreatePayload,
): Promise<WorkoutSession> {
  return api.post<WorkoutSession>('/api/v1/workouts/sessions', payload);
}

/** Lista de claves de queries afectadas por crear/actualizar/borrar sesiones. */
export const WORKOUT_INVALIDATION_KEYS = [
  ['workout-sessions'],
  ['workout-week-summary'],
  ['workout-routines'],
] as const;
