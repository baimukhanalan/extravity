import { describe, expect, it } from "vitest";
import { MAX_DIRECT_VIDEO_BYTES, videoPathname } from "@/app/api/parser/media/token/route";

describe("parser direct media upload grants", () => {
  const valid = {
    sourceAccount: "official_channel",
    sourcePostId: "12345",
    platformMediaId: "video-12345",
    checksum: "a".repeat(64),
  };

  it("limits each grant to one content-addressed video pathname", () => {
    expect(videoPathname(valid)).toBe(`opportunity-media/official_channel/12345/video-12345-${"a".repeat(12)}.mp4`);
    expect(MAX_DIRECT_VIDEO_BYTES).toBe(64 * 1024 * 1024);
  });

  it("rejects path traversal and invalid checksums", () => {
    expect(videoPathname({ ...valid, sourceAccount: "../private" })).toBeNull();
    expect(videoPathname({ ...valid, checksum: "a".repeat(12) })).toBeNull();
  });
});
