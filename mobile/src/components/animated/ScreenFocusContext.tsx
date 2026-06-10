import React, { createContext, useContext, useState, useCallback, type PropsWithChildren } from 'react';
import { useFocusEffect } from 'expo-router';

const ScreenFocusContext = createContext<number>(0);

export function useScreenFocusKey() {
  return useContext(ScreenFocusContext);
}

export function ScreenFocusProvider({ children }: PropsWithChildren) {
  const [focusKey, setFocusKey] = useState(0);

  useFocusEffect(
    useCallback(() => {
      setFocusKey((k) => k + 1);
    }, []),
  );

  return (
    <ScreenFocusContext.Provider value={focusKey}>
      {children}
    </ScreenFocusContext.Provider>
  );
}
