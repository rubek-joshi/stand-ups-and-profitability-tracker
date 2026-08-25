import {
  TRANSFORMERS,
  type ElementTransformer,
  type TextFormatTransformer,
  type Transformer,
} from "@lexical/markdown"
import {
  $createHorizontalRuleNode,
  $isHorizontalRuleNode,
  HorizontalRuleNode,
} from "@lexical/react/LexicalHorizontalRuleNode"
import { HeadingNode, QuoteNode } from "@lexical/rich-text"
import { CodeNode } from "@lexical/code"
import { LinkNode } from "@lexical/link"
import { ListItemNode, ListNode } from "@lexical/list"
import type { Klass, LexicalNode } from "lexical"

export const markdownEditorTheme = {
  paragraph: "mb-1 last:mb-0",
  quote: "border-l-2 border-border pl-3 text-muted-foreground italic",
  heading: {
    h1: "mb-2 text-xl font-semibold tracking-tight",
    h2: "mb-1.5 text-lg font-semibold",
    h3: "mb-1 text-base font-semibold",
  },
  list: {
    ul: "mb-1 list-disc pl-5",
    ol: "mb-1 list-decimal pl-5",
    listitem: "my-0.5",
  },
  link: "text-primary underline",
  text: {
    bold: "font-semibold",
    italic: "italic",
    underline: "underline",
    code: "rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]",
    strikethrough: "line-through",
  },
  code: "my-2 block overflow-x-auto rounded-md bg-muted px-2 py-1.5 font-mono text-[13px]",
  hr: "my-3 border-0 border-t border-border",
}

export const markdownEditorNodes: Array<Klass<LexicalNode>> = [
  HeadingNode,
  QuoteNode,
  ListNode,
  ListItemNode,
  LinkNode,
  CodeNode,
  HorizontalRuleNode,
]

const UNDERLINE: TextFormatTransformer = {
  format: ["underline"],
  tag: "++",
  type: "text-format",
}

const HR: ElementTransformer = {
  dependencies: [HorizontalRuleNode],
  export: (node) => ($isHorizontalRuleNode(node) ? "***" : null),
  regExp: /^(---|\*\*\*|___)\s*$/,
  replace: (parentNode) => {
    parentNode.replace($createHorizontalRuleNode())
  },
  type: "element",
}

export const MARKDOWN_TRANSFORMERS: Transformer[] = [
  HR,
  UNDERLINE,
  ...TRANSFORMERS,
]
