import { execFileSync } from 'child_process';
import fs from 'fs';

/** Extensões permitidas pra extração de frames (whitelist). */
const ALLOWED_EXTS = new Set(['.mp4', '.webm', '.mp3', '.m4a', '.wav']);

export function extractarFrames(filePath: string): { frameBase64: string; timestamp: string }[] {
  // Valida extensão do arquivo (whitelist contra command injection)
  const ext = filePath.slice(filePath.lastIndexOf('.')).toLowerCase();
  if (!ALLOWED_EXTS.has(ext)) {
    console.warn(`[Video] Extensão não permitida: ${ext}`);
    return [];
  }

  const timestamps = ['00:00:01', '00:00:30', '00:01:00'];
  const frames: { frameBase64: string; timestamp: string }[] = [];

  for (const ts of timestamps) {
    const tempFile = `${filePath}_frame_${ts.replace(/:/g, '')}.jpg`;
    try {
      // execFileSync com array de argumentos — previne command injection
      execFileSync('ffmpeg', [
        '-y', '-ss', ts, '-i', filePath,
        '-vframes', '1', '-q:v', '3', tempFile
      ], { timeout: 10000, stdio: 'pipe' });

      if (fs.existsSync(tempFile)) {
        const b64 = fs.readFileSync(tempFile).toString('base64');
        frames.push({ frameBase64: b64, timestamp: ts });
        fs.unlinkSync(tempFile);
      }
    } catch {
      // Frames que falham são ignorados (fallback graceful)
    }
  }

  return frames;
}
