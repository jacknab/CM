export function isMobileDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  return (
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent
    ) ||
    (navigator.maxTouchPoints > 1 &&
      /Macintosh/.test(navigator.userAgent) &&
      "ontouchend" in document)
  );
}
