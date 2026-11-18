"use client";
import { Fragment, type ReactNode } from "react";
import { cn } from "@/lib/utils";

// Tiny, safe Markdown renderer: headings, paragraphs, bullet/numbered lists,
// code blocks, **bold**, *italic*, `code`. Builds React elements only — never
// injects raw HTML.

function inline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  // Order matters: code first so its contents aren't formatted.
  const re = /(`[^`\n]+`)|(\*\*[^*\n]+\*\*|__[^_\n]+__)|(\*[^*\n]+\*|_[^_\n]+_)|\[([^\]\n]+)\]\(([^)\s]+)\)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const k = `${keyBase}-${i++}`;
    if (m[1]) out.push(<code key={k} className="rounded bg-surface-2 px-1 py-0.5 font-mono text-[0.9em]">{m[1].slice(1, -1)}</code>);
    else if (m[2]) out.push(<strong key={k} className="font-semibold">{inline(m[2].slice(2, -2), k)}</strong>);
    else if (m[3]) out.push(<em key={k}>{inline(m[3].slice(1, -1), k)}</em>);
    else if (m[4]) {
      // Links: only in-app paths are clickable; external URLs render as plain text.
      const href = m[5]!;
      out.push(
        href.startsWith("/") && !href.startsWith("//") ? (
          <a key={k} href={href} className="text-primary underline-offset-2 hover:underline">
            {m[4]}
          </a>
        ) : (
          <span key={k}>{m[4]}</span>
        ),
      );
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

type Block =
  | { type: "h"; level: number; text: string }
  | { type: "p"; text: string }
  | { type: "ul" | "ol"; items: string[] }
  | { type: "code"; text: string };

function parseBlocks(src: string): Block[] {
  const lines = src.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) blocks.push({ type: "p", text: para.join(" ") });
    para = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (/^```/.test(line.trim())) {
      flush();
      const body: string[] = [];
      for (i++; i < lines.length && !/^```/.test(lines[i]!.trim()); i++) body.push(lines[i]!);
      blocks.push({ type: "code", text: body.join("\n") });
      continue;
    }
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) {
      flush();
      blocks.push({ type: "h", level: h[1]!.length, text: h[2]! });
      continue;
    }
    const ul = /^\s*[-*•]\s+(.*)$/.exec(line);
    const ol = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (ul || ol) {
      flush();
      const type = ul ? "ul" : "ol";
      const prev = blocks[blocks.length - 1];
      const item = (ul ?? ol)![1]!;
      if (prev && prev.type === type) prev.items.push(item);
      else blocks.push({ type, items: [item] });
      continue;
    }
    if (!line.trim()) {
      flush();
      continue;
    }
    // Continuation of a list item (indented line).
    const prev = blocks[blocks.length - 1];
    if (!para.length && prev && (prev.type === "ul" || prev.type === "ol") && /^\s{2,}/.test(line)) {
      prev.items[prev.items.length - 1] += ` ${line.trim()}`;
      continue;
    }
    para.push(line.trim());
  }
  flush();
  return blocks;
}

export function Markdown({ text, className }: { text: string; className?: string }) {
  const blocks = parseBlocks(text);
  return (
    <div className={cn("flex flex-col gap-2 text-[13.5px] leading-relaxed break-words", className)}>
      {blocks.map((b, i) => {
        const k = `b${i}`;
        switch (b.type) {
          case "h":
            return (
              <p key={k} className={cn("font-semibold", b.level <= 2 ? "text-[15px]" : "text-[14px]", i > 0 && "mt-1")}>
                {inline(b.text, k)}
              </p>
            );
          case "p":
            return <p key={k}>{inline(b.text, k)}</p>;
          case "ul":
            return (
              <ul key={k} className="flex list-disc flex-col gap-1 pl-5 marker:text-fg-3">
                {b.items.map((it, j) => (
                  <li key={j}>{inline(it, `${k}-${j}`)}</li>
                ))}
              </ul>
            );
          case "ol":
            return (
              <ol key={k} className="flex list-decimal flex-col gap-1 pl-5 marker:text-fg-3">
                {b.items.map((it, j) => (
                  <li key={j}>{inline(it, `${k}-${j}`)}</li>
                ))}
              </ol>
            );
          case "code":
            return (
              <pre key={k} className="overflow-x-auto rounded-lg bg-surface-2 p-2.5 font-mono text-[12px] scroll-thin">
                <code>{b.text}</code>
              </pre>
            );
        }
        return <Fragment key={k} />;
      })}
    </div>
  );
}
