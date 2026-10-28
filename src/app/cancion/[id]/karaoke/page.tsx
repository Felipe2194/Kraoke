import { Suspense } from "react";
import KaraokeRoom from "@/components/KaraokeRoom";

export default function Page() {
  return (
    <Suspense fallback={<div className="fixed inset-0 bg-black" />}>
      <KaraokeRoom />
    </Suspense>
  );
}
