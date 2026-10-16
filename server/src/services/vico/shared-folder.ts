/**
 * Shared-folder copy of a Vico export. The server writes each export CSV into VICO_EXPORT_DIR so VECO can
 * read it; staff are shown the path as they see it (VICO_EXPORT_DISPLAY_DIR, e.g. a UNC path).
 */
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { AppError } from '../../lib/errors.js';

export interface VicoSharedDir {
  exportDir: string | null;
  displayDir: string | null;
}

export const NO_SHARED_DIR: VicoSharedDir = { exportDir: null, displayDir: null };

/** The full path staff paste into VECO, in the separator style of the display dir. Null when the feature is off. */
export function sharedDisplayPath(fileName: string, s: VicoSharedDir): string | null {
  if (!s.exportDir) return null;
  const dir = s.displayDir || s.exportDir;
  const sep = dir.includes('\\') ? '\\' : '/';
  return dir.replace(/[\\/]+$/, '') + sep + fileName;
}

const LINK_UNSUPPORTED = new Set(['EPERM', 'ENOTSUP', 'ENOSYS', 'EXDEV']);

const errCode = (err: unknown): string | undefined => (err as NodeJS.ErrnoException | null)?.code;

function existsError(fileName: string): AppError {
  return new AppError(
    'conflict',
    `A file named ${fileName} is already in the Vico shared folder; nothing was exported. Wait a moment and export again.`,
    { reason: 'vico_shared_file_exists' },
  );
}

/** Writes the CSV atomically and never over an existing file. Returns the absolute server path written. */
export async function writeSharedFile(s: VicoSharedDir, fileName: string, csv: string): Promise<string> {
  const exportDir = s.exportDir;
  if (!exportDir) throw new Error('writeSharedFile called with the feature off');
  const target = path.join(exportDir, fileName);
  const tmp = path.join(exportDir, `.${fileName}.${randomUUID()}.tmp`);
  try {
    await fs.writeFile(tmp, csv, { encoding: 'utf8', flag: 'wx' });
    try {
      await fs.link(tmp, target);
    } catch (err) {
      const code = errCode(err);
      if (code && LINK_UNSUPPORTED.has(code)) {
        // Some SMB mounts have no hard links: check, then rename. The advisory lock serialises exports.
        const exists = await fs.access(target).then(() => true, () => false);
        if (exists) throw Object.assign(new Error('exists'), { code: 'EEXIST' });
        await fs.rename(tmp, target);
      } else {
        throw err;
      }
    }
    return target;
  } catch (err) {
    const code = errCode(err);
    if (code === 'EEXIST') throw existsError(fileName);
    if (err instanceof AppError) throw err;
    throw new AppError(
      'conflict',
      `Could not save the Vico file to the shared folder ${s.displayDir || exportDir} (${code ?? 'unknown'}). Nothing was exported; ask an admin to check VICO_EXPORT_DIR.`,
      { reason: 'vico_shared_dir_unavailable' },
    );
  } finally {
    await fs.unlink(tmp).catch(() => {});
  }
}

/** The display path when the feature is on and the file is really in the folder, else null. */
export async function sharedPathIfPresent(s: VicoSharedDir, fileName: string): Promise<string | null> {
  if (!s.exportDir) return null;
  const st = await fs.stat(path.join(s.exportDir, fileName)).catch(() => null);
  return st?.isFile() ? sharedDisplayPath(fileName, s) : null;
}
