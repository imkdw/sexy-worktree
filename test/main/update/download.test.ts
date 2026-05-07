import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  downloadUrlToFile,
  downloadReleaseAsset,
  resolveDownloadTarget,
  type FileDownloader,
} from "@main/update/download";
import type { UpdateReleaseAsset } from "@shared/update";

let dir: string;
let servers: Server[];

const asset: UpdateReleaseAsset = {
  name: "Sexy Worktree-1.0.1-arm64.dmg",
  browserDownloadUrl: "https://example.com/app.dmg",
  size: 5,
  contentType: "application/x-apple-diskimage",
};

beforeEach(() => {
  dir = join(tmpdir(), `sexy-worktree-update-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  servers = [];
});

afterEach(async () => {
  await Promise.all(
    servers.map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.close((error) => {
            if (error) {
              reject(error);
              return;
            }
            resolve();
          });
        })
    )
  );
  rmSync(dir, { recursive: true, force: true });
});

async function listen(server: Server): Promise<string> {
  servers.push(server);

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

describe("resolveDownloadTarget", () => {
  it("uses the asset filename for final and temporary paths", () => {
    expect(resolveDownloadTarget({ downloadsDir: dir, asset })).toEqual({
      finalPath: join(dir, "Sexy Worktree-1.0.1-arm64.dmg"),
      tempPath: join(dir, "Sexy Worktree-1.0.1-arm64.dmg.download"),
    });
  });

  it.each([".", ".."])("rejects reserved asset filename %s", (name) => {
    expect(() => resolveDownloadTarget({ downloadsDir: dir, asset: { ...asset, name } })).toThrow(
      "Release asset filename must not include path separators"
    );
  });
});

describe("downloadReleaseAsset", () => {
  it("rejects unsafe asset names and does not write outside the downloads directory", async () => {
    const unsafeAsset = { ...asset, name: "../escape.dmg" };
    const outsidePath = join(dir, "..", "escape.dmg");
    const outsideTempPath = `${outsidePath}.download`;
    let thrown: unknown;
    let wroteOutside = false;

    try {
      await downloadReleaseAsset({
        downloadsDir: dir,
        asset: unsafeAsset,
        downloader: async ({ tempPath }) => {
          writeFileSync(tempPath, "12345");
        },
      });
    } catch (error) {
      thrown = error;
    } finally {
      wroteOutside = existsSync(outsidePath) || existsSync(outsideTempPath);
      rmSync(outsidePath, { force: true });
      rmSync(outsideTempPath, { force: true });
    }

    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toBe("Release asset filename must not include path separators");
    expect(wroteOutside).toBe(false);
  });

  it("reuses an existing complete DMG", async () => {
    const finalPath = join(dir, asset.name);
    writeFileSync(finalPath, "12345");
    const downloader: FileDownloader = vi.fn();

    await expect(downloadReleaseAsset({ downloadsDir: dir, asset, downloader })).resolves.toEqual({
      filePath: finalPath,
      reused: true,
    });
    expect(downloader).not.toHaveBeenCalled();
  });

  it("writes to a temporary file and renames it after success", async () => {
    const progress: Array<{ downloadedBytes: number; totalBytes: number | null }> = [];
    const downloader: FileDownloader = vi.fn(async ({ tempPath, onProgress }) => {
      writeFileSync(tempPath, "12345");
      onProgress({ downloadedBytes: 5, totalBytes: 5 });
    });

    const result = await downloadReleaseAsset({
      downloadsDir: dir,
      asset,
      downloader,
      onProgress: (event) => progress.push(event),
    });

    expect(result).toEqual({ filePath: join(dir, asset.name), reused: false });
    expect(readFileSync(result.filePath, "utf8")).toBe("12345");
    expect(existsSync(`${result.filePath}.download`)).toBe(false);
    expect(progress).toEqual([{ downloadedBytes: 5, totalBytes: 5 }]);
  });

  it("keeps an existing wrong-sized final file after failed downloads", async () => {
    const finalPath = join(dir, asset.name);
    writeFileSync(finalPath, "1");

    const downloader: FileDownloader = vi.fn(async ({ tempPath }) => {
      writeFileSync(tempPath, "12");
      throw new Error("network down");
    });

    await expect(downloadReleaseAsset({ downloadsDir: dir, asset, downloader })).rejects.toThrow(
      "network down"
    );
    expect(downloader).toHaveBeenCalled();
    expect(readFileSync(finalPath, "utf8")).toBe("1");
    expect(existsSync(join(dir, "Sexy Worktree-1.0.1-arm64 (1).dmg.download"))).toBe(false);
  });

  it("writes successful downloads to a collision-free sibling when the base final file exists", async () => {
    const finalPath = join(dir, asset.name);
    const siblingPath = join(dir, "Sexy Worktree-1.0.1-arm64 (1).dmg");
    writeFileSync(finalPath, "1");

    const downloader: FileDownloader = vi.fn(async ({ tempPath }) => {
      expect(tempPath).toBe(`${siblingPath}.download`);
      writeFileSync(tempPath, "12345");
    });

    await expect(downloadReleaseAsset({ downloadsDir: dir, asset, downloader })).resolves.toEqual({
      filePath: siblingPath,
      reused: false,
    });
    expect(readFileSync(finalPath, "utf8")).toBe("1");
    expect(readFileSync(siblingPath, "utf8")).toBe("12345");
    expect(existsSync(`${siblingPath}.download`)).toBe(false);
  });

  it("does not overwrite a target that appears before rename", async () => {
    const finalPath = join(dir, asset.name);
    const downloader: FileDownloader = vi.fn(async ({ tempPath }) => {
      writeFileSync(tempPath, "12345");
      writeFileSync(finalPath, "user");
    });

    await expect(downloadReleaseAsset({ downloadsDir: dir, asset, downloader })).rejects.toThrow(
      "Download target already exists"
    );
    expect(readFileSync(finalPath, "utf8")).toBe("user");
    expect(existsSync(`${finalPath}.download`)).toBe(false);
  });

  it("rejects downloads whose byte size does not match the release asset", async () => {
    const downloader: FileDownloader = vi.fn(async ({ tempPath }) => {
      writeFileSync(tempPath, "12");
    });

    await expect(downloadReleaseAsset({ downloadsDir: dir, asset, downloader })).rejects.toThrow(
      "Downloaded file size did not match release asset size"
    );
    expect(existsSync(join(dir, asset.name))).toBe(false);
  });

  it("uses a non-empty file when GitHub does not provide an asset size", async () => {
    const finalPath = join(dir, asset.name);
    writeFileSync(finalPath, "1");

    await expect(
      downloadReleaseAsset({
        downloadsDir: dir,
        asset: { ...asset, size: null },
        downloader: vi.fn(),
      })
    ).resolves.toEqual({ filePath: finalPath, reused: true });
    expect(statSync(finalPath).size).toBe(1);
  });

  it("does not reuse an existing directory as an unknown-size download", async () => {
    const directoryAsset = { ...asset, name: "ExistingDirectory.dmg", size: null };
    const finalPath = join(dir, directoryAsset.name);
    mkdirSync(finalPath);
    const downloader: FileDownloader = vi.fn(async () => {
      throw new Error("directory was not reused");
    });

    await expect(
      downloadReleaseAsset({
        downloadsDir: dir,
        asset: directoryAsset,
        downloader,
      })
    ).rejects.toThrow();
    expect(downloader).toHaveBeenCalled();
  });

  it("rejects unknown-size fresh downloads when the downloaded file is empty", async () => {
    const finalPath = join(dir, asset.name);
    const downloader: FileDownloader = vi.fn(async ({ tempPath }) => {
      writeFileSync(tempPath, "");
    });

    await expect(
      downloadReleaseAsset({
        downloadsDir: dir,
        asset: { ...asset, size: null },
        downloader,
      })
    ).rejects.toThrow("Downloaded file was empty");
    expect(existsSync(finalPath)).toBe(false);
    expect(existsSync(`${finalPath}.download`)).toBe(false);
  });
});

describe("downloadUrlToFile", () => {
  it("rejects non-loopback HTTP download URLs before network use", async () => {
    await expect(
      downloadUrlToFile({
        url: "http://example.com/app.dmg",
        tempPath: join(dir, "plain-http.dmg.download"),
        onProgress: () => {},
      })
    ).rejects.toThrow("Download URL must use HTTPS");
    expect(existsSync(join(dir, "plain-http.dmg.download"))).toBe(false);
  });

  it("streams a successful response to disk and reports content-length progress", async () => {
    const server = createServer((request, response) => {
      if (request.url === "/app.dmg") {
        response.writeHead(200, { "content-length": "5" });
        response.write("12");
        response.end("345");
        return;
      }

      response.writeHead(404);
      response.end();
    });
    const baseUrl = await listen(server);
    const tempPath = join(dir, "streamed.dmg.download");
    const progress: Array<{ downloadedBytes: number; totalBytes: number | null }> = [];

    await downloadUrlToFile({
      url: `${baseUrl}/app.dmg`,
      tempPath,
      onProgress: (event) => progress.push(event),
    });

    expect(readFileSync(tempPath, "utf8")).toBe("12345");
    expect(progress.at(-1)).toEqual({ downloadedBytes: 5, totalBytes: 5 });
  });

  it("follows relative redirects", async () => {
    const server = createServer((request, response) => {
      if (request.url === "/redirect") {
        response.writeHead(302, { location: "/asset" });
        response.end();
        return;
      }

      if (request.url === "/asset") {
        response.writeHead(200, { "content-length": "5" });
        response.end("12345");
        return;
      }

      response.writeHead(404);
      response.end();
    });
    const baseUrl = await listen(server);
    const tempPath = join(dir, "redirected.dmg.download");

    await downloadUrlToFile({
      url: `${baseUrl}/redirect`,
      tempPath,
      onProgress: () => {},
    });

    expect(readFileSync(tempPath, "utf8")).toBe("12345");
  });

  it("rejects redirects to non-loopback HTTP download URLs", async () => {
    const server = createServer((request, response) => {
      if (request.url === "/redirect") {
        response.writeHead(302, { location: "http://example.com/app.dmg" });
        response.end();
        return;
      }

      response.writeHead(404);
      response.end();
    });
    const baseUrl = await listen(server);

    await expect(
      downloadUrlToFile({
        url: `${baseUrl}/redirect`,
        tempPath: join(dir, "redirected-plain-http.dmg.download"),
        onProgress: () => {},
      })
    ).rejects.toThrow("Download URL must use HTTPS");
    expect(existsSync(join(dir, "redirected-plain-http.dmg.download"))).toBe(false);
  });

  it("rejects non-2xx responses", async () => {
    const server = createServer((_request, response) => {
      response.writeHead(503);
      response.end("unavailable");
    });
    const baseUrl = await listen(server);

    await expect(
      downloadUrlToFile({
        url: `${baseUrl}/app.dmg`,
        tempPath: join(dir, "failed.dmg.download"),
        onProgress: () => {},
      })
    ).rejects.toThrow("Download failed with status 503");
  });
});
