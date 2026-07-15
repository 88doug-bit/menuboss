"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  ChefIdeaBrowser,
  ChefIdeaCaptureForm,
} from "@/components/ideas/ChefIdeaBrowser";

export default function IdeasPage() {
  const [captureOpen, setCaptureOpen] = useState(false);
  const router = useRouter();

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-zinc-900">Ideas</h1>
      <ChefIdeaBrowser onCapture={() => setCaptureOpen(true)} />
      {captureOpen ? (
        <ChefIdeaCaptureForm
          onClose={() => setCaptureOpen(false)}
          onCreated={(id) => {
            setCaptureOpen(false);
            router.push(`/ideas/${id}`);
          }}
        />
      ) : null}
    </div>
  );
}
