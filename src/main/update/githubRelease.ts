import { err, ok, type Result } from "@shared/result";
import type { UpdateError, UpdateInfo, UpdateReleaseAsset } from "@shared/update";
import { compareVersions, isVersionGreater, parseVersion } from "./version";

export type GitHubReleaseAsset = UpdateReleaseAsset;

export type GitHubRelease = {
  tagName: string;
  name: string | null;
  htmlUrl: string;
  draft: boolean;
  prerelease: boolean;
  publishedAt: string | null;
  assets: GitHubReleaseAsset[];
};

type FetchResponseLike = {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
};

type FetchLike = (
  url: string,
  init?: { headers?: Record<string, string> }
) => Promise<FetchResponseLike>;

type FetchGitHubReleasesParams = {
  owner: string;
  repo: string;
  fetchImpl?: FetchLike;
};

type SelectLatestUpdateParams = {
  releases: GitHubRelease[];
  currentVersion: string;
};

type UnknownRecord = Record<string, unknown>;

const PRERELEASE_TAG_RE = /^v?\d+\.\d+\.\d+-/;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function booleanOrNull(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function normalizeAsset(value: unknown): GitHubReleaseAsset | null {
  if (!isRecord(value)) return null;

  const name = stringOrNull(value.name);
  const browserDownloadUrl = stringOrNull(value.browser_download_url);
  if (!name || !browserDownloadUrl) return null;

  return {
    name,
    browserDownloadUrl,
    size: numberOrNull(value.size),
    contentType: stringOrNull(value.content_type),
  };
}

function normalizeRelease(value: unknown): GitHubRelease | null {
  if (!isRecord(value)) return null;

  const tagName = stringOrNull(value.tag_name);
  const htmlUrl = stringOrNull(value.html_url);
  const draft = booleanOrNull(value.draft);
  const prerelease = booleanOrNull(value.prerelease);
  if (!tagName || !htmlUrl || draft === null || prerelease === null) return null;

  const assets = Array.isArray(value.assets)
    ? value.assets.flatMap((asset) => {
        const normalized = normalizeAsset(asset);
        return normalized ? [normalized] : [];
      })
    : [];

  return {
    tagName,
    name: stringOrNull(value.name),
    htmlUrl,
    draft,
    prerelease,
    publishedAt: stringOrNull(value.published_at),
    assets,
  };
}

function requestFailed(message: string): Result<GitHubRelease[], UpdateError> {
  return err({ kind: "request-failed", message });
}

function hasPrereleaseTagSuffix(tagName: string): boolean {
  return PRERELEASE_TAG_RE.test(tagName.trim());
}

function findArm64DmgAsset(release: GitHubRelease): GitHubReleaseAsset | undefined {
  return release.assets.find((candidate) => {
    const name = candidate.name.toLowerCase();
    return name.endsWith(".dmg") && name.includes("arm64");
  });
}

export async function fetchGitHubReleases({
  owner,
  repo,
  fetchImpl = fetch as FetchLike,
}: FetchGitHubReleasesParams): Promise<Result<GitHubRelease[], UpdateError>> {
  try {
    const response = await fetchImpl(`https://api.github.com/repos/${owner}/${repo}/releases`, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "Sexy-Worktree-Updater",
      },
    });

    if (!response.ok) {
      if (response.status === 403) {
        return err({
          kind: "rate-limited",
          message: "GitHub release request was rate limited",
        });
      }

      return requestFailed(`GitHub release request failed with status ${response.status}`);
    }

    const payload = await response.json();
    if (!Array.isArray(payload)) {
      return err({
        kind: "invalid-response",
        message: "GitHub release response was not an array",
      });
    }

    const releases: GitHubRelease[] = [];
    for (const item of payload) {
      const release = normalizeRelease(item);
      if (!release) {
        return err({
          kind: "invalid-response",
          message: "GitHub release response contained an invalid release",
        });
      }
      releases.push(release);
    }

    return ok(releases);
  } catch (error) {
    return requestFailed(error instanceof Error ? error.message : "GitHub release request failed");
  }
}

export function selectLatestUpdate({
  releases,
  currentVersion,
}: SelectLatestUpdateParams): Result<UpdateInfo | null, UpdateError> {
  const parsedCurrent = parseVersion(currentVersion);
  if (!parsedCurrent) {
    return err({
      kind: "invalid-version",
      message: `Invalid current version: ${currentVersion}`,
    });
  }

  const candidates = releases
    .flatMap((release) => {
      if (release.draft || release.prerelease || hasPrereleaseTagSuffix(release.tagName)) return [];

      const parsedVersion = parseVersion(release.tagName);
      if (!parsedVersion || !isVersionGreater(parsedVersion.version, parsedCurrent.version)) {
        return [];
      }

      return [{ release, version: parsedVersion.version }];
    })
    .sort((a, b) => compareVersions(b.version, a.version));

  const highestCandidate = candidates[0];
  if (!highestCandidate) return ok(null);

  const selected = candidates.find((candidate) => findArm64DmgAsset(candidate.release));

  if (!selected) {
    return err({
      kind: "asset-missing",
      message: `No arm64 DMG asset found for ${highestCandidate.release.tagName}`,
    });
  }

  const asset = findArm64DmgAsset(selected.release);
  if (!asset) {
    return err({
      kind: "asset-missing",
      message: `No arm64 DMG asset found for ${selected.release.tagName}`,
    });
  }

  return ok({
    version: selected.version,
    tagName: selected.release.tagName,
    releaseName: selected.release.name,
    htmlUrl: selected.release.htmlUrl,
    publishedAt: selected.release.publishedAt,
    asset,
  });
}
