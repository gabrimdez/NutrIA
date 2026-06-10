import { create } from 'zustand';

export type AppUser = { id: string; email: string; email_verified?: boolean };

export type AppSession = {
  access_token: string;
  refresh_token?: string | null;
};

interface AuthState {
  session: AppSession | null;
  user: AppUser | null;
  isLoading: boolean;
  isOnboarded: boolean;
  /** Establece token + usuario (o null, null para cerrar sesión). */
  setAuth: (accessToken: string | null, user: AppUser | null, refreshToken?: string | null) => void;
  setIsOnboarded: (value: boolean) => void;
  setIsLoading: (value: boolean) => void;
  signOut: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  user: null,
  isLoading: true,
  isOnboarded: false,
  setAuth: (accessToken, user, refreshToken) =>
    set({
      session: accessToken ? { access_token: accessToken, refresh_token: refreshToken ?? null } : null,
      user: accessToken && user ? user : null,
      isLoading: false,
    }),
  setIsOnboarded: (value) => set({ isOnboarded: value }),
  setIsLoading: (value) => set({ isLoading: value }),
  signOut: () => set({ session: null, user: null, isOnboarded: false }),
}));
