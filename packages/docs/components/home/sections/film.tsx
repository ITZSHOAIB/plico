"use client";

import {
  MediaCaptionsButton,
  MediaControlBar,
  MediaController,
  MediaFullscreenButton,
  MediaMuteButton,
  MediaPlayButton,
  MediaTimeDisplay,
  MediaTimeRange,
} from "media-chrome/react";
import { useRef } from "react";
import { report } from "../lib/status";
import { Figure, FigureHeader, Plate } from "../ui/figure";
import { Window } from "../ui/window";

/** The launch film in a desktop window. Click to play: it is narrated, so it never autoplays. */
export function Film() {
  const video = useRef<HTMLVideoElement>(null);
  // Media Chrome's own gesture layer only shows the controls on a tap; play or pause on any click or tap instead.
  const toggle = () => {
    const media = video.current;
    if (media) media.paused ? void media.play() : media.pause();
  };
  const said = (text: string) => () => {
    if (video.current) report(video.current, text);
  };
  return (
    <Figure id="film" label="Film" status="plico-launch.mp4 · 0:59">
      <FigureHeader
        plate={<Plate seq={1}>film · 0:59</Plate>}
        lede="An example ops agent in the local Studio: chat with it, approve a tool call, replay the run, review the file it wrote, run evals and check readiness."
      >
        See it run in <em>a minute</em>.
      </FigureHeader>
      <Window title="plico-launch.mp4" className="ph-film">
        <MediaController className="ph-player">
          <video
            ref={video}
            slot="media"
            // Media Chrome sets tabindex on its media before hydration
            suppressHydrationWarning
            playsInline
            preload="metadata"
            poster="/media/plico-launch.jpg"
            width={1920}
            height={1080}
            onPlay={said("playing plico-launch.mp4")}
            onPause={said("paused plico-launch.mp4")}
          >
            <source src="/media/plico-launch.mp4" type="video/mp4" />
            <track kind="captions" src="/media/plico-launch.en.vtt" srcLang="en" label="English" />
          </video>
          <div slot="gestures-chrome" className="ph-player-gestures" onClick={toggle} aria-hidden />
          <MediaPlayButton slot="centered-chrome" className="ph-player-big" />
          <MediaControlBar>
            <MediaPlayButton />
            <MediaTimeRange />
            <MediaTimeDisplay showDuration noToggle />
            <MediaMuteButton />
            <MediaCaptionsButton />
            <MediaFullscreenButton />
          </MediaControlBar>
        </MediaController>
      </Window>
    </Figure>
  );
}
