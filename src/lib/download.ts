export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Strips characters that are invalid in file names. */
export const safeName = (s: string) => s.replace(/[\/:*?"<>|]+/g, "").trim() || "cancion";
