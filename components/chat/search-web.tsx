"use client";

import { cn } from "@/lib/utils";

type SearchResult = {
  title: string;
  url: string;
  content: string;
  score: number;
};

type SearchWebResultsProps = {
  results: SearchResult[];
};

function getDomain(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function getFaviconUrl(domain: string) {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=32`;
}

export function SearchWebResults({ results }: SearchWebResultsProps) {
  if (!results.length) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {results.map((result) => {
        const domain = getDomain(result.url);

        return (
          <a
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border border-border/40 bg-muted/40 px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:border-border hover:bg-muted hover:text-foreground"
            )}
            href={result.url}
            key={`${result.url}-${result.title}`}
            rel="noreferrer"
            target="_blank"
            title={result.title}
          >
            <img
              alt=""
              className="size-3.5 shrink-0 rounded-sm"
              src={getFaviconUrl(domain)}
            />
            <span className="max-w-[16rem] truncate">🔗 {domain}</span>
          </a>
        );
      })}
    </div>
  );
}
