import { createContext, useContext } from 'react';

export type TabId = 'overview' | 'weather' | 'compare' | 'flow';

interface NavigationContextValue {
  activeTab: TabId;
  navigateTo: (tab: TabId) => void;
}

export const NavigationContext = createContext<NavigationContextValue>({
  activeTab: 'overview',
  navigateTo: () => {},
});

export function useNavigation() {
  return useContext(NavigationContext);
}
