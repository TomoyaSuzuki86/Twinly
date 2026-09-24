import { useState } from "react";

const LAUNCH_VIDEO_SRC = "/assets/twinly-launch-v2.mp4";
const LAUNCH_FALLBACK_SRC = "/icons/icon-512-v7.png";

export function LaunchSplash() {
  const [videoFailed, setVideoFailed] = useState(false);
  const prefersReducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  const showVideo = !prefersReducedMotion && !videoFailed;

  return (
    <div
      className="grid min-h-[100dvh] place-items-center overflow-hidden bg-[#0A1E4A] px-4"
      aria-hidden="true"
    >
      {showVideo ? (
        <video
          src={LAUNCH_VIDEO_SRC}
          poster={LAUNCH_FALLBACK_SRC}
          autoPlay
          muted
          playsInline
          preload="auto"
          onError={() => setVideoFailed(true)}
          className="h-auto w-full max-w-[240px] object-contain"
        />
      ) : (
        <img
          src={LAUNCH_FALLBACK_SRC}
          alt=""
          className="h-auto w-40 max-w-[45vw] object-contain sm:w-48"
        />
      )}
    </div>
  );
}
