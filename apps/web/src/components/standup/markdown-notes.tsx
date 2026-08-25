import * as React from "react"
import {
  $createParagraphNode,
  $findMatchingParent,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  FORMAT_TEXT_COMMAND,
  type EditorState,
  type LexicalEditor,
} from "lexical"
import {
  $convertFromMarkdownString,
  $convertToMarkdownString,
} from "@lexical/markdown"
import {
  $createHeadingNode,
  $isHeadingNode,
  type HeadingTagType,
} from "@lexical/rich-text"
import { $isLinkNode, TOGGLE_LINK_COMMAND } from "@lexical/link"
import {
  INSERT_UNORDERED_LIST_COMMAND,
  INSERT_ORDERED_LIST_COMMAND,
} from "@lexical/list"
import { $setBlocksType } from "@lexical/selection"
import { LexicalComposer } from "@lexical/react/LexicalComposer"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin"
import { ContentEditable } from "@lexical/react/LexicalContentEditable"
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin"
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin"
import { ListPlugin } from "@lexical/react/LexicalListPlugin"
import { LinkPlugin } from "@lexical/react/LexicalLinkPlugin"
import { MarkdownShortcutPlugin } from "@lexical/react/LexicalMarkdownShortcutPlugin"
import { HorizontalRulePlugin } from "@lexical/react/LexicalHorizontalRulePlugin"
import { INSERT_HORIZONTAL_RULE_COMMAND } from "@lexical/react/LexicalHorizontalRuleNode"
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary"
import {
  IconBold,
  IconCode,
  IconH1,
  IconH2,
  IconH3,
  IconItalic,
  IconLink,
  IconList,
  IconListNumbers,
  IconMinus,
  IconStrikethrough,
  IconUnderline,
} from "@tabler/icons-react"
import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"
import {
  MARKDOWN_TRANSFORMERS,
  markdownEditorNodes,
  markdownEditorTheme,
} from "@/components/standup/markdown-shared"

