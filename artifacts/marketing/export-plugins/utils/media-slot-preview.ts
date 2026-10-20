type MediaSlotPreviewOptions = {
  isVideo: boolean;
};

type AttributeSnapshot = {
  value: string | null;
};

type PreviewSnapshot = {
  mediaPreview: AttributeSnapshot;
  poster: AttributeSnapshot;
};

const activePreviews = new Map<HTMLVideoElement, PreviewSnapshot>();

function slotFromUrl(value: string | null): string | null {
  if (!value) return null;
  const match = value.match(/\/airo-assets\/(?:images|videos)\/([^?#]+)/);
  return match?.[1] ?? null;
}

function restoreAttribute(element: Element, name: string, snapshot: AttributeSnapshot): void {
  if (snapshot.value === null) element.removeAttribute(name);
  else element.setAttribute(name, snapshot.value);
}

export function previewMediaSlot(
  slotPath: string,
  url: string,
  options: MediaSlotPreviewOptions,
): boolean {
  if (typeof document === 'undefined' || options.isVideo || !slotPath || !url) return false;

  const host = Array.from(document.querySelectorAll<HTMLVideoElement>('video')).find(
    (video) =>
      video.hasAttribute('data-airo-video-patched') &&
      slotFromUrl(video.getAttribute('poster')) === slotPath,
  );
  if (!host) return false;

  if (!activePreviews.has(host)) {
    activePreviews.set(host, {
      mediaPreview: { value: host.getAttribute('data-airo-media-preview') },
      poster: { value: host.getAttribute('poster') },
    });
  }

  host.setAttribute('data-airo-media-preview', 'poster');
  host.setAttribute('poster', url);
  return true;
}

export function revertMediaSlotPreview(): void {
  for (const [host, snapshot] of activePreviews) {
    restoreAttribute(host, 'data-airo-media-preview', snapshot.mediaPreview);
    restoreAttribute(host, 'poster', snapshot.poster);
  }
  activePreviews.clear();
}
