import { Suspense } from "react";

import { CombinationCreator } from "@/components/combinations/CombinationCreator";

export default function NewCombinationPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-zinc-900">New meal combination</h1>
      <Suspense fallback={<p className="text-sm text-zinc-500">Loading…</p>}>
        <CombinationCreator />
      </Suspense>
    </div>
  );
}
