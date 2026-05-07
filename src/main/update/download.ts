import { createWriteStream, existsSync, mkdirSync, renameSync, rmSync, statSync } from "node:fs";
import { get as httpGet, type IncomingMessage } from "node:http";
import { get as httpsGet } from "node:https";
import { basename, dirname, extname, join } from "node:path";
import type { UpdateDownloadProgress, UpdateReleaseAsset } from "@shared/update";

export type FileDownloader = (params: {
  url: string;
  tempPath: string;
  onProgress: (
    progress: Pick<UpdateDownloadProgress, "downloadedBytes" | "totalBytes">
  ) => void;
}) => Promise<void>;

export type DownloadResult = {
  filePath: string;
  reused: boolean;
};

type ResolveDownloadTargetParams = {
  downloadsDir: string;
  asset: UpdateReleaseAsset;
};

type DownloadReleaseAssetParams = ResolveDownloadTargetParams & {
  downloader?: FileDownloader;
  onProgress?: FileDownloader extends (params: infer Params) => Promise<void>
    ? Params extends { onProgress: infer OnProgress }
      ? OnProgress
      : never
    : never;
};

type DownloadUrlToFileParams = {
  url: string;
  tempPath: string;
  onProgress: (progress: Pick<UpdateDownloadProgress, "downloadedBytes" | "totalBytes">) => void;
  redirectCount?: number;
};

const DOWNLOAD_TIMEOUT_MS = 120_000;
const LOOPBACK_HTTP_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

export function resolveDownloadTarget({ downloadsDir, asset }: ResolveDownloadTargetParams): {
  finalPath: string;
  tempPath: string;
} {
  if (basename(asset.name) !== asset.name || asset.name === "." || asset.name === "..") {
    throw new Error("Release asset filename must not include path separators");
  }

  const finalPath = join(downloadsDir, asset.name);
  return {
    finalPath,
    tempPath: `${finalPath}.download`,
  };
}

function isReusableFile(path: string, expectedSize: number | null): boolean {
  if (!existsSync(path)) return false;

  const stat = statSync(path);
  if (!stat.isFile()) return false;

  const size = stat.size;
  if (expectedSize !== null && expectedSize > 0) {
    return size === expectedSize;
  }

  return size > 0;
}

function resolveCollisionFreePath(finalPath: string): string {
  if (!existsSync(finalPath)) return finalPath;

  const extension = extname(finalPath);
  const stem = finalPath.slice(0, finalPath.length - extension.length);

  for (let index = 1; index < Number.MAX_SAFE_INTEGER; index += 1) {
    const candidate = `${stem} (${index})${extension}`;
    if (!existsSync(candidate)) return candidate;
  }

  throw new Error("Could not find an available download filename");
}

function assertAllowedDownloadUrl(parsedUrl: URL): void {
  if (parsedUrl.protocol === "https:") return;

  if (parsedUrl.protocol === "http:") {
    if (LOOPBACK_HTTP_HOSTS.has(parsedUrl.hostname)) return;
    throw new Error("Download URL must use HTTPS");
  }
}

function getContentLength(response: IncomingMessage): number | null {
  const value = response.headers["content-length"];
  if (typeof value !== "string") return null;

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function getDownloadedChunkSize(chunk: Buffer | string): number {
  return typeof chunk === "string" ? Buffer.byteLength(chunk) : chunk.length;
}

export async function downloadUrlToFile({
  url,
  tempPath,
  onProgress,
  redirectCount = 0,
}: DownloadUrlToFileParams): Promise<void> {
  if (redirectCount > 5) {
    throw new Error("Too many redirects while downloading release asset");
  }

  const parsedUrl = new URL(url);
  assertAllowedDownloadUrl(parsedUrl);

  const get = parsedUrl.protocol === "https:" ? httpsGet : parsedUrl.protocol === "http:" ? httpGet : null;

  if (!get) {
    throw new Error(`Unsupported download protocol: ${parsedUrl.protocol}`);
  }

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const resolveOnce = (): void => {
      if (settled) return;
      settled = true;
      resolve();
    };
    const rejectOnce = (error: Error): void => {
      if (settled) return;
      settled = true;
      reject(error);
    };

    const request = get(parsedUrl, (response) => {
      const status = response.statusCode ?? 0;
      response.on("error", rejectOnce);

      if (status >= 300 && status < 400 && response.headers.location) {
        response.resume();
        const redirectUrl = new URL(response.headers.location, parsedUrl).toString();
        downloadUrlToFile({
          url: redirectUrl,
          tempPath,
          onProgress,
          redirectCount: redirectCount + 1,
        }).then(resolveOnce, rejectOnce);
        return;
      }

      if (status < 200 || status >= 300) {
        response.resume();
        rejectOnce(new Error(`Download failed with status ${status}`));
        return;
      }

      const totalBytes = getContentLength(response);
      let downloadedBytes = 0;
      const file = createWriteStream(tempPath);

      response.on("data", (chunk: Buffer | string) => {
        downloadedBytes += getDownloadedChunkSize(chunk);
        onProgress({ downloadedBytes, totalBytes });
      });

      response.on("error", (error) => {
        file.destroy();
        rejectOnce(error);
      });
      file.on("error", (error) => {
        response.destroy(error);
        rejectOnce(error);
      });
      file.on("finish", () => {
        file.close((error) => {
          if (error) {
            rejectOnce(error);
            return;
          }
          resolveOnce();
        });
      });

      response.pipe(file);
    });

    request.setTimeout(DOWNLOAD_TIMEOUT_MS, () => {
      request.destroy(new Error("Download timed out"));
    });
    request.on("error", rejectOnce);
  });
}

export async function downloadReleaseAsset({
  downloadsDir,
  asset,
  downloader = downloadUrlToFile,
  onProgress = () => {},
}: DownloadReleaseAssetParams): Promise<DownloadResult> {
  const target = resolveDownloadTarget({ downloadsDir, asset });
  mkdirSync(dirname(target.finalPath), { recursive: true });

  if (isReusableFile(target.finalPath, asset.size)) {
    return { filePath: target.finalPath, reused: true };
  }

  const finalPath = resolveCollisionFreePath(target.finalPath);
  const tempPath = `${finalPath}.download`;
  rmSync(tempPath, { force: true });

  try {
    await downloader({
      url: asset.browserDownloadUrl,
      tempPath,
      onProgress,
    });

    const downloadedSize = statSync(tempPath).size;
    if (asset.size !== null && asset.size > 0) {
      if (downloadedSize !== asset.size) {
        throw new Error("Downloaded file size did not match release asset size");
      }
    } else if (downloadedSize === 0) {
      throw new Error("Downloaded file was empty");
    }

    if (existsSync(finalPath)) {
      throw new Error("Download target already exists");
    }

    renameSync(tempPath, finalPath);
    return { filePath: finalPath, reused: false };
  } catch (error) {
    rmSync(tempPath, { force: true });
    throw error;
  }
}
