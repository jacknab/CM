/**
 * public/airo-video-slots.js reverse (video → image) reconciliation.
 *
 * The script is a standalone IIFE shipped to published apps, so it is executed
 * here rather than imported. Fake timers keep its dev-mode manifest poll inert
 * until a test advances the clock.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { previewMediaSlot, revertMediaSlotPreview } from '../../../export-plugins/utils/media-slot-preview'

const SCRIPT: string = readFileSync(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../public/airo-video-slots.js'),
  'utf8',
)

const SLOT: string = 'pages/home/hero'

type Manifest = Record<string, { mediaType: string }>

function stubManifestFetch(...responses: Manifest[]): void {
  let call: number = 0
  vi.stubGlobal('fetch', vi.fn(function fetchManifest(): Promise<{ ok: boolean; json: () => Promise<Manifest> }> {
    const body: Manifest = responses[Math.min(call, responses.length - 1)]!
    call += 1
    return Promise.resolve({ ok: true, json: (): Promise<Manifest> => Promise.resolve(body) })
  }))
}

async function runScript(): Promise<void> {
  new Function(SCRIPT)()
  await vi.advanceTimersByTimeAsync(0)
}

type MediaSlotTypeBridge = (slotPath: string, mediaType: string | undefined) => void

function setMediaSlotType(): MediaSlotTypeBridge {
  return (window as unknown as { airoSetMediaSlotType: MediaSlotTypeBridge }).airoSetMediaSlotType
}

// One script instance runs per real page. Tests share a jsdom document, so each
// instance's observer is tracked and disconnected to stop a prior instance's
// stale mediaTypes cache from patching the next test's DOM.
const NativeMutationObserver: typeof MutationObserver = globalThis.MutationObserver
const observers: MutationObserver[] = []

beforeEach(function setup(): void {
  vi.useFakeTimers()
  HTMLMediaElement.prototype.load = vi.fn()
  HTMLMediaElement.prototype.play = vi.fn()
  document.body.innerHTML = ''
  ;(window as unknown as { __AIRO_DEV_MODE__: boolean }).__AIRO_DEV_MODE__ = false
  vi.stubGlobal('MutationObserver', class TrackedMutationObserver extends NativeMutationObserver {
    constructor(callback: MutationCallback) {
      super(callback)
      observers.push(this)
    }
  })
})

afterEach(function teardown(): void {
  observers.forEach(function disconnect(observer: MutationObserver): void {
    observer.disconnect()
  })
  observers.length = 0
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('airo-video-slots.js reverse reconciliation', function reverseTests() {
  it('reveals the hidden img and drops the injected video when the slot is an image', async function revealsImg(): Promise<void> {
    document.body.innerHTML = `
      <div>
        <img src="/airo-assets/images/${SLOT}" data-airo-video-patched="true" style="display: none;" />
        <video data-airo-video="" data-slot="${SLOT}" src="/airo-assets/videos/${SLOT}"></video>
      </div>`
    stubManifestFetch({ [SLOT]: { mediaType: 'image' } })

    await runScript()

    const img: HTMLImageElement = document.querySelector('img')!
    expect(document.querySelector('video')).toBeNull()
    expect(img.hasAttribute('data-airo-video-patched')).toBe(false)
    expect(img.style.display).toBe('')
  })

  it('replaces an agent-written <video> with an <img> on the image slot URL', async function replacesSourceVideo(): Promise<void> {
    document.body.innerHTML = `<div><video src="/airo-assets/videos/${SLOT}" class="hero-media" aria-label="A sunny patio"></video></div>`
    stubManifestFetch({ [SLOT]: { mediaType: 'image' } })

    await runScript()

    const img: HTMLImageElement | null = document.querySelector('img')
    expect(document.querySelector('video')).toBeNull()
    expect(img).not.toBeNull()
    expect(img!.getAttribute('src')).toBe(`/airo-assets/images/${SLOT}`)
    expect(img!.className).toBe('hero-media')
    expect(img!.alt).toBe('A sunny patio')
  })

  it('leaves a video untouched when its slot is absent from the manifest', async function absentSlotGuard(): Promise<void> {
    document.body.innerHTML = `<div><video src="/airo-assets/videos/${SLOT}"></video></div>`
    stubManifestFetch({})

    await runScript()

    expect(document.querySelector('video')).not.toBeNull()
    expect(document.querySelector('img')).toBeNull()
  })

  it('ignores dev-tools provisional preview nodes', async function skipsPreviewNodes(): Promise<void> {
    document.body.innerHTML = `<div><video data-airo-media-preview="video" src="/airo-assets/videos/${SLOT}"></video></div>`
    stubManifestFetch({ [SLOT]: { mediaType: 'image' } })

    await runScript()

    expect(document.querySelector('video')).not.toBeNull()
  })

  it('restores the background image and clears the fill video for a background slot', async function restoresBackground(): Promise<void> {
    document.body.innerHTML = `
      <section data-airo-video-bg-patched="${SLOT}" data-airo-bg-video-clear-bg="true" style="background-image: none; background-color: transparent;">
        <video data-airo-bg-video="" data-slot="${SLOT}" src="/airo-assets/videos/${SLOT}"></video>
      </section>`
    stubManifestFetch({ [SLOT]: { mediaType: 'image' } })

    await runScript()

    const section: HTMLElement = document.querySelector('section')!
    expect(section.querySelector('video[data-airo-bg-video]')).toBeNull()
    expect(section.hasAttribute('data-airo-video-bg-patched')).toBe(false)
    expect(section.hasAttribute('data-airo-bg-video-clear-bg')).toBe(false)
    expect(section.style.backgroundImage).toContain(`/airo-assets/images/${SLOT}`)
  })

  it('heals a stale patch when the manifest poll reports the slot flipped to image', async function pollHeals(): Promise<void> {
    document.body.innerHTML = `<div><img src="/airo-assets/images/${SLOT}" /></div>`
    stubManifestFetch({ [SLOT]: { mediaType: 'video' } }, { [SLOT]: { mediaType: 'image' } })
    ;(window as unknown as { __AIRO_DEV_MODE__: boolean }).__AIRO_DEV_MODE__ = true

    await runScript()

    const img: HTMLImageElement = document.querySelector('img')!
    expect(document.querySelector('video')).not.toBeNull()
    expect(img.style.display).toBe('none')

    await vi.advanceTimersByTimeAsync(3000)

    expect(document.querySelector('video')).toBeNull()
    expect(img.hasAttribute('data-airo-video-patched')).toBe(false)
    expect(img.style.display).toBe('')
  })

  it('reconciles a video added after hydration (observer, direct node)', async function observerDirectNode(): Promise<void> {
    document.body.innerHTML = '<div id="host"></div>'
    stubManifestFetch({ [SLOT]: { mediaType: 'image' } })

    await runScript()

    const host: HTMLElement = document.getElementById('host')!
    const video: HTMLVideoElement = document.createElement('video')
    video.src = `/airo-assets/videos/${SLOT}`
    host.appendChild(video)
    await vi.advanceTimersByTimeAsync(0)

    expect(host.querySelector('video')).toBeNull()
    expect(host.querySelector('img')!.getAttribute('src')).toBe(`/airo-assets/images/${SLOT}`)
  })

  it('reconciles a video inside an added subtree (observer, wrapper node)', async function observerSubtree(): Promise<void> {
    document.body.innerHTML = '<div id="host"></div>'
    stubManifestFetch({ [SLOT]: { mediaType: 'image' } })

    await runScript()

    const host: HTMLElement = document.getElementById('host')!
    const wrapper: HTMLElement = document.createElement('section')
    wrapper.innerHTML = `<video src="/airo-assets/videos/${SLOT}"></video>`
    host.appendChild(wrapper)
    await vi.advanceTimersByTimeAsync(0)

    expect(wrapper.querySelector('video')).toBeNull()
    expect(wrapper.querySelector('img')!.getAttribute('src')).toBe(`/airo-assets/images/${SLOT}`)
  })

  it('reveals a patched img whose video is already gone', async function orphanedPatchedImg(): Promise<void> {
    document.body.innerHTML = `<div><img src="/airo-assets/images/${SLOT}" data-airo-video-patched="true" style="display: none;" /></div>`
    stubManifestFetch({ [SLOT]: { mediaType: 'image' } })

    await runScript()

    const img: HTMLImageElement = document.querySelector('img')!
    expect(img.hasAttribute('data-airo-video-patched')).toBe(false)
    expect(img.style.display).toBe('')
  })

  it('removes an injected video that lost its img sibling', async function injectedVideoWithoutSibling(): Promise<void> {
    document.body.innerHTML = `<div><video data-airo-video="" data-slot="${SLOT}" src="/airo-assets/videos/${SLOT}"></video></div>`
    stubManifestFetch({ [SLOT]: { mediaType: 'image' } })

    await runScript()

    expect(document.querySelector('video')).toBeNull()
    expect(document.querySelector('img')).toBeNull()
  })

  it('leaves a patched pair untouched while the slot is still a video', async function videoSlotGuard(): Promise<void> {
    document.body.innerHTML = `
      <div>
        <img src="/airo-assets/images/${SLOT}" data-airo-video-patched="true" style="display: none;" />
        <video data-airo-video="" data-slot="${SLOT}" src="/airo-assets/videos/${SLOT}"></video>
      </div>`
    stubManifestFetch({ [SLOT]: { mediaType: 'video' } })

    await runScript()

    const img: HTMLImageElement = document.querySelector('img')!
    expect(document.querySelector('video')).not.toBeNull()
    expect(img.getAttribute('data-airo-video-patched')).toBe('true')
    expect(img.style.display).toBe('none')
  })

  it('still upgrades an img to video for a video slot', async function forwardStillWorks(): Promise<void> {
    document.body.innerHTML = `<div><img src="/airo-assets/images/${SLOT}" /></div>`
    stubManifestFetch({ [SLOT]: { mediaType: 'video' } })

    await runScript()

    const video: HTMLVideoElement | null = document.querySelector('video')
    const img: HTMLImageElement = document.querySelector('img')!
    expect(video).not.toBeNull()
    expect(video!.getAttribute('data-slot')).toBe(SLOT)
    expect(img.getAttribute('data-airo-video-patched')).toBe('true')
    expect(img.style.display).toBe('none')
  })

  it('upgrades a poster-only video host to a video sibling for a video slot', async function posterOnlyForwardUpgrade(): Promise<void> {
    document.body.innerHTML = `<div><video src="/airo-assets/videos/pages/home/unrelated" poster="/airo-assets/images/${SLOT}" width="640" height="360"></video></div>`
    stubManifestFetch({ [SLOT]: { mediaType: 'video' } })

    await runScript()

    const posterVideo: HTMLVideoElement = document.querySelector('video')!
    const insertedVideo: HTMLVideoElement | null = posterVideo.nextElementSibling as HTMLVideoElement | null
    expect(posterVideo.getAttribute('data-airo-video-patched')).toBe('true')
    expect(posterVideo.style.display).toBe('none')
    expect(insertedVideo?.tagName).toBe('VIDEO')
    expect(insertedVideo!.getAttribute('data-slot')).toBe(SLOT)
    expect(insertedVideo!.src).toContain(`/airo-assets/videos/${SLOT}`)
    expect(insertedVideo!.width).toBe(640)
    expect(insertedVideo!.height).toBe(360)
  })

  it('suspends a poster-only video host\'s own playback when committing it to video, so its audio does not keep playing hidden', async function posterOnlyForwardUpgradeHolds(): Promise<void> {
    document.body.innerHTML = `<div><video src="/airo-assets/videos/pages/home/unrelated" poster="/airo-assets/images/${SLOT}" autoplay></video></div>`
    stubManifestFetch({ [SLOT]: { mediaType: 'video' } })

    await runScript()

    const posterVideo: HTMLVideoElement = document.querySelector('video:not([data-airo-video])')!
    expect(posterVideo.style.display).toBe('none')
    expect(posterVideo.hasAttribute('data-airo-poster-hold')).toBe(true)
    expect(posterVideo.hasAttribute('autoplay')).toBe(false)
  })

  it('reverts a poster-only video host once its slot flips back to image', async function posterOnlyReverts(): Promise<void> {
    document.body.innerHTML = `
      <div>
        <video autoplay src="/airo-assets/videos/pages/home/unrelated" poster="/airo-assets/images/${SLOT}" data-airo-video-patched="true" style="display: none;">
          <source src="/airo-assets/videos/pages/home/other" type="video/webm">
        </video>
        <video data-airo-video="" data-slot="${SLOT}" src="/airo-assets/videos/${SLOT}"></video>
      </div>`
    stubManifestFetch({ [SLOT]: { mediaType: 'image' } })

    await runScript()

    const posterVideo: HTMLVideoElement = document.querySelector('video')!
    const source: HTMLSourceElement | null = posterVideo.querySelector('source')
    expect(document.querySelectorAll('video')).toHaveLength(1)
    expect(posterVideo.hasAttribute('data-airo-video-patched')).toBe(false)
    expect(posterVideo.style.display).toBe('')
    expect(posterVideo.getAttribute('autoplay')).toBeNull()
    expect(posterVideo.getAttribute('preload')).toBe('none')
    expect(posterVideo.getAttribute('src')).toContain('unrelated')
    expect(source?.getAttribute('src')).toBe('/airo-assets/videos/pages/home/other')
    expect(posterVideo.getAttribute('poster')).toContain(SLOT)
  })

  it('keeps autoplay when a generated image is only the poster on a fresh load', async function generatedPosterKeepsAutoplay(): Promise<void> {
    document.body.innerHTML = `<div><video autoplay src="/airo-assets/videos/pages/home/unrelated" poster="/airo-assets/images/${SLOT}"></video></div>`
    stubManifestFetch({ [SLOT]: { mediaType: 'generated' } })

    await runScript()

    const host: HTMLVideoElement = document.querySelector('video')!
    expect(host.hasAttribute('data-airo-poster-hold')).toBe(false)
    expect(host.getAttribute('autoplay')).toBe('')
    expect(host.getAttribute('src')).toContain('unrelated')
    expect(host.getAttribute('poster')).toContain(SLOT)
  })

  it('keeps autoplay on a fresh load when the poster is a different image slot', async function ordinaryPosterKeepsAutoplay(): Promise<void> {
    const posterSlot: string = 'pages/home/hero-poster'
    document.body.innerHTML = `
      <div>
        <video autoplay muted loop playsinline src="/airo-assets/videos/${SLOT}" poster="/airo-assets/images/${posterSlot}"></video>
        <video autoplay src="https://cdn.example.com/stock.mp4" poster="/airo-assets/images/${posterSlot}"></video>
      </div>`
    stubManifestFetch({ [SLOT]: { mediaType: 'video' }, [posterSlot]: { mediaType: 'image' } })

    await runScript()

    const hosts: NodeListOf<HTMLVideoElement> = document.querySelectorAll('video')
    expect(hosts).toHaveLength(2)
    expect(hosts[0].getAttribute('autoplay')).toBe('')
    expect(hosts[0].hasAttribute('data-airo-poster-hold')).toBe(false)
    expect(hosts[0].getAttribute('src')).toContain(`/airo-assets/videos/${SLOT}`)
    expect(hosts[0].getAttribute('poster')).toContain(posterSlot)
    expect(hosts[1].getAttribute('autoplay')).toBe('')
    expect(hosts[1].hasAttribute('data-airo-poster-hold')).toBe(false)
    expect(hosts[1].getAttribute('src')).toContain('cdn.example.com/stock.mp4')

    hosts[0].setAttribute('poster', `/airo-assets/images/${posterSlot}?_t=2`)
    await vi.advanceTimersByTimeAsync(0)

    expect(hosts[0].getAttribute('autoplay')).toBe('')
    expect(hosts[0].hasAttribute('data-airo-poster-hold')).toBe(false)
  })

  it('keeps a committed poster sibling when an image preview replaces the host poster', async function previewImageKeepsCommittedSibling(): Promise<void> {
    document.body.innerHTML = `
      <div>
        <video src="/airo-assets/videos/pages/home/unrelated" poster="/airo-assets/images/${SLOT}" data-airo-video-patched="true" style="display: none;"></video>
        <video data-airo-video="" data-slot="${SLOT}" src="/airo-assets/videos/${SLOT}"></video>
      </div>`
    stubManifestFetch({ [SLOT]: { mediaType: 'video' } })

    await runScript()

    const host: HTMLVideoElement = document.querySelector('video')!
    const sibling: HTMLVideoElement = document.querySelectorAll('video')[1]!
    expect(host.getAttribute('data-airo-video-patched')).toBe('true')
    expect(host.nextElementSibling).toBe(sibling)

    expect(previewMediaSlot(SLOT, 'https://cdn.example.com/photo.jpg', { isVideo: false })).toBe(true)
    await vi.advanceTimersByTimeAsync(0)

    expect(host.getAttribute('data-airo-video-patched')).toBe('true')
    expect(sibling.isConnected).toBe(true)
    expect(host.nextElementSibling).toBe(sibling)
    expect(host.getAttribute('data-airo-media-preview')).toBe('poster')
    expect(host.getAttribute('poster')).toContain('cdn.example.com/photo.jpg')

    revertMediaSlotPreview()
    await vi.advanceTimersByTimeAsync(0)

    expect(host.hasAttribute('data-airo-media-preview')).toBe(false)
    expect(host.style.display).toBe('none')
    expect(host.getAttribute('data-airo-video-patched')).toBe('true')
    expect(host.getAttribute('poster')).toContain(SLOT)
    expect(sibling.isConnected).toBe(true)
    expect(sibling.style.display).toBe('')
    expect(sibling.getAttribute('src')).toContain(`/airo-assets/videos/${SLOT}`)
  })

  it('keeps a poster hold when a provisional preview replaces the poster', async function previewPosterKeepsHold(): Promise<void> {
    document.body.innerHTML = `
      <div>
        <video autoplay src="/airo-assets/videos/pages/home/unrelated" poster="/airo-assets/images/${SLOT}" data-airo-video-patched="true" style="display: none;"></video>
        <video data-airo-video="" data-slot="${SLOT}" src="/airo-assets/videos/${SLOT}"></video>
      </div>`
    stubManifestFetch({ [SLOT]: { mediaType: 'image' } })

    await runScript()

    const host: HTMLVideoElement = document.querySelector('video')!
    expect(host.hasAttribute('data-airo-poster-hold')).toBe(true)
    host.setAttribute('data-airo-media-preview', 'poster')
    host.setAttribute('poster', 'https://cdn.example.com/preview.jpg')
    await vi.advanceTimersByTimeAsync(0)

    expect(host.hasAttribute('data-airo-poster-hold')).toBe(true)
    expect(host.getAttribute('autoplay')).toBeNull()
    expect(host.getAttribute('src')).toContain('unrelated')
    expect(host.getAttribute('poster')).toContain('cdn.example.com/preview.jpg')
  })

  it('restores playback when an image poster is removed and leaves the other video alone', async function posterHoldReleases(): Promise<void> {
    document.body.innerHTML = `
      <div>
        <video autoplay controls preload="metadata" src="/airo-assets/videos/pages/home/unrelated" poster="/airo-assets/images/${SLOT}" data-airo-video-patched="true" style="display: none;">
          <source src="/airo-assets/videos/pages/home/other" type="video/mp4">
        </video>
        <video data-airo-video="" data-slot="${SLOT}" src="/airo-assets/videos/${SLOT}"></video>
        <video autoplay src="/airo-assets/videos/pages/home/keep"></video>
      </div>`
    stubManifestFetch({ [SLOT]: { mediaType: 'image' } })

    await runScript()

    const host: HTMLVideoElement = document.querySelector('video')!
    const source: HTMLSourceElement | null = host.querySelector('source')
    const other: HTMLVideoElement = document.querySelectorAll('video')[1]!
    expect(host.getAttribute('autoplay')).toBeNull()
    expect(host.getAttribute('src')).toContain('unrelated')
    expect(source?.getAttribute('src')).toBe('/airo-assets/videos/pages/home/other')
    expect(host.hasAttribute('controls')).toBe(true)
    expect(other.getAttribute('autoplay')).toBe('')
    expect(other.getAttribute('src')).toContain('keep')

    host.removeAttribute('poster')
    await vi.advanceTimersByTimeAsync(0)

    expect(host.hasAttribute('data-airo-poster-hold')).toBe(false)
    expect(host.getAttribute('autoplay')).toBe('')
    expect(host.getAttribute('preload')).toBe('metadata')
    expect(host.getAttribute('src')).toContain('unrelated')
    expect(source?.getAttribute('src')).toBe('/airo-assets/videos/pages/home/other')
    expect(other.getAttribute('autoplay')).toBe('')
    expect(other.getAttribute('src')).toContain('keep')
  })

  it('leaves a video alone when a source child already plays the poster slot', async function sourceChildAlreadyPlaysSlot(): Promise<void> {
    document.body.innerHTML = `<div><video controls poster="/airo-assets/images/${SLOT}"><source src="/airo-assets/videos/${SLOT}" type="video/mp4"></video></div>`
    stubManifestFetch({ [SLOT]: { mediaType: 'video' } })

    await runScript()

    const host: HTMLVideoElement = document.querySelector('video')!
    expect(document.querySelectorAll('video')).toHaveLength(1)
    expect(host.hasAttribute('data-airo-video-patched')).toBe(false)
    expect(host.style.display).toBe('')
    expect(host.querySelector('source')?.getAttribute('src')).toBe(`/airo-assets/videos/${SLOT}`)
  })

  it('still upgrades a poster-only video when its source child is a different slot', async function sourceChildDifferentSlot(): Promise<void> {
    document.body.innerHTML = `<div><video poster="/airo-assets/images/${SLOT}"><source src="/airo-assets/videos/pages/home/unrelated" type="video/mp4"></video></div>`
    stubManifestFetch({ [SLOT]: { mediaType: 'video' } })

    await runScript()

    const host: HTMLVideoElement = document.querySelector('video:not([data-airo-video])')!
    const inserted: HTMLVideoElement | null = host.nextElementSibling as HTMLVideoElement | null
    expect(host.getAttribute('data-airo-video-patched')).toBe('true')
    expect(host.style.display).toBe('none')
    expect(inserted?.getAttribute('data-slot')).toBe(SLOT)
    expect(document.querySelectorAll('video[data-airo-video]')).toHaveLength(1)
  })

  it('keeps both injected videos when two poster-only hosts for one slot share a parent', async function twoPosterHosts(): Promise<void> {
    document.body.innerHTML = `
      <div>
        <video src="/airo-assets/videos/pages/home/unrelated" poster="/airo-assets/images/${SLOT}"></video>
        <video src="/airo-assets/videos/pages/home/unrelated" poster="/airo-assets/images/${SLOT}"></video>
      </div>`
    stubManifestFetch({ [SLOT]: { mediaType: 'video' } })

    await runScript()

    const parent: HTMLElement = document.querySelector('div')!
    const hosts: NodeListOf<HTMLVideoElement> = parent.querySelectorAll('video:not([data-airo-video])')
    const injected: NodeListOf<HTMLVideoElement> = parent.querySelectorAll('video[data-airo-video]')
    expect(hosts).toHaveLength(2)
    expect(injected).toHaveLength(2)
    expect(hosts[0].style.display).toBe('none')
    expect(hosts[0].nextElementSibling).toBe(injected[0])
    expect(hosts[1].style.display).toBe('none')
    expect(hosts[1].nextElementSibling).toBe(injected[1])
    expect(injected[0].getAttribute('data-slot')).toBe(SLOT)
    expect(injected[1].getAttribute('data-slot')).toBe(SLOT)
  })

  it('retargets a reused poster host to its new slot without moving the other host sibling', async function posterSlotChange(): Promise<void> {
    const slotB: string = 'pages/home/slide'
    document.body.innerHTML = `
      <div>
        <video src="/airo-assets/videos/pages/home/unrelated" poster="/airo-assets/images/${SLOT}"></video>
        <video src="/airo-assets/videos/pages/home/unrelated" poster="/airo-assets/images/${SLOT}"></video>
      </div>`
    stubManifestFetch({ [SLOT]: { mediaType: 'video' }, [slotB]: { mediaType: 'video' } })

    await runScript()

    const parent: HTMLElement = document.querySelector('div')!
    const hosts: NodeListOf<HTMLVideoElement> = parent.querySelectorAll('video:not([data-airo-video])')
    hosts[1].setAttribute('poster', `/airo-assets/images/${slotB}`)
    await vi.advanceTimersByTimeAsync(0)

    const injected: NodeListOf<HTMLVideoElement> = parent.querySelectorAll('video[data-airo-video]')
    expect(injected).toHaveLength(2)
    expect(hosts[0].nextElementSibling).toBe(injected[0])
    expect(injected[0].getAttribute('data-slot')).toBe(SLOT)
    expect(hosts[0].style.display).toBe('none')
    expect(hosts[1].nextElementSibling).toBe(injected[1])
    expect(injected[1].getAttribute('data-slot')).toBe(slotB)
    expect(hosts[1].style.display).toBe('none')
    expect(hosts[1].getAttribute('data-airo-video-patched')).toBe('true')
  })

  it('un-patches a poster-only host when its own src attribute changes to match the slot, not just when its poster changes', async function sourceSrcChangeReconciles(): Promise<void> {
    document.body.innerHTML = `
      <div>
        <video src="/airo-assets/videos/pages/home/unrelated" poster="/airo-assets/images/${SLOT}" data-airo-video-patched="true" style="display: none;"></video>
        <video data-airo-video="" data-slot="${SLOT}" src="/airo-assets/videos/${SLOT}"></video>
      </div>`
    stubManifestFetch({ [SLOT]: { mediaType: 'video' } })

    await runScript()

    const parent: HTMLElement = document.querySelector('div')!
    const host: HTMLVideoElement = parent.querySelector('video:not([data-airo-video])')!
    // The video's own content now legitimately plays the slot, without its poster
    // attribute changing at all.
    host.setAttribute('src', `/airo-assets/videos/${SLOT}`)
    await vi.advanceTimersByTimeAsync(0)

    expect(host.hasAttribute('data-airo-video-patched')).toBe(false)
    expect(host.style.display).toBe('')
    expect(parent.querySelectorAll('video[data-airo-video]')).toHaveLength(0)
  })

  it('un-patches a poster-only host when its <source> child is replaced to match the slot', async function sourceChildReplaceReconciles(): Promise<void> {
    document.body.innerHTML = `
      <div>
        <video poster="/airo-assets/images/${SLOT}" data-airo-video-patched="true" style="display: none;">
          <source src="/airo-assets/videos/pages/home/unrelated" />
        </video>
        <video data-airo-video="" data-slot="${SLOT}" src="/airo-assets/videos/${SLOT}"></video>
      </div>`
    stubManifestFetch({ [SLOT]: { mediaType: 'video' } })

    await runScript()

    const parent: HTMLElement = document.querySelector('div')!
    const host: HTMLVideoElement = parent.querySelector('video:not([data-airo-video])')!
    // React replaces the <source> node outright rather than mutating its attributes.
    const matchingSource: HTMLSourceElement = document.createElement('source')
    matchingSource.src = `/airo-assets/videos/${SLOT}`
    host.replaceChildren(matchingSource)
    await vi.advanceTimersByTimeAsync(0)

    expect(host.hasAttribute('data-airo-video-patched')).toBe(false)
    expect(host.style.display).toBe('')
    expect(parent.querySelectorAll('video[data-airo-video]')).toHaveLength(0)
  })

  it('holds a patched host\'s own playback when its poster attribute is retargeted straight to an image slot', async function posterRetargetToImageHolds(): Promise<void> {
    const imageSlot: string = 'pages/home/portrait'
    document.body.innerHTML = `
      <div>
        <video src="/airo-assets/videos/pages/home/unrelated" poster="/airo-assets/images/${SLOT}" autoplay data-airo-video-patched="true" style="display: none;"></video>
        <video data-airo-video="" data-slot="${SLOT}" src="/airo-assets/videos/${SLOT}"></video>
      </div>`
    stubManifestFetch({ [SLOT]: { mediaType: 'video' }, [imageSlot]: { mediaType: 'image' } })

    await runScript()

    const parent: HTMLElement = document.querySelector('div')!
    const host: HTMLVideoElement = parent.querySelector('video:not([data-airo-video])')!
    // A React re-render can change just the poster attribute without first removing
    // the injected sibling — exercising the attribute-mutation branch directly,
    // not the sibling-driven unpatchVideo path.
    host.setAttribute('poster', `/airo-assets/images/${imageSlot}`)
    await vi.advanceTimersByTimeAsync(0)

    expect(host.hasAttribute('data-airo-video-patched')).toBe(false)
    expect(host.style.display).toBe('')
    expect(parent.querySelectorAll('video[data-airo-video]')).toHaveLength(0)
    // The revealed host's own (unrelated) content must not resume autoplaying while
    // its new poster slot is an image.
    expect(host.hasAttribute('data-airo-poster-hold')).toBe(true)
    expect(host.hasAttribute('autoplay')).toBe(false)
  })

  it('replaces a stale injected sibling when a poster-only host is remounted', async function posterHostRemount(): Promise<void> {
    document.body.innerHTML = `<div><video src="/airo-assets/videos/pages/home/unrelated" poster="/airo-assets/images/${SLOT}"></video></div>`
    stubManifestFetch({ [SLOT]: { mediaType: 'video' } })

    await runScript()

    const parent: HTMLElement = document.querySelector('div')!
    const original: HTMLVideoElement = parent.querySelector('video:not([data-airo-video])')!
    const fresh: HTMLVideoElement = document.createElement('video')
    fresh.src = '/airo-assets/videos/pages/home/unrelated'
    fresh.setAttribute('poster', `/airo-assets/images/${SLOT}`)
    original.replaceWith(fresh)
    await vi.advanceTimersByTimeAsync(0)

    const injected: NodeListOf<HTMLVideoElement> = parent.querySelectorAll('video[data-airo-video]')
    expect(injected).toHaveLength(1)
    expect(fresh.getAttribute('data-airo-video-patched')).toBe('true')
    expect(fresh.style.display).toBe('none')
    expect(fresh.nextElementSibling).toBe(injected[0])
  })

  it('does not hide a poster-only video removed before the upgrade can insert a sibling', async function detachedPosterHost(): Promise<void> {
    document.body.innerHTML = '<div></div>'
    stubManifestFetch({ [SLOT]: { mediaType: 'video' } })

    await runScript()

    const detached: HTMLVideoElement = document.createElement('video')
    detached.src = '/airo-assets/videos/pages/home/unrelated'
    detached.setAttribute('poster', `/airo-assets/images/${SLOT}`)
    document.body.appendChild(detached)
    detached.remove()
    await vi.advanceTimersByTimeAsync(0)

    expect(detached.isConnected).toBe(false)
    expect(detached.hasAttribute('data-airo-video-patched')).toBe(false)
    expect(detached.style.display).toBe('')
    expect(document.querySelector('video[data-airo-video]')).toBeNull()
  })

  it('keeps a video dev-tools committed after airoSetMediaSlotType publishes the new kind', async function bridgeStopsRevert(): Promise<void> {
    document.body.innerHTML = `<div><img src="/airo-assets/images/${SLOT}" /></div>`
    stubManifestFetch({ [SLOT]: { mediaType: 'image' } })

    await runScript()
    setMediaSlotType()(SLOT, 'video')

    const host: HTMLElement = document.querySelector('div')!
    const img: HTMLImageElement = host.querySelector('img')!
    img.setAttribute('data-airo-video-patched', 'true')
    img.style.display = 'none'
    host.insertAdjacentHTML(
      'beforeend',
      `<video data-airo-video="" data-slot="${SLOT}" src="/airo-assets/videos/${SLOT}?_t=1"></video>`,
    )
    await vi.advanceTimersByTimeAsync(0)

    expect(host.querySelector('video')).not.toBeNull()
    expect(img.style.display).toBe('none')
  })

  it('keeps a bridge-committed video after a pending initial manifest response resolves stale', async function bridgeSurvivesLateManifest(): Promise<void> {
    document.body.innerHTML = `<div><img src="/airo-assets/images/${SLOT}" /></div>`
    let resolveManifest: (value: { ok: boolean; json: () => Promise<Manifest> }) => void = () => {}
    vi.stubGlobal('fetch', vi.fn(function deferredFetch(): Promise<{ ok: boolean; json: () => Promise<Manifest> }> {
      return new Promise(function register(resolve): void {
        resolveManifest = resolve
      })
    }))

    new Function(SCRIPT)()
    setMediaSlotType()(SLOT, 'video')
    resolveManifest({ ok: true, json: (): Promise<Manifest> => Promise.resolve({ [SLOT]: { mediaType: 'image' } }) })
    await vi.advanceTimersByTimeAsync(0)

    const img: HTMLImageElement = document.querySelector('img')!
    expect(document.querySelector('video')).not.toBeNull()
    expect(img.getAttribute('data-airo-video-patched')).toBe('true')
    expect(img.style.display).toBe('none')
  })

  it('ignores an unknown kind rather than recording the slot as an image', async function bridgeIgnoresUnknownKind(): Promise<void> {
    document.body.innerHTML = '<div id="host"></div>'
    stubManifestFetch({})

    await runScript()
    setMediaSlotType()(SLOT, undefined)

    const host: HTMLElement = document.getElementById('host')!
    host.insertAdjacentHTML('beforeend', `<video src="/airo-assets/videos/${SLOT}"></video>`)
    await vi.advanceTimersByTimeAsync(0)

    expect(host.querySelector('video')).not.toBeNull()
    expect(host.querySelector('img')).toBeNull()
  })

  it('rejoins manifest synchronization once the manifest matches the committed kind', async function committedSlotRejoinsSync(): Promise<void> {
    document.body.innerHTML = `<div><img src="/airo-assets/images/${SLOT}" /></div>`
    ;(window as unknown as { __AIRO_DEV_MODE__: boolean }).__AIRO_DEV_MODE__ = true
    stubManifestFetch(
      { [SLOT]: { mediaType: 'image' } },
      { [SLOT]: { mediaType: 'video' } },
      { [SLOT]: { mediaType: 'image' } },
    )

    await runScript()
    setMediaSlotType()(SLOT, 'video')

    const host: HTMLElement = document.querySelector('div')!
    const img: HTMLImageElement = host.querySelector('img')!
    img.setAttribute('data-airo-video-patched', 'true')
    img.style.display = 'none'
    host.insertAdjacentHTML(
      'beforeend',
      `<video data-airo-video="" data-slot="${SLOT}" src="/airo-assets/videos/${SLOT}?_t=1"></video>`,
    )

    await vi.advanceTimersByTimeAsync(3000)
    expect(host.querySelector('video'), 'the poll that agrees with the commit must not disturb it').not.toBeNull()

    await vi.advanceTimersByTimeAsync(3000)
    expect(host.querySelector('video'), 'a later opposite-kind manifest update must apply').toBeNull()
    expect(img.hasAttribute('data-airo-video-patched')).toBe(false)
    expect(img.style.display).toBe('')
  })
})
