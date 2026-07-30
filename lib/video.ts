import { execSync } from 'child_process';
import fs from 'fs';

export function extractarFrames(filePath: string): { frameBase64: string; timestamp: string }[] {
  const timestamps = ['00:00:01', '00:00:30', '00:01:00'];
  const frames: { frameBase64: string; timestamp: string }[] = [];

  for (const ts of timestamps) {
    const tempFile = `${filePath}_frame_${ts.replace(/:/g, '')}.jpg`;
    try {
      execSync(
        `ffmpeg -y -ss "${ts}" -i "${filePath}" -vframes 1 -q:v 3 "${tempFile}" 2>nul`,
        { timeout: 10000 }
      );
      if (fs.existsSync(tempFile)) {
        const b64 = fs.readFileSync(tempFile).toString('base64');
        frames.push({ frameBase64: b64, timestamp: ts });
        fs.unlinkSync(tempFile);
      }
    } catch {
    }
  }

  return frames;
}
