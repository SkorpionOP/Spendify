/* AI reply text: short paragraphs, "- " bullets and **bold**, rendered without innerHTML. */

const inline = (s) =>
  s.split(/(\*\*[^*]+\*\*)/g).map((part, i) => (part.startsWith('**') && part.endsWith('**') ? <strong key={i}>{part.slice(2, -2)}</strong> : part));

export function RichReply({ text }) {
  const blocks = [];
  for (const line of text.split('\n')) {
    const l = line.trim();
    if (!l) continue;
    const bullet = l.match(/^[-•*]\s+(.*)/);
    const last = blocks[blocks.length - 1];
    if (bullet) {
      if (last?.type === 'ul') last.items.push(bullet[1]);
      else blocks.push({ type: 'ul', items: [bullet[1]] });
    } else blocks.push({ type: 'p', text: l });
  }
  return blocks.map((b, i) =>
    b.type === 'ul' ? (
      <ul key={i}>
        {b.items.map((x, j) => (
          <li key={j}>{inline(x)}</li>
        ))}
      </ul>
    ) : (
      <p key={i}>{inline(b.text)}</p>
    )
  );
}
