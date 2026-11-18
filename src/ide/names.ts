/**
 * Name checks and Axon literals for the IDE API and the function commit.
 *
 * Every value that goes into a file path or into Axon source text passes
 * through one of these functions first.
 */

/** A func name or a tag name: a letter, then letters, digits and "_". */
const NAME_RE = /^[A-Za-z][A-Za-z0-9_]*$/;
const MAX_NAME = 128;
const MAX_SEGMENT = 255;

/** True when `name` is safe as an Axon function name and as a file name. */
export function isFunctionName(name: unknown): name is string {
  return typeof name === 'string' && name.length <= MAX_NAME && NAME_RE.test(name);
}

/** True when `name` is safe as a tag name in an Axon dict literal. */
export function isTagName(name: unknown): name is string {
  return isFunctionName(name);
}

/**
 * True when `segment` is safe as one folder name (an instance or a project).
 * Spaces and dots inside the name are allowed; "." and ".." are not.
 */
export function isSafeSegment(segment: unknown): segment is string {
  if (typeof segment !== 'string') return false;
  if (segment.length === 0 || segment.length > MAX_SEGMENT) return false;
  if (segment === '.' || segment === '..') return false;
  if (segment !== segment.trim()) return false;
  // No path separators and no control characters (this includes NUL).
  // eslint-disable-next-line no-control-regex
  return !/[\/\\\u0000-\u001f\u007f]/.test(segment);
}

/**
 * An Axon string literal for `value`, with the quotes.
 *
 * The Axon tokenizer reads `$` as interpolation and stops a plain string at a
 * raw newline, so both are escaped here together with `\` and `"`.
 */
export function axonStr(value: string): string {
  let out = '"';
  for (const ch of value) {
    switch (ch) {
      case '\\': out += '\\\\'; break;
      case '"': out += '\\"'; break;
      case '$': out += '\\$'; break;
      case '\n': out += '\\n'; break;
      case '\r': out += '\\r'; break;
      case '\t': out += '\\t'; break;
      case '\b': out += '\\b'; break;
      case '\f': out += '\\f'; break;
      default: {
        const code = ch.codePointAt(0)!;
        if (code < 0x20 || code === 0x7f) out += '\\u' + code.toString(16).padStart(4, '0');
        else out += ch;
      }
    }
  }
  return out + '"';
}
