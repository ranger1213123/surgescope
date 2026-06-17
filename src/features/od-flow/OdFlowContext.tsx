import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { OdFocusState } from "../../types";

type OdFlowContextValue = OdFocusState & {
  setHoveredNodeId: (nodeId: string | null) => void;
  setSelectedNodeId: (nodeId: string | null) => void;
  setHoveredLinkId: (linkId: string | null) => void;
  setSelectedLinkId: (linkId: string | null) => void;
  clearSelection: () => void;
};

const OdFlowContext = createContext<OdFlowContextValue | null>(null);

export function OdFlowProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<OdFocusState>({
    hoveredNodeId: null,
    selectedNodeId: null,
    hoveredLinkId: null,
    selectedLinkId: null,
  });

  const value = useMemo<OdFlowContextValue>(
    () => ({
      ...state,
      setHoveredNodeId: (hoveredNodeId) =>
        setState((current) => ({ ...current, hoveredNodeId })),
      setSelectedNodeId: (selectedNodeId) =>
        setState((current) => ({
          ...current,
          selectedNodeId: current.selectedNodeId === selectedNodeId ? null : selectedNodeId,
          selectedLinkId: null,
        })),
      setHoveredLinkId: (hoveredLinkId) =>
        setState((current) => ({ ...current, hoveredLinkId })),
      setSelectedLinkId: (selectedLinkId) =>
        setState((current) => ({
          ...current,
          selectedLinkId: current.selectedLinkId === selectedLinkId ? null : selectedLinkId,
          selectedNodeId: null,
        })),
      clearSelection: () =>
        setState((current) => ({
          ...current,
          selectedNodeId: null,
          selectedLinkId: null,
        })),
    }),
    [state],
  );

  return <OdFlowContext.Provider value={value}>{children}</OdFlowContext.Provider>;
}

export function useOdFlowInteraction() {
  const context = useContext(OdFlowContext);
  if (!context) {
    throw new Error("useOdFlowInteraction must be used inside OdFlowProvider");
  }
  return context;
}
