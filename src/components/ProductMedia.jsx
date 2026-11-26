import { useEffect, useRef, useState } from "react";

/**
 * Media for a catalogue item, filling the positioned parent it is dropped into.
 *
 * Card (`preview`): a video is shown as a still — its first frame, or the
 * declared `poster` — with no controls and no badge. The card's play button
 * opens the viewer.
 *
 * Viewer: the clip plays with its native controls and **with sound** when
 * `audio` is set, which is what the card's play button asks for. It opens from a
 * click, so browsers count playback as user-initiated and allow audio. If one
 * refuses anyway, playback falls back to muted rather than stopping, and the
 * visitor can unmute with the volume control.
 */
export default function ProductMedia({ item, preview = false, audio = false }) {
  const [failed, setFailed] = useState(false);
  const [muted, setMuted] = useState(true);
  const videoRef = useRef(null);

  const isVideo = item.media?.type === "video";
  const poster = item.poster;
  const contain = "absolute inset-0 h-full w-full object-contain";
  const cover = "absolute inset-0 h-full w-full object-cover";

  // Ask for sound on mount: React does not update the `muted` DOM property
  // reliably, so it is set directly, and the promise tells us whether the
  // browser blocked it (then we keep the muted autoplay instead).
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !audio) return;

    video.muted = false;
    setMuted(false);

    const attempt = video.play?.();
    if (attempt && typeof attempt.catch === "function") {
      attempt.catch(() => {
        video.muted = true;
        setMuted(true);
        video.play?.().catch(() => {});
      });
    }
  }, [audio]);

  // Card still: no autoplay, no controls, no play badge.
  if (isVideo && preview && !failed) {
    return (
      <div className="absolute inset-0 overflow-hidden bg-[#1b2a52]">
        <video
          data-testid="product-video-still"
          className={poster ? cover : contain}
          src={item.media.src}
          poster={poster}
          muted
          playsInline
          preload="metadata"
          aria-label={item.title}
          onError={() => setFailed(true)}
        />
      </div>
    );
  }

  // Viewer: the clip plays with its native controls (pause, seek, volume) and
  // with sound. `object-contain` with max sizing keeps the element at or below
  // its box on every engine.
  if (isVideo && !failed) {
    return (
      <video
        ref={videoRef}
        data-testid="product-video"
        className="max-h-full max-w-full object-contain"
        src={item.media.src}
        poster={poster}
        muted={muted}
        loop
        playsInline
        autoPlay
        controls
        controlsList="nodownload"
        preload="metadata"
        aria-label={item.title}
        onError={() => setFailed(true)}
      />
    );
  }

  if (item.media?.type === "image" && !failed) {
    return (
      <img
        data-testid="product-image"
        className={contain}
        src={item.media.src}
        alt={item.title}
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <div
      data-testid="media-placeholder"
      className="absolute inset-0 bg-gradient-to-br from-[#2f5cb5] via-[#264F9E] to-[#26348C]"
    >
      <span className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm font-medium text-white/85">
        {item.title}
      </span>
    </div>
  );
}
