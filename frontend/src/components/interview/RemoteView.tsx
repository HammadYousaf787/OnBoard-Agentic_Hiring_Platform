"use client";

import { useEffect, useRef } from "react";
import type { IAgoraRTCRemoteUser } from "agora-rtc-sdk-ng";

/** Plays a remote participant's video into a div. `version` forces a re-play when tracks change. */
export function RemoteView({
  user,
  version,
  className,
}: {
  user: IAgoraRTCRemoteUser;
  version: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ref.current && user.videoTrack) user.videoTrack.play(ref.current, { fit: "contain" });
  }, [user, user.videoTrack, version]);

  return <div ref={ref} data-testid="remote-video" className={className} />;
}
