import remarkGfm from "remark-gfm";

export const remarkPlugins = [remarkGfm];

export const disallowedElements = [
  "script",
  "style",
  "iframe",
  "object",
  "embed",
  "applet",
  "form",
  "meta",
  "link",
  "body",
  "html",
  "head",
];

export const markdownComponents = {
  p: ({ children }: { children?: React.ReactNode }) => <p className="mb-2 last:mb-0">{children}</p>,
  h2: ({ children }: { children?: React.ReactNode }) => (
    <h2 className="font-semibold text-[var(--foreground)] mt-4 mb-2 first:mt-0 text-base">{children}</h2>
  ),
  h3: ({ children }: { children?: React.ReactNode }) => (
    <h3 className="font-semibold text-[var(--foreground)] mt-3 mb-1">{children}</h3>
  ),
  ul: ({ children }: { children?: React.ReactNode }) => (
    <ul className="mb-2 list-disc pl-4 space-y-1">{children}</ul>
  ),
  ol: ({ children }: { children?: React.ReactNode }) => (
    <ol className="mb-2 list-decimal pl-4 space-y-1">{children}</ol>
  ),
  li: ({ children }: { children?: React.ReactNode }) => (
    <li className="text-[var(--foreground)]">{children}</li>
  ),
  strong: ({ children }: { children?: React.ReactNode }) => (
    <strong className="font-semibold text-[var(--color-brand)]">{children}</strong>
  ),
  blockquote: ({ children }: { children?: React.ReactNode }) => (
    <blockquote className="border-l-[3px] border-[var(--color-brand)] pl-3 my-2 text-[var(--foreground-secondary)]">
      {children}
    </blockquote>
  ),
  pre: ({ children }: { children?: React.ReactNode }) => (
    <pre className="whitespace-pre-wrap break-words">{children}</pre>
  ),
  table: ({ children }: { children?: React.ReactNode }) => (
    <div className="overflow-x-auto my-2">
      <table className="w-full text-sm border-collapse">{children}</table>
    </div>
  ),
  th: ({ children }: { children?: React.ReactNode }) => (
    <th className="border border-[var(--card-border)] px-2 py-1 text-left font-semibold bg-[var(--background-secondary)]">
      {children}
    </th>
  ),
  td: ({ children }: { children?: React.ReactNode }) => (
    <td className="border border-[var(--card-border)] px-2 py-1 align-top">{children}</td>
  ),
};
