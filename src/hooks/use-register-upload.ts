"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

type RegisterUploadInput = {
  campaignId: string;
  fileName: string;
  fileSize: number;
  storagePath: string;
  checksum?: string;
};

export function useRegisterUpload() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: RegisterUploadInput) => {
      const response = await fetch("/api/uploads", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(input)
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error ?? "Não foi possível registrar o upload.");
      }

      return response.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["uploads"] });
    }
  });
}
