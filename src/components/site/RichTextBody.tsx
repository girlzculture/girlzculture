import Link from "next/link";

function InlineText({ value }: { value: string }) {
  const parts = value.split(/(\[[^\]]+\]\((?:\/|https:\/\/)[^)]+\))/g);
  return <>{parts.map((part, index) => {
    const match = part.match(/^\[([^\]]+)\]\(((?:\/|https:\/\/)[^)]+)\)$/);
    return match ? <Link key={index} href={match[2]} className="font-semibold text-magenta underline underline-offset-2">{match[1]}</Link> : <span key={index}>{part}</span>;
  })}</>;
}

export default function RichTextBody({ value, className = "" }: { value?: string; className?: string }) {
  const lines = String(value || "").split(/\r?\n/);
  const content: React.ReactNode[] = [];
  for (let index = 0; index < lines.length;) {
    const line = lines[index].trim();
    if (!line) { index += 1; continue; }
    if (line.startsWith("### ")) { content.push(<h4 key={index} className="font-serif text-xl text-plum"><InlineText value={line.slice(4)} /></h4>); index += 1; continue; }
    if (line.startsWith("## ")) { content.push(<h3 key={index} className="font-serif text-2xl text-plum"><InlineText value={line.slice(3)} /></h3>); index += 1; continue; }
    if (line.startsWith("# ")) { content.push(<h2 key={index} className="font-serif text-3xl text-plum"><InlineText value={line.slice(2)} /></h2>); index += 1; continue; }
    if (/^[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^[-*]\s+/.test(lines[index].trim())) { items.push(lines[index].trim().replace(/^[-*]\s+/, "")); index += 1; }
      content.push(<ul key={`ul-${index}`} className="list-disc space-y-2 pl-6">{items.map((item, itemIndex) => <li key={itemIndex}><InlineText value={item} /></li>)}</ul>); continue;
    }
    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^\d+\.\s+/.test(lines[index].trim())) { items.push(lines[index].trim().replace(/^\d+\.\s+/, "")); index += 1; }
      content.push(<ol key={`ol-${index}`} className="list-decimal space-y-2 pl-6">{items.map((item, itemIndex) => <li key={itemIndex}><InlineText value={item} /></li>)}</ol>); continue;
    }
    content.push(<p key={index}><InlineText value={line} /></p>); index += 1;
  }
  return <div className={`space-y-4 text-sm leading-7 text-ink/70 ${className}`}>{content}</div>;
}

