"use client";

import { useEffect, useState } from "react";

export type Capabilities = {
  webgpu: boolean;
  isolated: boolean;
  mobile: boolean;
  video: boolean;
};

export function useCapabilities() {
  const [caps, setCaps] = useState<Capabilities | null>(null);
  useEffect(() => {
    (async () => {
      let webgpu = false;
      try {
        const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
        webgpu = Boolean(gpu && (await gpu.requestAdapter()));
      } catch {}
      setCaps({
        webgpu,
        isolated: self.crossOriginIsolated,
        mobile: /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent),
        video: typeof VideoEncoder !== "undefined",
      });
    })();
  }, []);
  return caps;
}
