/**
 * Blanks out comments and string/template literals so the scanner below only
 * looks at real code. Replacing (instead of deleting) keeps line numbers intact.
 */
export function stripLiterals(source: string): string {
  let output = '';
  let index = 0;
  const blank = (text: string): string => text.replace(/[^\n]/g, ' ');

  while (index < source.length) {
    const rest = source.slice(index);
    const lineComment = /^\/\/[^\n]*/.exec(rest);
    if (lineComment !== null) {
      output += blank(lineComment[0]);
      index += lineComment[0].length;
      continue;
    }
    const blockComment = /^\/\*[\s\S]*?\*\//.exec(rest);
    if (blockComment !== null) {
      output += blank(blockComment[0]);
      index += blockComment[0].length;
      continue;
    }
    const literal = /^(?:'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|`(?:\\.|[^`\\])*`)/.exec(rest);
    if (literal !== null) {
      output += blank(literal[0]);
      index += literal[0].length;
      continue;
    }
    output += source[index];
    index += 1;
  }
  return output;
}
