/**
 * Output abstraction for the export pipeline.
 *
 * Implementation 1 ({@link FsAccessFileWriter}) streams bytes straight to disk
 * through the File System Access API's `FileSystemWritableFileStream`, so the
 * full export never resides in memory.
 *
 * Implementation 2 ({@link BlobFileWriter}) is the fallback for browsers without
 * the API: it accumulates bytes and triggers a Blob download on close, warning
 * once accumulation crosses {@link FALLBACK_MEMORY_LIMIT}.
 */

import { FALLBACK_MEMORY_LIMIT } from "@/types/export";

export interface FileWriter {
  write(chunk: Uint8Array): Promise<void>;
  /** Finalise the file (close stream / trigger download). */
  close(): Promise<void>;
  /** Abort without finalising; discards buffered/streamed data where possible. */
  abort(reason?: unknown): Promise<void>;
  readonly bytesWritten: number;
  readonly usedFallback: boolean;
}

// --- Minimal File System Access API typings (not in the default DOM lib) ---

interface FileSystemWritableFileStreamLike {
  write(data: BufferSource): Promise<void>;
  close(): Promise<void>;
  abort?(reason?: unknown): Promise<void>;
}

interface FileSystemFileHandleLike {
  createWritable(options?: {
    keepExistingData?: boolean;
  }): Promise<FileSystemWritableFileStreamLike>;
}

interface SaveFilePickerOptions {
  suggestedName?: string;
  types?: { description?: string; accept: Record<string, string[]> }[];
}

type ShowSaveFilePicker = (
  options?: SaveFilePickerOptions
) => Promise<FileSystemFileHandleLike>;

export function isFileSystemAccessSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof (window as unknown as { showSaveFilePicker?: ShowSaveFilePicker })
      .showSaveFilePicker === "function"
  );
}

class FsAccessFileWriter implements FileWriter {
  readonly usedFallback = false;
  private _bytesWritten = 0;

  constructor(private readonly stream: FileSystemWritableFileStreamLike) {}

  get bytesWritten(): number {
    return this._bytesWritten;
  }

  async write(chunk: Uint8Array): Promise<void> {
    await this.stream.write(chunk as unknown as BufferSource);
    this._bytesWritten += chunk.byteLength;
  }

  async close(): Promise<void> {
    await this.stream.close();
  }

  async abort(reason?: unknown): Promise<void> {
    if (this.stream.abort) {
      await this.stream.abort(reason);
    } else {
      await this.stream.close().catch(() => {});
    }
  }
}

export interface BlobFileWriterOptions {
  fileName: string;
  mimeType: string;
  /** Emitted once when accumulation crosses the memory limit. */
  onWarning?: (message: string) => void;
  /** Override the download trigger (used in tests). */
  onDownload?: (blob: Blob, fileName: string) => void;
}

class BlobFileWriter implements FileWriter {
  readonly usedFallback = true;
  private chunks: Uint8Array[] = [];
  private _bytesWritten = 0;
  private warned = false;
  private aborted = false;

  constructor(private readonly options: BlobFileWriterOptions) {}

  get bytesWritten(): number {
    return this._bytesWritten;
  }

  async write(chunk: Uint8Array): Promise<void> {
    if (this.aborted) return;
    this.chunks.push(chunk);
    this._bytesWritten += chunk.byteLength;
    if (
      !this.warned &&
      this._bytesWritten > FALLBACK_MEMORY_LIMIT &&
      this.options.onWarning
    ) {
      this.warned = true;
      this.options.onWarning(
        `Export exceeds ${Math.round(
          FALLBACK_MEMORY_LIMIT / (1024 * 1024)
        )} MB and your browser lacks the File System Access API; holding the file in memory may be slow.`
      );
    }
  }

  async close(): Promise<void> {
    if (this.aborted) return;
    const parts = this.chunks as unknown as BlobPart[];
    const blob = new Blob(parts, { type: this.options.mimeType });
    this.chunks = [];

    if (this.options.onDownload) {
      this.options.onDownload(blob, this.options.fileName);
      return;
    }
    triggerBlobDownload(blob, this.options.fileName);
  }

  async abort(): Promise<void> {
    this.aborted = true;
    this.chunks = [];
  }
}

function triggerBlobDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Revoke on the next tick so the download has a chance to start.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export interface CreateFileWriterOptions {
  fileName: string;
  mimeType: string;
  /** Picker description, e.g. "CSV file". */
  description?: string;
  /** File extensions for the picker, e.g. [".csv"]. */
  extensions?: string[];
  onWarning?: (message: string) => void;
  /** Force the Blob fallback regardless of API support (used in tests). */
  forceFallback?: boolean;
  onDownload?: (blob: Blob, fileName: string) => void;
}

/**
 * Resolve the best available {@link FileWriter}. Prefers the File System Access
 * API (true streaming to disk); falls back to an in-memory Blob download. A
 * cancelled save picker propagates as an `AbortError`.
 */
export async function createFileWriter(
  options: CreateFileWriterOptions
): Promise<FileWriter> {
  if (!options.forceFallback && isFileSystemAccessSupported()) {
    const picker = (
      window as unknown as { showSaveFilePicker: ShowSaveFilePicker }
    ).showSaveFilePicker;
    const accept: Record<string, string[]> = {
      [options.mimeType]: options.extensions ?? [],
    };
    const handle = await picker({
      suggestedName: options.fileName,
      types: [{ description: options.description, accept }],
    });
    const stream = await handle.createWritable();
    return new FsAccessFileWriter(stream);
  }

  return new BlobFileWriter({
    fileName: options.fileName,
    mimeType: options.mimeType,
    onWarning: options.onWarning,
    onDownload: options.onDownload,
  });
}
