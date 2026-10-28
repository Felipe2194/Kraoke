import { Suspense } from "react";
import SongView from "@/components/SongView";

export default function Page() {
  return (
    <Suspense fallback={<main className="p-10 text-center text-white/50">Cargando…</main>}>
      <SongView />
    </Suspense>
  );
}
