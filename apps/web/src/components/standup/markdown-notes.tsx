import * as React from "react"
import {
  $getRoot,
  $getSelection,
  $isRangeSelection,
  FORMAT_TEXT_COMMAND,
  type EditorState,
  type LexicalEditor,
} from "lexical"
import { $convertFromMarkdownString, $convertToMarkdownString, TRANSFORMERS } from "@lexical/markdown"
import { HeadingNode, QuoteNode } from "@lexical/rich-text"
import { CodeNode } from "@lexical/code"
import { LinkNode } from "@lexical/link"
import {
  ListItemNode,
  ListNode,
  INSERT_UNORDERED_LIST_COMMAND,
  INSERT_ORDERED_LIST_COMMAND,
} from "@lexical/list"
import { LexicalComposer } from "@lexical/react/LexicalComposer"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin"
import { ContentEditable } from "@lexical/react/LexicalContentEditable"
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin"
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin"
import { ListPlugin } from "@lexical/react/LexicalListPlugin"
import { LinkPlugin } from "@lexical/react/LexicalLinkPlugin"
import { MarkdownShortcutPlugin } from "@lexical/react/LexicalMarkdownShortcutPlugin"
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary"
import {
  IconBold,
  IconItalic,
  IconList,
  IconListNumbers,
  IconCode,
} from "@tabler/icons-react"
import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"

type Props = {
  editorKey?: string
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  placeholder?: string
  label?: string
}

const standupNotesEditors = new Map<string, LexicalEditor>()

export function focusStandupNotes(entryId: string): boolean {
  const editor = standupNotesEditors.get(entryId)
  if (!editor) return false
  editor.getRootElement()?.scrollIntoView({ block: "center", behavior: "auto" })
  const focusEditor = () => {
    editor.focus(
      () => {
        editor.update(() => {
          $getRoot().selectEnd()
        })
      },
      { defaultSelection: "rootEnd" },
    )
  }
  window.setTimeout(focusEditor, 0)
  return true
}

function RegisterStandupNotesEditor({ editorKey }: { editorKey: string }) {
  const [editor] = useLexicalComposerContext()
  React.useEffect(() => {
    standupNotesEditors.set(editorKey, editor)
    return () => {
      if (standupNotesEditors.get(editorKey) === editor) {
        standupNotesEditors.delete(editorKey)
      }
    }
  }, [editor, editorKey])
  return null
}

const editorTheme = {
  paragraph: "mb-1 last:mb-0",
  quote: "border-l-2 border-border pl-3 text-muted-foreground italic",
  heading: {
    h1: "mb-1 text-base font-semibold",
    h2: "mb-1 text-sm font-semibold",
    h3: "mb-1 text-sm font-semibold",
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
    code: "rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]",
    strikethrough: "line-through",
  },
  code: "my-2 block overflow-x-auto rounded-md bg-muted px-2 py-1.5 font-mono text-[13px]",
}

function normalizeMarkdown(value: string) {
  return value.replace(/\r\n/g, "\n").replace(/\n+$/g, "")
}

function MarkdownNotesInner({
  editorKey,
  value,
  onChange,
  disabled,
  placeholder,
}: Required<Pick<Props, "placeholder">> & Omit<Props, "placeholder">) {
  const [editor] = useLexicalComposerContext()
  const lastSyncedRef = React.useRef(normalizeMarkdown(value))

  React.useEffect(() => {
    editor.setEditable(!disabled)
  }, [editor, disabled])

  React.useEffect(() => {
    const next = normalizeMarkdown(value)
    if (next === lastSyncedRef.current) return
    lastSyncedRef.current = next
    editor.update(() => {
      $convertFromMarkdownString(value || "", TRANSFORMERS)
    })
  }, [editor, value])

  const handleChange = React.useCallback(
    (editorState: EditorState) => {
      editorState.read(() => {
        const markdown = normalizeMarkdown($convertToMarkdownString(TRANSFORMERS))
        if (markdown === lastSyncedRef.current) return
        lastSyncedRef.current = markdown
        onChange(markdown)
      })
    },
    [onChange],
  )

  return (
    <>
      {editorKey ? <RegisterStandupNotesEditor editorKey={editorKey} /> : null}
      <Toolbar disabled={disabled} />
      <div
        data-standup-notes=""
        className={cn(
          "relative rounded-md border border-input bg-transparent shadow-xs transition-[color,box-shadow]",
          "focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50",
          "dark:bg-input/30",
          disabled && "cursor-not-allowed opacity-50",
        )}
      >
        <RichTextPlugin
          contentEditable={
            <ContentEditable
              aria-placeholder={placeholder}
              placeholder={
                <div className="pointer-events-none absolute top-2 left-2.5 whitespace-pre-wrap text-sm text-muted-foreground">
                  {placeholder}
                </div>
              }
              className="relative min-h-26 resize-y overflow-auto px-2.5 py-2 text-sm leading-relaxed outline-none"
              style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}
            />
          }
          ErrorBoundary={LexicalErrorBoundary}
        />
      </div>
      <HistoryPlugin />
      <ListPlugin />
      <LinkPlugin />
      <MarkdownShortcutPlugin transformers={TRANSFORMERS} />
      <OnChangePlugin onChange={handleChange} ignoreSelectionChange />
    </>
  )
}

