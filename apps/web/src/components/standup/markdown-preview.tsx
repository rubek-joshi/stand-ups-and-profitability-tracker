import * as React from "react"
import { $convertFromMarkdownString } from "@lexical/markdown"
import { LexicalComposer } from "@lexical/react/LexicalComposer"
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin"
import { ContentEditable } from "@lexical/react/LexicalContentEditable"
import { ListPlugin } from "@lexical/react/LexicalListPlugin"
import { LinkPlugin } from "@lexical/react/LexicalLinkPlugin"
import { ClickableLinkPlugin } from "@lexical/react/LexicalClickableLinkPlugin"
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary"
import { cn } from "@workspace/ui/lib/utils"
import {
  MARKDOWN_TRANSFORMERS,
  markdownEditorNodes,
  markdownEditorTheme,
} from "@/components/standup/markdown-shared"

type Props = {
  markdown: string
  className?: string
}

export function MarkdownPreview({ markdown, className }: Props) {
  const editorId = React.useId()
  const initialConfig = React.useMemo(
    () => ({
      namespace: `markdown-preview-${editorId}`,
      theme: markdownEditorTheme,
      editable: false,
      onError(error: Error) {
        console.error(error)
      },
      nodes: markdownEditorNodes,
      editorState: () => {
        $convertFromMarkdownString(markdown || "", MARKDOWN_TRANSFORMERS)
      },
    }),
    [editorId, markdown],
  )

  return (
    <LexicalComposer key={markdown} initialConfig={initialConfig}>
      <div className={cn("text-sm leading-relaxed [&_hr]:my-3 [&_hr]:border-border", className)}>
        <RichTextPlugin
          contentEditable={
            <ContentEditable
              className="outline-none"
              style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}
            />
          }
          ErrorBoundary={LexicalErrorBoundary}
        />
        <ListPlugin />
        <LinkPlugin />
        <ClickableLinkPlugin />
      </div>
    </LexicalComposer>
  )
}
