"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  IAgoraRTCClient,
  IAgoraRTCRemoteUser,
  ICameraVideoTrack,
  ILocalVideoTrack,
  IMicrophoneAudioTrack,
} from "agora-rtc-sdk-ng";
import type { RtcCredentials } from "@/lib/interview";

/**
 * One-to-one Agora call. Screen sharing swaps the published camera track for
 * a screen track on the same client/uid, so a single token is enough.
 */
export function useAgoraCall() {
  const clientRef = useRef<IAgoraRTCClient | null>(null);
  const micRef = useRef<IMicrophoneAudioTrack | null>(null);
  const camRef = useRef<ICameraVideoTrack | null>(null);
  const screenRef = useRef<ILocalVideoTrack | null>(null);
  const localElRef = useRef<HTMLElement | null>(null);

  const [remoteUsers, setRemoteUsers] = useState<IAgoraRTCRemoteUser[]>([]);
  const [version, setVersion] = useState(0);
  const [joined, setJoined] = useState(false);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const playLocal = useCallback(() => {
    const el = localElRef.current;
    if (!el) return;
    if (screenRef.current) screenRef.current.play(el, { fit: "contain" });
    else camRef.current?.play(el, { fit: "cover" });
  }, []);

  const attachLocal = useCallback(
    (el: HTMLElement | null) => {
      localElRef.current = el;
      playLocal();
    },
    [playLocal]
  );

  const refreshRemote = useCallback(() => {
    setRemoteUsers([...(clientRef.current?.remoteUsers ?? [])]);
    setVersion((v) => v + 1);
  }, []);

  const join = useCallback(
    async (creds: RtcCredentials) => {
      setError(null);
      try {
        const AgoraRTC = (await import("agora-rtc-sdk-ng")).default;
        AgoraRTC.setLogLevel(3);
        const client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });
        clientRef.current = client;

        client.on("user-published", async (user, mediaType) => {
          await client.subscribe(user, mediaType);
          if (mediaType === "audio") user.audioTrack?.play();
          refreshRemote();
        });
        client.on("user-unpublished", refreshRemote);
        client.on("user-joined", refreshRemote);
        client.on("user-left", refreshRemote);

        await client.join(creds.appId, creds.channel, creds.token, creds.uid);

        const [mic, cam] = await AgoraRTC.createMicrophoneAndCameraTracks();
        micRef.current = mic;
        camRef.current = cam;
        await client.publish([mic, cam]);
        setMicOn(true);
        setCamOn(true);
        setJoined(true);
        playLocal();
        refreshRemote();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not join the call.");
        throw err;
      }
    },
    [playLocal, refreshRemote]
  );

  const toggleMic = useCallback(async () => {
    const mic = micRef.current;
    if (!mic) return;
    await mic.setEnabled(!mic.enabled);
    setMicOn(mic.enabled);
  }, []);

  const toggleCam = useCallback(async () => {
    const cam = camRef.current;
    if (!cam) return;
    await cam.setEnabled(!cam.enabled);
    setCamOn(cam.enabled);
  }, []);

  const stopScreenShare = useCallback(async () => {
    const client = clientRef.current;
    const screen = screenRef.current;
    if (!client || !screen) return;
    screenRef.current = null;
    await client.unpublish(screen).catch(() => {});
    screen.close();
    if (camRef.current) await client.publish(camRef.current);
    setSharing(false);
    playLocal();
  }, [playLocal]);

  const startScreenShare = useCallback(async () => {
    const client = clientRef.current;
    if (!client || screenRef.current) return;
    try {
      const AgoraRTC = (await import("agora-rtc-sdk-ng")).default;
      const screen = await AgoraRTC.createScreenVideoTrack({ encoderConfig: "1080p_1" }, "disable");
      if (camRef.current) await client.unpublish(camRef.current);
      await client.publish(screen);
      screenRef.current = screen;
      screen.on("track-ended", () => {
        void stopScreenShare();
      });
      setSharing(true);
      playLocal();
    } catch (err) {
      // User cancelling the browser's share picker is not an error worth showing.
      if (!(err instanceof Error) || !/permission|denied|cancel/i.test(err.message)) {
        setError(err instanceof Error ? err.message : "Could not share your screen.");
      }
    }
  }, [playLocal, stopScreenShare]);

  const leave = useCallback(async () => {
    screenRef.current?.close();
    screenRef.current = null;
    micRef.current?.close();
    camRef.current?.close();
    micRef.current = null;
    camRef.current = null;
    await clientRef.current?.leave().catch(() => {});
    clientRef.current = null;
    setRemoteUsers([]);
    setJoined(false);
    setSharing(false);
  }, []);

  useEffect(() => {
    return () => {
      screenRef.current?.close();
      micRef.current?.close();
      camRef.current?.close();
      void clientRef.current?.leave().catch(() => {});
    };
  }, []);

  const getLocalAudioTrack = useCallback(() => micRef.current?.getMediaStreamTrack() ?? null, []);

  return {
    join,
    leave,
    joined,
    remoteUsers,
    version,
    micOn,
    camOn,
    sharing,
    error,
    toggleMic,
    toggleCam,
    startScreenShare,
    stopScreenShare,
    attachLocal,
    getLocalAudioTrack,
  };
}

