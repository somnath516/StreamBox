const fs = require('fs').promises;

// Subtitle WebVTT validation + UTF-8 normalization
async function normalizeToUtf8AndValidateVtt(filePath) {
  const buf = await fs.readFile(filePath);
  const b0 = buf[0];
  const b1 = buf[1];
  const b2 = buf[2];
  const b3 = buf[3];

  // Detect UTF-16 BOM
  const isUtf16Le = b0 === 0xff && b1 === 0xfe;
  const isUtf16Be = b0 === 0xfe && b1 === 0xff;

  let content;
  if (isUtf16Le) {
    // Drop BOM and decode LE
    content = buf.slice(2).toString('utf16le');
  } else if (isUtf16Be) {
    // Drop BOM and decode BE
    // Node doesn't support utf16be decoding directly; swap bytes to LE.
    const swapped = Buffer.allocUnsafe(buf.length - 2);
    for (let i = 2, j = 0; i < buf.length; i += 2, j += 2) {
      const a = buf[i];
      const b = buf[i + 1];
      swapped[j] = b;
      swapped[j + 1] = a;
    }
    content = swapped.toString('utf16le');
  } else {
    // Assume UTF-8 (Node will replace invalid sequences). Strip UTF-8 BOM if present.
    content = buf.toString('utf8');
    if (content.charCodeAt(0) === 0xfeff) content = content.slice(1);
  }

  // Normalize line endings
  content = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Trim leading whitespace/BOM-ish chars before WEBVTT
  const trimmedStart = content.replace(/^\s+/, '');
  if (!trimmedStart.startsWith('WEBVTT')) {
    throw new Error('Invalid subtitle file format');
  }

  // Quick cue structure validation:
  // Find timestamp range lines like: 00:00:01.000 --> 00:00:03.000
  const timestampLineRe = /^\s*(\d{2}:\d{2}:\d{2}\.\d{3}|\d{1,2}:\d{2}:\d{2}\.\d{3}|\d{2}:\d{2}\.\d{3})\s*--?>\s*(\d{2}:\d{2}:\d{2}\.\d{3}|\d{1,2}:\d{2}:\d{2}\.\d{3}|\d{2}:\d{2}\.\d{3})(?:\s+.*)?\s*$/m;

  // Ensure at least one valid timestamp arrow exists after WEBVTT header
  const hasTimestamp = timestampLineRe.test(trimmedStart);
  if (!hasTimestamp) {
    throw new Error('Invalid subtitle file format');
  }

  // Ensure file isn't empty besides header
  const cueText = trimmedStart.replace(/^WEBVTT[^\n]*\n+/i, '').trim();
  if (!cueText) {
    throw new Error('Invalid subtitle file format');
  }

  // Rewrite sanitized UTF-8 file back to disk
  const utf8Buf = Buffer.from(content, 'utf8');
  await fs.writeFile(filePath, utf8Buf);

  return true;
}

module.exports = { normalizeToUtf8AndValidateVtt };

