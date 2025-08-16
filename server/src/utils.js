export function parseCSV(str = "") {
  return (str || "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);
}

export function uniqueBy(arr, keyFn) {
  const map = new Map();
  for (const item of arr) map.set(keyFn(item), item);
  return [...map.values()];
}

export function minutesSeconds(totalSeconds = 0) {
  const m = Math.floor(totalSeconds / 60);
  const s = Math.floor(totalSeconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}