function Toolbar({ disabled }: { disabled?: boolean }) {
  const [editor] = useLexicalComposerContext()
  const [formats, setFormats] = React.useState({
    bold: false,
    italic: false,
    code: false,
  })

  React.useEffect(() => {
    return editor.registerUpdateListener(({ editorState }) => {
      editorState.read(() => {
        const selection = $getSelection()
        if (!$isRangeSelection(selection)) {
          setFormats({ bold: false, italic: false, code: false })
          return
        }
        setFormats({
          bold: selection.hasFormat("bold"),
          italic: selection.hasFormat("italic"),
          code: selection.hasFormat("code"),
        })
      })
    })
  }, [editor])

  const run = (fn: (ed: LexicalEditor) => void) => {
    editor.focus()
    fn(editor)
  }

  return (
    <div className="flex flex-wrap gap-1">
      <ToolbarButton
        disabled={disabled}
        active={formats.bold}
        title="Bold"
        onClick={() => run((ed) => ed.dispatchCommand(FORMAT_TEXT_COMMAND, "bold"))}
      >
        <IconBold className="size-3.5" />
      </ToolbarButton>
      <ToolbarButton
        disabled={disabled}
        active={formats.italic}
        title="Italic"
        onClick={() => run((ed) => ed.dispatchCommand(FORMAT_TEXT_COMMAND, "italic"))}
      >
        <IconItalic className="size-3.5" />
      </ToolbarButton>
      <ToolbarButton
        disabled={disabled}
        active={formats.code}
        title="Inline code"
        onClick={() => run((ed) => ed.dispatchCommand(FORMAT_TEXT_COMMAND, "code"))}
      >
        <IconCode className="size-3.5" />
      </ToolbarButton>
      <ToolbarButton
        disabled={disabled}
        title="Bullet list"
        onClick={() =>
          run((ed) => ed.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined))
        }
      >
        <IconList className="size-3.5" />
      </ToolbarButton>
      <ToolbarButton
        disabled={disabled}
        title="Numbered list"
        onClick={() =>
          run((ed) => ed.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined))
        }
      >
        <IconListNumbers className="size-3.5" />
      </ToolbarButton>
    </div>
  )
}

function ToolbarButton({
  children,
  active,
  disabled,
  title,
  onClick,
}: {
  children: React.ReactNode
  active?: boolean
  disabled?: boolean
  title: string
  onClick: () => void
}) {
  return (
    <Button
      type="button"
      size="icon-xs"
      variant={active ? "secondary" : "ghost"}
      disabled={disabled}
      tabIndex={-1}
      title={title}
      className="text-muted-foreground"
      onClick={onClick}
    >
      {children}
    </Button>
  )
}

export function MarkdownNotes({
  editorKey,
  value,
  onChange,
  disabled,
  placeholder = "Anything else the team should know…",
  label = "Miscellaneous · markdown",
}: Props) {
  const editorId = React.useId()
  const initialConfig = React.useMemo(
    () => ({
      namespace: `standup-notes-${editorId}`,
      theme: editorTheme,
      editable: !disabled,
      onError(error: Error) {
        console.error(error)
      },
      nodes: [HeadingNode, QuoteNode, ListNode, ListItemNode, LinkNode, CodeNode],
      editorState: () => {
        $convertFromMarkdownString(value || "", TRANSFORMERS)
      },
    }),
    // Mount once per editor instance; external updates sync via effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editorId],
  )

  return (
    <div className="space-y-2">
      <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <LexicalComposer initialConfig={initialConfig}>
        <MarkdownNotesInner
          editorKey={editorKey}
          value={value}
          onChange={onChange}
          disabled={disabled}
          placeholder={placeholder}
        />
      </LexicalComposer>
    </div>
  )
}
