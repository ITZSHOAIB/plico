import { Panel } from "./window";

/** The launch film. Click to play: it is narrated, so it never autoplays. */
export function FilmSection() {
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
        <video
          controls
          playsInline
          preload="none"
          poster="/media/plico-launch.jpg"
          width={1920}
          height={1080}
        >
          <source src="/media/plico-launch.mp4" type="video/mp4" />
          <track kind="captions" src="/media/plico-launch.en.vtt" srcLang="en" label="English" />
          <a href="/media/plico-launch.mp4">Download the launch film (MP4)</a>
        </video>
      </Panel>
    </section>
  );
}
