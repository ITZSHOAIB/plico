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
import { Panel } from "./window";

/** The launch film. Click to play: it is narrated, so it never autoplays. */
export function FilmSection() {
  const video = useRef<HTMLVideoElement>(null);
  // Media Chrome's own gesture layer only shows the controls on a tap; play or pause on any click or tap instead.
  const toggle = () => {
    const media = video.current;
    if (media) media.paused ? void media.play() : media.pause();
  };
  return (
    <section id="film" className="ph-section">
      <div className="ph-heading">
        <h2>
          See it run in <em>a minute</em>.
        </h2>
      </div>
      <p className="ph-section-lede">
        An example ops agent in the local Studio: chat with it, approve a tool call, replay the run,
        review the file it wrote, run evals and check readiness.
      </p>
      <Panel title="plico-launch.mp4" meta="0:59" className="ph-film">
        <MediaController className="ph-player">
          <video
            ref={video}
            slot="media"
            playsInline
            preload="none"
            poster="/media/plico-launch.jpg"
            width={1920}
            height={1080}
          >
            <source src="/media/plico-launch.mp4" type="video/mp4" />
            <track kind="captions" src="/media/plico-launch.en.vtt" srcLang="en" label="English" />
          </video>
          <div slot="gestures-chrome" className="ph-player-gestures" onClick={toggle} aria-hidden />
          <MediaPlayButton slot="centered-chrome" className="ph-player-big" />
          <MediaControlBar>
            <MediaPlayButton />
            <MediaTimeRange />
            <MediaTimeDisplay showDuration />
            <MediaMuteButton />
            <MediaCaptionsButton />
            <MediaFullscreenButton />
          </MediaControlBar>
        </MediaController>
      </Panel>
    </section>
  );
}
