import { create } from "zustand";
import type { ElectoralMapLevel, ElectoralMapMode } from "@/features/maps/hooks/use-map-data";

type MapStore = {
  mode: ElectoralMapMode;
  level: ElectoralMapLevel;
  setMode: (mode: ElectoralMapMode) => void;
  setLevel: (level: ElectoralMapLevel) => void;
};

export const useMapStore = create<MapStore>((set) => ({
  mode: "heatmap",
  level: "MUNICIPALITY",
  setMode: (mode) => set({ mode }),
  setLevel: (level) => set({ level })
}));
