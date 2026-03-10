import { describe, it, expect } from "vitest";
import { parseFileBlocks } from "./parse-file-blocks";

describe("parseFileBlocks", () => {
  it("parses single file block", () => {
    const text = `<file path="app/page.tsx">
"use client";
export default function Page() { return <div>Hi</div>; }
</file>`;
    expect(parseFileBlocks(text)).toEqual({
      "app/page.tsx": `"use client";
export default function Page() { return <div>Hi</div>; }`,
    });
  });

  it("parses multiple file blocks", () => {
    const text = `<file path="app/page.tsx">
content1
</file>
<file path="components/foo.tsx">
content2
</file>`;
    expect(parseFileBlocks(text)).toEqual({
      "app/page.tsx": "content1",
      "components/foo.tsx": "content2",
    });
  });

  it("returns empty object for text without file blocks", () => {
    expect(parseFileBlocks("just some text")).toEqual({});
  });

  it("ignores malformed blocks", () => {
    const text = `<file path="a">x</file><file path="">y</file><file path="b"></file>`;
    expect(parseFileBlocks(text)).toEqual({ "a": "x" });
  });

  it("parses single-quoted path", () => {
    const text = `<file path='app/page.tsx'>
"use client";
export default function Page() { return <div>Hi</div>; }
</file>`;
    expect(parseFileBlocks(text)).toEqual({
      "app/page.tsx": `"use client";
export default function Page() { return <div>Hi</div>; }`,
    });
  });

  it("parses markdown code block with path on first line", () => {
    const text = `\`\`\`app/page.tsx
"use client";
export default function Page() { return <div>Hi</div>; }
\`\`\``;
    expect(parseFileBlocks(text)).toEqual({
      "app/page.tsx": `"use client";
export default function Page() { return <div>Hi</div>; }`,
    });
  });

  it("parses markdown code block with lang and path", () => {
    const text = `\`\`\`tsx
components/foo.tsx
const x = 1;
\`\`\``;
    expect(parseFileBlocks(text)).toEqual({
      "components/foo.tsx": "const x = 1;",
    });
  });

  it("rejects code fragments mistaken for paths", () => {
    const text = `\`\`\`tsx
import Counter from "./components/counter";
export default function Counter() { return <div>0</div>; }
\`\`\``;
    expect(parseFileBlocks(text)).toEqual({});
  });

  it("rejects JSDoc-style fragments", () => {
    const text = `\`\`\`
** @type {import("next").NextConfig}
const config = {};
\`\`\``;
    expect(parseFileBlocks(text)).toEqual({});
  });
});
