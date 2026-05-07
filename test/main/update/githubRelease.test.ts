import { describe, expect, it, vi } from "vitest";
import { err, ok } from "@shared/result";
import {
  fetchGitHubReleases,
  selectLatestUpdate,
  type GitHubRelease,
} from "@main/update/githubRelease";

function release(overrides: Partial<GitHubRelease>): GitHubRelease {
  return {
    tagName: "v1.0.1",
    name: "Sexy Worktree v1.0.1",
    htmlUrl: "https://github.com/imkdw/sexy-worktree/releases/tag/v1.0.1",
    draft: false,
    prerelease: false,
    publishedAt: "2026-05-07T00:00:00Z",
    assets: [
      {
        name: "Sexy Worktree-1.0.1-arm64.dmg",
        browserDownloadUrl:
          "https://github.com/imkdw/sexy-worktree/releases/download/v1.0.1/app.dmg",
        size: 123,
        contentType: "application/x-apple-diskimage",
      },
    ],
    ...overrides,
  };
}

describe("selectLatestUpdate", () => {
  it("selects the highest stable release greater than the current version", () => {
    const result = selectLatestUpdate({
      currentVersion: "1.0.0",
      releases: [
        release({ tagName: "v1.0.1" }),
        release({
          tagName: "v1.0.2",
          name: "Sexy Worktree v1.0.2",
          htmlUrl: "https://github.com/imkdw/sexy-worktree/releases/tag/v1.0.2",
          assets: [
            {
              name: "Sexy Worktree-1.0.2-arm64.dmg",
              browserDownloadUrl: "https://example.com/v1.0.2.dmg",
              size: 456,
              contentType: "application/x-apple-diskimage",
            },
          ],
        }),
      ],
    });

    expect(result).toEqual(
      ok({
        version: "1.0.2",
        tagName: "v1.0.2",
        releaseName: "Sexy Worktree v1.0.2",
        htmlUrl: "https://github.com/imkdw/sexy-worktree/releases/tag/v1.0.2",
        publishedAt: "2026-05-07T00:00:00Z",
        asset: {
          name: "Sexy Worktree-1.0.2-arm64.dmg",
          browserDownloadUrl: "https://example.com/v1.0.2.dmg",
          size: 456,
          contentType: "application/x-apple-diskimage",
        },
      })
    );
  });

  it("ignores draft, prerelease, malformed, and non-newer releases", () => {
    const result = selectLatestUpdate({
      currentVersion: "1.0.0",
      releases: [
        release({ tagName: "v2.0.0", draft: true }),
        release({ tagName: "v1.5.0", prerelease: true }),
        release({ tagName: "latest" }),
        release({ tagName: "v1.0.0" }),
      ],
    });

    expect(result).toEqual(ok(null));
  });

  it("selects the highest compatible release when a newer release has no arm64 DMG", () => {
    const result = selectLatestUpdate({
      currentVersion: "1.0.0",
      releases: [
        release({
          tagName: "v1.0.3",
          name: "Sexy Worktree v1.0.3",
          htmlUrl: "https://github.com/imkdw/sexy-worktree/releases/tag/v1.0.3",
          assets: [
            {
              name: "Sexy Worktree-1.0.3-x64.zip",
              browserDownloadUrl: "https://example.com/v1.0.3.zip",
              size: 789,
              contentType: "application/zip",
            },
          ],
        }),
        release({
          tagName: "v1.0.2",
          name: "Sexy Worktree v1.0.2",
          htmlUrl: "https://github.com/imkdw/sexy-worktree/releases/tag/v1.0.2",
          assets: [
            {
              name: "Sexy Worktree-1.0.2-arm64.dmg",
              browserDownloadUrl: "https://example.com/v1.0.2.dmg",
              size: 456,
              contentType: "application/x-apple-diskimage",
            },
          ],
        }),
      ],
    });

    expect(result).toEqual(
      ok({
        version: "1.0.2",
        tagName: "v1.0.2",
        releaseName: "Sexy Worktree v1.0.2",
        htmlUrl: "https://github.com/imkdw/sexy-worktree/releases/tag/v1.0.2",
        publishedAt: "2026-05-07T00:00:00Z",
        asset: {
          name: "Sexy Worktree-1.0.2-arm64.dmg",
          browserDownloadUrl: "https://example.com/v1.0.2.dmg",
          size: 456,
          contentType: "application/x-apple-diskimage",
        },
      })
    );
  });

  it("ignores prerelease-looking tags even when the prerelease flag is false", () => {
    const result = selectLatestUpdate({
      currentVersion: "1.0.0",
      releases: [
        release({
          tagName: "v1.1.0-beta.1",
          name: "Sexy Worktree v1.1.0-beta.1",
          htmlUrl: "https://github.com/imkdw/sexy-worktree/releases/tag/v1.1.0-beta.1",
          prerelease: false,
        }),
      ],
    });

    expect(result).toEqual(ok(null));
  });

  it("returns a typed error when a newer release has no arm64 DMG", () => {
    const result = selectLatestUpdate({
      currentVersion: "1.0.0",
      releases: [
        release({
          tagName: "v1.0.1",
          assets: [
            {
              name: "Sexy Worktree-1.0.1-x64.zip",
              browserDownloadUrl: "https://example.com/app.zip",
              size: 111,
              contentType: "application/zip",
            },
          ],
        }),
      ],
    });

    expect(result).toEqual(
      err({
        kind: "asset-missing",
        message: "No arm64 DMG asset found for v1.0.1",
      })
    );
  });
});

describe("fetchGitHubReleases", () => {
  it("normalizes GitHub release API data", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [
        {
          tag_name: "v1.0.1",
          name: "Release",
          html_url: "https://github.com/imkdw/sexy-worktree/releases/tag/v1.0.1",
          draft: false,
          prerelease: false,
          published_at: "2026-05-07T00:00:00Z",
          assets: [
            {
              name: "Sexy Worktree-1.0.1-arm64.dmg",
              browser_download_url: "https://example.com/app.dmg",
              size: 123,
              content_type: "application/x-apple-diskimage",
            },
          ],
        },
      ],
    });

    await expect(
      fetchGitHubReleases({ owner: "imkdw", repo: "sexy-worktree", fetchImpl })
    ).resolves.toEqual(
      ok([
        {
          tagName: "v1.0.1",
          name: "Release",
          htmlUrl: "https://github.com/imkdw/sexy-worktree/releases/tag/v1.0.1",
          draft: false,
          prerelease: false,
          publishedAt: "2026-05-07T00:00:00Z",
          assets: [
            {
              name: "Sexy Worktree-1.0.1-arm64.dmg",
              browserDownloadUrl: "https://example.com/app.dmg",
              size: 123,
              contentType: "application/x-apple-diskimage",
            },
          ],
        },
      ])
    );
  });

  it("returns rate-limited errors for HTTP 403", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({}),
    });

    await expect(
      fetchGitHubReleases({ owner: "imkdw", repo: "sexy-worktree", fetchImpl })
    ).resolves.toEqual(
      err({
        kind: "rate-limited",
        message: "GitHub release request was rate limited",
      })
    );
  });
});
