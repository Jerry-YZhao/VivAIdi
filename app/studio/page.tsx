"use client";

import { StudioProvider } from "@/lib/session";
import { StudioShell } from "@/components/studio/StudioShell";

export default function StudioPage() {
  return (
    <StudioProvider>
      <StudioShell />
    </StudioProvider>
  );
}
