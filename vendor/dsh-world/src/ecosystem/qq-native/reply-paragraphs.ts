/** Split outgoing QQ replies on blank lines, leaving fenced code intact. */
export function replyParagraphs(text: string): string[] {
  const paragraphs: string[] = [];
  let lines: string[] = [];
  let fence: { marker: string; length: number } | undefined;
  const flush = () => {
    const paragraph = lines.join('\n').trim();
    if (paragraph) paragraphs.push(paragraph);
    lines = [];
  };
  for (const line of text.replace(/\r\n?/g, '\n').split('\n')) {
    const marker = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (fence) {
      lines.push(line);
      if (marker && marker[1]![0] === fence.marker && marker[1]!.length >= fence.length && !marker[2]!.trim()) fence = undefined;
    } else if (!line.trim()) {
      flush();
    } else {
      lines.push(line);
      if (marker) fence = { marker: marker[1]![0]!, length: marker[1]!.length };
    }
  }
  flush();
  return paragraphs;
}