export { markdownEditorTheme }

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
      $convertFromMarkdownString(value || "", MARKDOWN_TRANSFORMERS)
    })
  }, [editor, value])

  const handleChange = React.useCallback(
    (editorState: EditorState) => {
      editorState.read(() => {
        const markdown = normalizeMarkdown(
          $convertToMarkdownString(MARKDOWN_TRANSFORMERS),
        )
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
      <HorizontalRulePlugin />
      <MarkdownShortcutPlugin transformers={MARKDOWN_TRANSFORMERS} />
      <OnChangePlugin onChange={handleChange} ignoreSelectionChange />
    </>
  )
}

function Toolbar({ disabled }: { disabled?: boolean }) {
  const [editor] = useLexicalComposerContext()
  const [formats, setFormats] = React.useState({
    bold: false,
    italic: false,
    underline: false,
    strikethrough: false,
    code: false,
    heading: null as HeadingTagType | null,
    link: false,
  })

  React.useEffect(() => {
    return editor.registerUpdateListener(({ editorState }) => {
      editorState.read(() => {
        const selection = $getSelection()
        if (!$isRangeSelection(selection)) {
          setFormats({
            bold: false,
            italic: false,
            underline: false,
            strikethrough: false,
            code: false,
            heading: null,
            link: false,
          })
          return
        }
        const heading = $findMatchingParent(
          selection.anchor.getNode(),
          $isHeadingNode,
        )
        setFormats({
          bold: selection.hasFormat("bold"),
          italic: selection.hasFormat("italic"),
          underline: selection.hasFormat("underline"),
          strikethrough: selection.hasFormat("strikethrough"),
          code: selection.hasFormat("code"),
          heading: heading?.getTag() ?? null,
          link: Boolean(
            $findMatchingParent(selection.anchor.getNode(), $isLinkNode),
          ),
        })
      })
    })
  }, [editor])

  const run = (fn: (ed: LexicalEditor) => void) => {
    editor.focus()
    fn(editor)
  }

  const toggleHeading = (tag: HeadingTagType) => {
    run((ed) => {
      ed.update(() => {
        const selection = $getSelection()
        if (!$isRangeSelection(selection)) return
        const heading = $findMatchingParent(
          selection.anchor.getNode(),
          $isHeadingNode,
        )
        if (heading?.getTag() === tag) {
          $setBlocksType(selection, () => $createParagraphNode())
          return
        }
        $setBlocksType(selection, () => $createHeadingNode(tag))
      })
    })
  }

  const toggleLink = () => {
    const existing = editor.getEditorState().read(() => {
      const selection = $getSelection()
      if (!$isRangeSelection(selection)) return ""
      return (
        $findMatchingParent(selection.anchor.getNode(), $isLinkNode)?.getURL() ??
        ""
      )
    })
    const next = window.prompt("Link URL", existing || "https://")
    if (next === null) return
    const url = next.trim()
    run((ed) => {
      if (!url) {
        ed.dispatchCommand(TOGGLE_LINK_COMMAND, null)
        return
      }
      const href = /^(https?:|mailto:|tel:)/i.test(url) ? url : `https://${url}`
      ed.dispatchCommand(TOGGLE_LINK_COMMAND, {
        url: href,
        target: "_blank",
        rel: "noreferrer",
      })
    })
  }

  return (
    <div className="flex flex-wrap items-center gap-1">
      <ToolbarButton
        disabled={disabled}
        active={formats.heading === "h1"}
        title="Heading 1"
        onClick={() => toggleHeading("h1")}
      >
        <IconH1 className="size-3.5" />
      </ToolbarButton>
      <ToolbarButton
        disabled={disabled}
        active={formats.heading === "h2"}
        title="Heading 2"
        onClick={() => toggleHeading("h2")}
      >
        <IconH2 className="size-3.5" />
      </ToolbarButton>
      <ToolbarButton
        disabled={disabled}
        active={formats.heading === "h3"}
        title="Heading 3"
        onClick={() => toggleHeading("h3")}
      >
        <IconH3 className="size-3.5" />
      </ToolbarButton>
      <ToolbarDivider />
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
        active={formats.underline}
        title="Underline"
        onClick={() =>
          run((ed) => ed.dispatchCommand(FORMAT_TEXT_COMMAND, "underline"))
        }
      >
        <IconUnderline className="size-3.5" />
      </ToolbarButton>
      <ToolbarButton
        disabled={disabled}
        active={formats.strikethrough}
        title="Strikethrough"
        onClick={() =>
          run((ed) => ed.dispatchCommand(FORMAT_TEXT_COMMAND, "strikethrough"))
        }
      >
        <IconStrikethrough className="size-3.5" />
      </ToolbarButton>
      <ToolbarButton
        disabled={disabled}
        active={formats.code}
        title="Inline code"
        onClick={() => run((ed) => ed.dispatchCommand(FORMAT_TEXT_COMMAND, "code"))}
      >
        <IconCode className="size-3.5" />
      </ToolbarButton>
      <ToolbarDivider />
      <ToolbarButton
        disabled={disabled}
        active={formats.link}
        title="Link"
        onClick={toggleLink}
      >
        <IconLink className="size-3.5" />
      </ToolbarButton>
      <ToolbarButton
        disabled={disabled}
        title="Divider"
        onClick={() =>
          run((ed) =>
            ed.dispatchCommand(INSERT_HORIZONTAL_RULE_COMMAND, undefined),
          )
        }
      >
        <IconMinus className="size-3.5" />
      </ToolbarButton>
      <ToolbarDivider />
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

function ToolbarDivider() {
  return <span className="mx-0.5 h-4 w-px bg-border" aria-hidden />
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
      theme: markdownEditorTheme,
      editable: !disabled,
      onError(error: Error) {
        console.error(error)
      },
      nodes: markdownEditorNodes,
      editorState: () => {
        $convertFromMarkdownString(value || "", MARKDOWN_TRANSFORMERS)
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
