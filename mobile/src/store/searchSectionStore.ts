import { create } from 'zustand';
import type { Ionicons } from '@expo/vector-icons';

export type SearchSection = 'search' | 'recipes' | 'list' | 'scanner' | 'voice';

type IonIcon = keyof typeof Ionicons.glyphMap;

export const SECTION_ICONS: Record<SearchSection, { outline: IonIcon; filled: IonIcon }> = {
  search: { outline: 'search-outline', filled: 'search' },
  recipes: { outline: 'book-outline', filled: 'book' },
  list: { outline: 'list-outline', filled: 'list' },
  scanner: { outline: 'scan-outline', filled: 'scan' },
  voice: { outline: 'mic-outline', filled: 'mic' },
};

interface SearchSectionState {
  lastSection: SearchSection;
  setLastSection: (section: SearchSection) => void;
}

export const useSearchSectionStore = create<SearchSectionState>((set) => ({
  lastSection: 'search',
  setLastSection: (section) => set({ lastSection: section }),
}));
