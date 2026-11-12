// Temporary diagnostic: fetch a recording the way the browser's video player does (through the dev server).
import { signRecordingToken } from '../src/modules/auth/token.js';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const id = 'd0e86385-9098-4088-9e89-54426db60472';
const url = `/api/meeting-recordings/${id}/file?token=${encodeURIComponent(signRecordingToken(id))}`;
for (const base of ['http://localhost:4000', 'https://localhost:5173']) {
  for (const range of [null, 'bytes=0-']) {
    try {
      const response = await fetch(`${base}${url}`, { headers: range ? { Range: range } : {} });
      const body = await response.arrayBuffer();
      console.log(JSON.stringify({
        base,
        range,
        status: response.status,
        type: response.headers.get('content-type'),
        length: response.headers.get('content-length'),
        contentRange: response.headers.get('content-range'),
        acceptRanges: response.headers.get('accept-ranges'),
        policy: response.headers.get('cross-origin-resource-policy'),
        received: body.byteLength,
        text: response.status >= 400 ? Buffer.from(body).toString('utf8').slice(0, 200) : undefined,
      }));
    } catch (error) {
      console.log(JSON.stringify({ base, range, error: error.message }));
    }
  }
}
process.exit(0);
