import { describe, expect, it } from "vitest";
import worker from "../public/_worker.js";

const video = new Uint8Array(Array.from({ length: 100 }, (_, i) => i));

const env = {
  ASSETS: {
    fetch: async (request: Request) =>
      new URL(request.url).pathname === "/media/film.mp4"
        ? new Response(video, { headers: { "content-type": "video/mp4" } })
        : new Response("missing", { status: 404 }),
  },
};

function get(path: string, headers: Record<string, string> = {}) {
  return worker.fetch(new Request(`https://plico.test${path}`, { headers }), env);
}

describe("media requests", () => {
  it("answers a byte range with 206 and only those bytes", async () => {
    const response = await get("/media/film.mp4", { range: "bytes=10-19" });

    expect(response.status).toBe(206);
    expect(response.headers.get("content-range")).toBe("bytes 10-19/100");
    expect(response.headers.get("content-type")).toBe("video/mp4");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(video.slice(10, 20));
  });

  it("answers an open-ended range to the end of the file", async () => {
    const response = await get("/media/film.mp4", { range: "bytes=95-" });

    expect(response.headers.get("content-range")).toBe("bytes 95-99/100");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(video.slice(95));
  });

  it("answers a suffix range with the last bytes", async () => {
    const response = await get("/media/film.mp4", { range: "bytes=-5" });

    expect(response.headers.get("content-range")).toBe("bytes 95-99/100");
  });

  it("rejects a range past the end with 416", async () => {
    const response = await get("/media/film.mp4", { range: "bytes=200-300" });

    expect(response.status).toBe(416);
    expect(response.headers.get("content-range")).toBe("bytes */100");
  });

  it("advertises range support on a full response", async () => {
    const response = await get("/media/film.mp4");

    expect(response.status).toBe(200);
    expect(response.headers.get("accept-ranges")).toBe("bytes");
  });
});
