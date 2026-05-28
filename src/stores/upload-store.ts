import { create } from "zustand";

type UploadState = {
  selectedFile: File | null;
  progress: number;
  setSelectedFile: (file: File | null) => void;
  setProgress: (progress: number) => void;
  reset: () => void;
};

export const useUploadStore = create<UploadState>((set) => ({
  selectedFile: null,
  progress: 0,
  setSelectedFile: (file) => set({ selectedFile: file, progress: 0 }),
  setProgress: (progress) => set({ progress }),
  reset: () => set({ selectedFile: null, progress: 0 })
}));
