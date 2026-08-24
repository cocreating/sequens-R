export function safeFileName(value: string, fallback: string): string {
  return value.trim().replace(/[^a-z0-9]+/giu, '-').replace(/^-|-$/gu, '').toLowerCase() || fallback;
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function binaryBlob(data: Uint8Array, type: string): Blob {
  const copy = Uint8Array.from(data);
  return new Blob([copy.buffer], { type });
}

interface SavePickerHandle {
  createWritable(): Promise<{ write(data: Blob): Promise<void>; close(): Promise<void> }>;
}

interface SavePickerWindow extends Window {
  showSaveFilePicker?: (options: {
    suggestedName: string;
    types: Array<{ description: string; accept: Record<string, string[]> }>;
  }) => Promise<SavePickerHandle>;
}

export interface SaveFileType {
  description: string;
  mime: string;
  extensions: string[];
}

/** Uses File System Access on supporting desktop Chromium and download everywhere else. */
export async function saveBlob(blob: Blob, fileName: string, type: SaveFileType): Promise<'file' | 'download' | 'cancelled'> {
  const picker = (window as SavePickerWindow).showSaveFilePicker;
  if (picker === undefined || window.matchMedia('(max-width: 63.999rem)').matches) {
    downloadBlob(blob, fileName);
    return 'download';
  }
  try {
    const handle = await picker({
      suggestedName: fileName,
      types: [{ description: type.description, accept: { [type.mime]: type.extensions } }],
    });
    const writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
    return 'file';
  } catch (reason: unknown) {
    if (reason instanceof DOMException && reason.name === 'AbortError') return 'cancelled';
    throw reason;
  }
}
