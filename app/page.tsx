"use client"

import type React from "react"

import { useState, useRef, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import {
  FileText,
  Copy,
  Scissors,
  ClipboardPaste,
  RotateCcw,
  RotateCw,
  Save,
  FolderOpen,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Eye,
  EyeOff,
  Download,
  Edit3,
  Trash2,
} from "lucide-react"
import { Checkbox } from "@/components/ui/checkbox"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

interface TextStats {
  characters: number
  charactersWithSpaces: number
  words: number
  lines: number
  paragraphs: number
  selectedText: string
  selectedCharacters: number
  selectedWords: number
  selectedLines: number
}

interface TextStyle {
  fontSize: number
  fontFamily: string
  textColor: string
  isBold: boolean
  isItalic: boolean
  isUnderline: boolean
  letterSpacing: number
  wordSpacing: number
  textAlign?: "left" | "center" | "right" | "justify" // Added textAlign
}

interface StyledRange {
  id: string
  start: number
  end: number
  style: TextStyle
  text: string // Stored for UI display
}

interface HistoryEntry {
  text: string
  cursorPosition: number
  timestamp: number
  styledRanges: StyledRange[]
}

// --- Canvas Rendering Types ---
interface LineSegment {
  char: string
  style: TextStyle
  width: number
}

interface LineData {
  segments: LineSegment[]
  metricsWidth: number // Actual width of all segments combined
  maxHeight: number // Max height of any segment in the line
  spaces: number // Number of spaces in the line
  effectiveAlignment: "left" | "center" | "right" | "justify" // Alignment for this specific line
}
// --- End Canvas Rendering Types ---

export default function AdvancedTextEditor() {
  const [text, setText] = useState(
    "Welcome to the Advanced Text Editor! Select any part of this text to apply individual styling. The preview on the right shows how your text will look with a 600px width constraint, and you can export it as a PNG image with precise 2px padding.",
  )
  const [fontSize, setFontSize] = useState(14)
  const [fontFamily, setFontFamily] = useState("Arial")
  const [textColor, setTextColor] = useState("#737373") // Default text color for image export
  const [backgroundColor, setBackgroundColor] = useState("#ffffff")
  const [lineHeight, setLineHeight] = useState(1.5)
  const [isBold, setIsBold] = useState(false)
  const [isItalic, setIsItalic] = useState(false)
  const [isUnderline, setIsUnderline] = useState(false)
  const [textAlign, setTextAlign] = useState<"left" | "center" | "right" | "justify">("left") // Global alignment
  const [letterSpacing, setLetterSpacing] = useState(0)
  const [wordSpacing, setWordSpacing] = useState(0)
  const [showPreview, setShowPreview] = useState(true)

  // Individual styling states
  const [styledRanges, setStyledRanges] = useState<StyledRange[]>([])
  const [selectedRange, setSelectedRange] = useState<{ start: number; end: number } | null>(null)
  const [editingRangeId, setEditingRangeId] = useState<string | null>(null)

  // Editor states
  const [stats, setStats] = useState<TextStats>({
    characters: 0,
    charactersWithSpaces: 0,
    words: 0,
    lines: 0,
    paragraphs: 0,
    selectedText: "",
    selectedCharacters: 0,
    selectedWords: 0,
    selectedLines: 0,
  })

  // History for undo/redo
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [historyIndex, setHistoryIndex] = useState(-1)
  const [fileName, setFileName] = useState("untitled.txt")

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const previewCanvasRef = useRef<HTMLCanvasElement>(null)
  const exportCanvasRef = useRef<HTMLCanvasElement>(null) // Hidden canvas for export

  const fontFamilies = [
    "Arial",
    "Helvetica",
    "Times New Roman",
    "Georgia",
    "Verdana",
    "Courier New",
    "Impact",
    "Comic Sans MS",
    "Trebuchet MS",
    "Arial Black",
    "Palatino",
    "Garamond",
    "Bookman",
    "Tahoma",
    "Lucida Console",
  ]

  const calculateStats = (content: string, selectedText = ""): TextStats => {
    const characters = content.replace(/\s/g, "").length
    const charactersWithSpaces = content.length
    const words = content.trim() === "" ? 0 : content.trim().split(/\s+/).length
    const lines = content === "" ? 1 : content.split(/\r\n|\r|\n/).length
    const paragraphs = content.trim() === "" ? 0 : content.split(/\n\s*\n/).filter((p) => p.trim().length > 0).length

    const selectedCharacters = selectedText.replace(/\s/g, "").length
    const selectedWords = selectedText.trim() === "" ? 0 : selectedText.trim().split(/\s+/).length
    const selectedLines = selectedText === "" ? 0 : selectedText.split(/\r\n|\r|\n/).length

    return {
      characters,
      charactersWithSpaces,
      words,
      lines,
      paragraphs,
      selectedText,
      selectedCharacters,
      selectedWords,
      selectedLines,
    }
  }

  const getDefaultStyle = useCallback((): TextStyle => {
    return {
      fontSize,
      fontFamily,
      textColor,
      isBold,
      isItalic,
      isUnderline,
      letterSpacing,
      wordSpacing,
      textAlign, // Include global textAlign
    }
  }, [fontSize, fontFamily, textColor, isBold, isItalic, isUnderline, letterSpacing, wordSpacing, textAlign])

  const getStyleForPosition = useCallback(
    (position: number): TextStyle => {
      const applicableRange = styledRanges.find((range) => position >= range.start && position < range.end)
      return applicableRange ? applicableRange.style : getDefaultStyle()
    },
    [styledRanges, getDefaultStyle],
  )

  const handleTextChange = (newText: string) => {
    setText(newText)

    // Add to history
    const newEntry: HistoryEntry = {
      text: newText,
      cursorPosition: textareaRef.current?.selectionStart || 0,
      timestamp: Date.now(),
      styledRanges: styledRanges, // Save current styled ranges with history
    }

    const newHistory = history.slice(0, historyIndex + 1)
    newHistory.push(newEntry)

    // Keep only last 50 entries
    if (newHistory.length > 50) {
      newHistory.shift()
    }

    setHistory(newHistory)
    setHistoryIndex(newHistory.length - 1)
  }

  const handleTextSelection = () => {
    if (!textareaRef.current) return

    const start = textareaRef.current.selectionStart
    const end = textareaRef.current.selectionEnd
    const selectedText = text.slice(start, end)

    setSelectedRange(start !== end ? { start, end } : null)
    setStats(calculateStats(text, selectedText))
  }

  const applyStyleToSelection = () => {
    if (!selectedRange || selectedRange.start === selectedRange.end) return

    const selectedTextContent = text.slice(selectedRange.start, selectedRange.end)
    const newRange: StyledRange = {
      id: Date.now().toString(),
      start: selectedRange.start,
      end: selectedRange.end,
      text: selectedTextContent,
      style: getDefaultStyle(), // Capture current global style including textAlign
    }

    // Remove any overlapping ranges
    const filteredRanges = styledRanges.filter(
      (range) => range.end <= selectedRange.start || range.start >= selectedRange.end,
    )

    setStyledRanges([...filteredRanges, newRange])
    setSelectedRange(null)
  }

  const removeStyledRange = (id: string) => {
    setStyledRanges(styledRanges.filter((range) => range.id !== id))
    setEditingRangeId(null)
  }

  const updateStyledRange = (id: string, newStyle: Partial<TextStyle>) => {
    setStyledRanges(
      styledRanges.map((range) => (range.id === id ? { ...range, style: { ...range.style, ...newStyle } } : range)),
    )
  }

  const undo = () => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1
      const entry = history[newIndex]
      setText(entry.text)
      setStyledRanges(entry.styledRanges) // Restore styled ranges
      setHistoryIndex(newIndex)

      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.setSelectionRange(entry.cursorPosition, entry.cursorPosition)
          textareaRef.current.focus()
        }
      }, 0)
    }
  }

  const redo = () => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1
      const entry = history[newIndex]
      setText(entry.text)
      setStyledRanges(entry.styledRanges) // Restore styled ranges
      setHistoryIndex(newIndex)

      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.setSelectionRange(entry.cursorPosition, entry.cursorPosition)
          textareaRef.current.focus()
        }
      }, 0)
    }
  }

  const copyText = async () => {
    if (stats.selectedText) {
      await navigator.clipboard.writeText(stats.selectedText)
    } else {
      await navigator.clipboard.writeText(text)
    }
  }

  const cutText = async () => {
    if (!textareaRef.current || !stats.selectedText) return

    const start = textareaRef.current.selectionStart
    const end = textareaRef.current.selectionEnd

    await navigator.clipboard.writeText(stats.selectedText)

    const newText = text.slice(0, start) + text.slice(end)
    handleTextChange(newText)

    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.setSelectionRange(start, start)
        textareaRef.current.focus()
      }
    }, 0)
  }

  const pasteText = async () => {
    if (!textareaRef.current) return

    try {
      const clipboardText = await navigator.clipboard.readText()
      const start = textareaRef.current.selectionStart
      const end = textareaRef.current.selectionEnd

      const newText = text.slice(0, start) + clipboardText + text.slice(end)
      handleTextChange(newText)

      setTimeout(() => {
        if (textareaRef.current) {
          const newPosition = start + clipboardText.length
          textareaRef.current.setSelectionRange(newPosition, newPosition)
          textareaRef.current.focus()
        }
      }, 0)
    } catch (err) {
      console.error("Failed to paste text:", err)
    }
  }

  const saveFile = () => {
    const blob = new Blob([text], { type: "text/plain" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = fileName
    link.click()
    URL.revokeObjectURL(url)
  }

  const loadFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (e) => {
      const content = e.target?.result as string
      handleTextChange(content)
      setFileName(file.name)
      setStyledRanges([]) // Clear styled ranges on new file load
    }
    reader.readAsText(file)
  }

  // --- Canvas Rendering Logic ---
  const measureTextWidth = useCallback((ctx: CanvasRenderingContext2D, char: string, style: TextStyle) => {
    ctx.font = `${style.isItalic ? "italic" : "normal"} ${style.isBold ? "bold" : "normal"} ${style.fontSize}px ${style.fontFamily}`
    ctx.letterSpacing = `${style.letterSpacing}px`
    ctx.wordSpacing = `${style.wordSpacing}px`
    return ctx.measureText(char).width
  }, [])

  const getStyledSegments = useCallback(
    (textToProcess: string, ctx: CanvasRenderingContext2D): LineSegment[] => {
      const segments: LineSegment[] = []
      for (let i = 0; i < textToProcess.length; i++) {
        const char = textToProcess[i]
        const style = getStyleForPosition(i)
        const width = measureTextWidth(ctx, char, style)
        segments.push({ char, style, width })
      }
      return segments
    },
    [getStyleForPosition, measureTextWidth],
  )

  const wrapStyledSegments = useCallback(
    (segments: LineSegment[], targetWidth: number, ctx: CanvasRenderingContext2D): LineData[] => {
      const lines: LineData[] = []
      let currentLineSegments: LineSegment[] = []
      let currentLineMetricsWidth = 0
      let currentLineMaxHeight = 0
      let currentLineSpaces = 0
      let currentLineEffectiveAlignment: "left" | "center" | "right" | "justify" = textAlign // Default to global

      const processLine = () => {
        if (currentLineSegments.length > 0) {
          lines.push({
            segments: currentLineSegments,
            metricsWidth: currentLineMetricsWidth,
            maxHeight: currentLineMaxHeight,
            spaces: currentLineSpaces,
            effectiveAlignment: currentLineEffectiveAlignment,
          })
        }
        currentLineSegments = []
        currentLineMetricsWidth = 0
        currentLineMaxHeight = 0
        currentLineSpaces = 0
        currentLineEffectiveAlignment = textAlign // Reset to global for next line
      }

      segments.forEach((segment) => {
        const { char, width, style } = segment

        // Determine effective alignment for the current line based on segments
        // If a segment has a specific textAlign, it overrides the global for this line
        if (style.textAlign && currentLineEffectiveAlignment === textAlign) {
          currentLineEffectiveAlignment = style.textAlign
        }

        if (char === "\n") {
          processLine()
          return // Skip adding newline char to segments
        }

        // Check if adding the current segment exceeds targetWidth
        // If current line is empty, always add the segment (even if it's wider than targetWidth)
        if (currentLineMetricsWidth + width > targetWidth && currentLineSegments.length > 0) {
          // Try to break at the last space
          let lastSpaceIndex = -1
          for (let i = currentLineSegments.length - 1; i >= 0; i--) {
            if (currentLineSegments[i].char === " ") {
              lastSpaceIndex = i
              break
            }
          }

          if (lastSpaceIndex !== -1) {
            // Break at last space: move segments after space to next line
            const segmentsToMove = currentLineSegments.slice(lastSpaceIndex + 1)
            currentLineSegments = currentLineSegments.slice(0, lastSpaceIndex + 1) // Keep the space on the current line

            // Recalculate metrics for the current line
            currentLineMetricsWidth = currentLineSegments.reduce((sum, s) => sum + s.width, 0)
            currentLineMaxHeight = currentLineSegments.reduce(
              (max, s) => Math.max(max, s.style.fontSize * lineHeight),
              0,
            )
            currentLineSpaces = currentLineSegments.filter((s) => s.char === " ").length

            processLine() // Finalize current line
            currentLineSegments = segmentsToMove // Start new line with moved segments
            currentLineMetricsWidth = segmentsToMove.reduce((sum, s) => sum + s.width, 0)
            currentLineMaxHeight = segmentsToMove.reduce((max, s) => Math.max(max, s.style.fontSize * lineHeight), 0)
            currentLineSpaces = segmentsToMove.filter((s) => s.char === " ").length
            // Re-evaluate effective alignment for the new line based on its first segment
            if (currentLineSegments.length > 0 && currentLineSegments[0].style.textAlign) {
              currentLineEffectiveAlignment = currentLineSegments[0].style.textAlign
            } else {
              currentLineEffectiveAlignment = textAlign // Fallback to global
            }
          } else {
            // No space found, force break (character break)
            processLine()
          }
        }

        currentLineSegments.push(segment)
        currentLineMetricsWidth += width
        currentLineMaxHeight = Math.max(currentLineMaxHeight, style.fontSize * lineHeight)
        if (char === " ") {
          currentLineSpaces++
        }
      })
      processLine() // Process any remaining segments

      return lines
    },
    [lineHeight, textAlign],
  )

  const renderTextOnCanvas = useCallback(
    (canvas: HTMLCanvasElement, textToRender: string, targetWidth: number, forExport: boolean) => {
      const ctx = canvas.getContext("2d")
      if (!ctx) return

      // 1. Create an offscreen canvas for drawing and measurement
      const offscreenCanvas = document.createElement("canvas")
      const offscreenCtx = offscreenCanvas.getContext("2d")
      if (!offscreenCtx) return

      // Set offscreen canvas to a large enough size to contain all text without clipping
      offscreenCanvas.width = targetWidth + 200 // Max possible width for a line + buffer
      offscreenCanvas.height = 5000 // Sufficient height for long texts

      // 2. Draw all text onto the offscreen canvas
      let currentY = 0 // Start Y for drawing on offscreen canvas
      const initialPadding = 0 // No initial padding on offscreen canvas, we'll crop later

      const styledSegments = getStyledSegments(textToRender, offscreenCtx)
      const linesData = wrapStyledSegments(styledSegments, targetWidth, offscreenCtx)

      linesData.forEach((lineData) => {
        let drawX = initialPadding
        const actualLineContentWidth = lineData.metricsWidth

        // Apply horizontal alignment for drawing on offscreen canvas
        if (lineData.effectiveAlignment === "center") {
          drawX = initialPadding + (targetWidth - actualLineContentWidth) / 2
        } else if (lineData.effectiveAlignment === "right") {
          drawX = initialPadding + targetWidth - actualLineContentWidth
        } else if (
          lineData.effectiveAlignment === "justify" &&
          lineData.spaces > 0 &&
          lineData.segments.some((s) => s.char !== " ")
        ) {
          // Justify logic: distribute extra space
          const extraSpacePerGap = (targetWidth - actualLineContentWidth) / lineData.spaces
          let tempX = initialPadding
          lineData.segments.forEach((segment) => {
            offscreenCtx.font = `${segment.style.isItalic ? "italic" : "normal"} ${segment.style.isBold ? "bold" : "normal"} ${segment.style.fontSize}px ${segment.style.fontFamily}`
            offscreenCtx.fillStyle = segment.style.textColor
            offscreenCtx.textBaseline = "top"
            offscreenCtx.letterSpacing = `${segment.style.letterSpacing}px`
            offscreenCtx.wordSpacing = `${segment.style.wordSpacing}px`

            offscreenCtx.fillText(segment.char, tempX, currentY)
            if (segment.style.isUnderline) {
              const textMetrics = offscreenCtx.measureText(segment.char)
              offscreenCtx.fillRect(
                tempX,
                currentY + (textMetrics.actualBoundingBoxAscent || segment.style.fontSize * 0.8) + 2,
                textMetrics.width,
                1,
              )
            }
            tempX += segment.width
            if (segment.char === " ") {
              tempX += extraSpacePerGap
            }
          })
          currentY += lineData.maxHeight || getDefaultStyle().fontSize * lineHeight
          return // Skip default drawing for justified lines
        }

        // Default drawing for left, center, right, or non-justified lines
        let tempX = drawX
        lineData.segments.forEach((segment) => {
          offscreenCtx.font = `${segment.style.isItalic ? "italic" : "normal"} ${segment.style.isBold ? "bold" : "normal"} ${segment.style.fontSize}px ${segment.style.fontFamily}`
          offscreenCtx.fillStyle = segment.style.textColor
          offscreenCtx.textBaseline = "top"
          offscreenCtx.letterSpacing = `${segment.style.letterSpacing}px`
          offscreenCtx.wordSpacing = `${segment.style.wordSpacing}px`

          offscreenCtx.fillText(segment.char, tempX, currentY)
          if (segment.style.isUnderline) {
            const textMetrics = offscreenCtx.measureText(segment.char)
            offscreenCtx.fillRect(
              tempX,
              currentY + (textMetrics.actualBoundingBoxAscent || segment.style.fontSize * 0.8) + 2,
              textMetrics.width,
              1,
            )
          }
          tempX += segment.width
        })
        currentY += lineData.maxHeight || getDefaultStyle().fontSize * lineHeight
      })

      // 3. Get image data from the offscreen canvas to find content bounds
      // Only scan up to the drawn content height + a small buffer
      const imageData = offscreenCtx.getImageData(0, 0, offscreenCanvas.width, currentY + 10)
      const data = imageData.data
      let minX = offscreenCanvas.width,
        minY = offscreenCanvas.height,
        maxX = 0,
        maxY = 0

      let hasContent = false
      for (let i = 0; i < imageData.width; i++) {
        for (let j = 0; j < imageData.height; j++) {
          const index = (j * imageData.width + i) * 4
          if (data[index + 3] > 0) {
            // If alpha is not zero (pixel is not transparent)
            minX = Math.min(minX, i)
            minY = Math.min(minY, j)
            maxX = Math.max(maxX, i)
            maxY = Math.max(maxY, j)
            hasContent = true
          }
        }
      }

      // Handle empty content case
      if (!hasContent) {
        canvas.width = forExport ? 4 : targetWidth + 20
        canvas.height = forExport ? 4 : 200 // Min height for preview
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        if (!forExport) {
          ctx.fillStyle = backgroundColor
          ctx.fillRect(0, 0, canvas.width, canvas.height)
        }
        return
      }

      const contentWidth = maxX - minX + 1
      const contentHeight = maxY - minY + 1

      // 4. Set the target canvas dimensions and draw the cropped content
      if (forExport) {
        canvas.width = contentWidth + 4 // 2px padding on each side
        canvas.height = contentHeight + 4
        ctx.clearRect(0, 0, canvas.width, canvas.height) // Ensure transparent background

        // Draw the cropped portion from the offscreen canvas to the target export canvas
        ctx.drawImage(
          offscreenCanvas,
          minX, // Source X
          minY, // Source Y
          contentWidth, // Source Width
          contentHeight, // Source Height
          2, // Destination X (2px padding)
          2, // Destination Y (2px padding)
          contentWidth, // Destination Width
          contentHeight, // Destination Height
        )
      } else {
        // For live preview, maintain 600px width and dynamic height
        canvas.width = targetWidth + 20 // 10px padding on each side for preview
        canvas.height = currentY + 20 // Dynamic height based on content
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        ctx.fillStyle = backgroundColor
        ctx.fillRect(0, 0, canvas.width, canvas.height)

        // Draw the content from offscreenCanvas to previewCanvas
        // We want to draw the entire 600px width content, not just the tight bounds
        // So, we draw from (0,0) of offscreenCanvas up to targetWidth, and let the preview canvas handle its own padding
        ctx.drawImage(
          offscreenCanvas,
          0, // Source X (start of offscreen canvas)
          0, // Source Y (start of offscreen canvas)
          targetWidth, // Source Width (the 600px content area)
          currentY, // Source Height (total drawn height on offscreen)
          10, // Destination X (10px padding)
          10, // Destination Y (10px padding)
          targetWidth, // Destination Width
          currentY, // Destination Height
        )
      }
    },
    [backgroundColor, getStyledSegments, wrapStyledSegments, getDefaultStyle, lineHeight, textAlign],
  )
  // --- End Canvas Rendering Logic ---

  useEffect(() => {
    setStats(calculateStats(text))
    if (previewCanvasRef.current) {
      renderTextOnCanvas(previewCanvasRef.current, text, 600, false)
    }
  }, [
    text,
    styledRanges,
    fontSize,
    fontFamily,
    textColor,
    backgroundColor,
    lineHeight,
    isBold,
    isItalic,
    isUnderline,
    textAlign,
    letterSpacing,
    wordSpacing,
    renderTextOnCanvas,
  ])

  useEffect(() => {
    // Add initial entry to history
    if (history.length === 0) {
      setHistory([{ text: "", cursorPosition: 0, timestamp: Date.now(), styledRanges: [] }])
      setHistoryIndex(0)
    }
  }, [history])

  const exportPreviewAsImage = () => {
    if (!exportCanvasRef.current) return
    renderTextOnCanvas(exportCanvasRef.current, text, 600, true) // Render for export with 600px width

    const link = document.createElement("a")
    link.download = `${fileName.replace(/\.[^/.]+$/, "")}-preview.png`
    link.href = exportCanvasRef.current.toDataURL("image/png")
    link.click()
  }

  const currentEditingStyle = editingRangeId
    ? styledRanges.find((r) => r.id === editingRangeId)?.style || getDefaultStyle()
    : getDefaultStyle()

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-4">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-6">
          <div className="flex items-center justify-center gap-2 mb-2">
            <FileText className="h-8 w-8 text-blue-600" />
            <h1 className="text-3xl font-bold text-gray-900">Advanced Text Editor</h1>
          </div>
          <p className="text-gray-600">
            Full-featured text editor with real-time statistics, individual styling, and 600px preview
          </p>
        </div>

        <div className="grid gap-6">
          {/* Toolbar */}
          <Card>
            <CardContent className="p-4">
              <div className="flex flex-wrap items-center gap-2">
                <input ref={fileInputRef} type="file" accept=".txt,.md,.json" onChange={loadFile} className="hidden" />

                <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                  <FolderOpen className="w-4 h-4 mr-1" />
                  Open
                </Button>

                <Button variant="outline" size="sm" onClick={saveFile} disabled={!text}>
                  <Save className="w-4 h-4 mr-1" />
                  Save
                </Button>

                <Separator orientation="vertical" className="h-6" />

                <Button variant="outline" size="sm" onClick={undo} disabled={historyIndex <= 0}>
                  <RotateCcw className="w-4 h-4 mr-1" />
                  Undo
                </Button>

                <Button variant="outline" size="sm" onClick={redo} disabled={historyIndex >= history.length - 1}>
                  <RotateCw className="w-4 h-4 mr-1" />
                  Redo
                </Button>

                <Separator orientation="vertical" className="h-6" />

                <Button variant="outline" size="sm" onClick={copyText}>
                  <Copy className="w-4 h-4 mr-1" />
                  Copy
                </Button>

                <Button variant="outline" size="sm" onClick={cutText} disabled={!stats.selectedText}>
                  <Scissors className="w-4 h-4 mr-1" />
                  Cut
                </Button>

                <Button variant="outline" size="sm" onClick={pasteText}>
                  <ClipboardPaste className="w-4 h-4 mr-1" />
                  Paste
                </Button>

                <Separator orientation="vertical" className="h-6" />

                {/* Global Alignment Buttons (still here for default) */}
                <Button
                  variant={textAlign === "left" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setTextAlign("left")}
                >
                  <AlignLeft className="w-4 h-4" />
                </Button>

                <Button
                  variant={textAlign === "center" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setTextAlign("center")}
                >
                  <AlignCenter className="w-4 h-4" />
                </Button>

                <Button
                  variant={textAlign === "right" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setTextAlign("right")}
                >
                  <AlignRight className="w-4 h-4" />
                </Button>

                <Button
                  variant={textAlign === "justify" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setTextAlign("justify")}
                >
                  <AlignJustify className="w-4 h-4" />
                </Button>

                <Separator orientation="vertical" className="h-6" />

                {/* Preview Toggle */}
                <Button
                  variant={showPreview ? "default" : "outline"}
                  size="sm"
                  onClick={() => setShowPreview(!showPreview)}
                >
                  {showPreview ? <EyeOff className="w-4 h-4 mr-1" /> : <Eye className="w-4 h-4 mr-1" />}
                  {showPreview ? "Hide Preview" : "Show Preview"}
                </Button>

                {showPreview && (
                  <Button variant="outline" size="sm" onClick={exportPreviewAsImage}>
                    <Download className="w-4 h-4 mr-1" />
                    Export Preview
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Main Content */}
          <div className={`grid gap-6 ${showPreview ? "lg:grid-cols-5" : "lg:grid-cols-4"}`}>
            {/* Text Editor */}
            <Card className={showPreview ? "lg:col-span-2" : "lg:col-span-3"}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Document: {fileName}</CardTitle>
                  <div className="flex gap-2">
                    <Input
                      value={fileName}
                      onChange={(e) => setFileName(e.target.value)}
                      className="w-40 h-8 text-sm"
                      placeholder="filename.txt"
                    />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <Textarea
                  ref={textareaRef}
                  value={text}
                  onChange={(e) => handleTextChange(e.target.value)}
                  onSelect={handleTextSelection}
                  onKeyUp={handleTextSelection}
                  onClick={handleTextSelection}
                  placeholder="Start typing your document here..."
                  className="min-h-[500px] resize-none border-2 focus:border-blue-500 transition-colors font-mono text-sm"
                  // The textarea itself doesn't apply individual styles, only the canvas preview does.
                  // Basic styling for the editor itself:
                  style={{
                    fontSize: `${fontSize}px`,
                    fontFamily: fontFamily,
                    lineHeight: lineHeight,
                    color: textColor,
                    backgroundColor: backgroundColor,
                  }}
                />
                {selectedRange && (
                  <div className="p-3 bg-blue-50 rounded-lg border border-blue-200 mt-4">
                    <p className="text-sm font-medium text-blue-800 mb-2">
                      Selected: "{text.slice(selectedRange.start, selectedRange.end)}"
                    </p>
                    <Button onClick={applyStyleToSelection} size="sm" className="w-full">
                      <Edit3 className="w-4 h-4 mr-2" />
                      Apply Current Style to Selection
                    </Button>
                  </div>
                )}

                {/* Individual Styled Ranges */}
                {styledRanges.length > 0 && (
                  <div className="space-y-2 mt-4">
                    <Label>Individual Styles</Label>
                    <div className="space-y-2 max-h-40 overflow-y-auto">
                      {styledRanges.map((range) => (
                        <div key={range.id} className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                          <Badge variant="outline" className="text-xs">
                            {range.text.length > 20 ? range.text.slice(0, 20) + "..." : range.text}
                          </Badge>
                          <Button
                            variant={editingRangeId === range.id ? "default" : "ghost"}
                            size="sm"
                            onClick={() => setEditingRangeId(editingRangeId === range.id ? null : range.id)}
                          >
                            Edit
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => removeStyledRange(range.id)}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Preview Panel */}
            {showPreview && (
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Eye className="w-5 h-5" />
                    600px Width Preview
                  </CardTitle>
                  <p className="text-sm text-gray-600">See how your text will look with 600px width constraint</p>
                </CardHeader>
                <CardContent>
                  <div className="flex justify-center">
                    <canvas
                      ref={previewCanvasRef}
                      className="max-w-full h-auto border border-gray-200 rounded"
                      style={{
                        backgroundColor: backgroundColor,
                        imageRendering: "crisp-edges",
                      }}
                    />
                  </div>
                  <div className="mt-4 text-xs text-gray-500 space-y-1">
                    <p>• Fixed 600px width with automatic text wrapping</p>
                    <p>• Real-time formatting preview including individual styles</p>
                    <p>• Export as PNG image with transparent background and 2px padding</p>
                    <p>• Perfect for web content and fixed layouts</p>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Sidebar */}
            <div className="space-y-6">
              {/* Formatting Controls */}
              <Card>
                <CardHeader>
                  <CardTitle>{editingRangeId ? "Individual Style Editor" : "Default Formatting"}</CardTitle>
                  {editingRangeId && (
                    <p className="text-sm text-blue-600">
                      Editing: "{styledRanges.find((r) => r.id === editingRangeId)?.text}"
                    </p>
                  )}
                </CardHeader>
                <CardContent>
                  <Tabs defaultValue="font" className="w-full">
                    <TabsList className="grid w-full grid-cols-3">
                      <TabsTrigger value="font">Font</TabsTrigger>
                      <TabsTrigger value="style">Style</TabsTrigger>
                      <TabsTrigger value="layout">Layout</TabsTrigger>
                    </TabsList>

                    <TabsContent value="font" className="space-y-4">
                      <div className="space-y-2">
                        <Label>Font Family</Label>
                        <Select
                          value={currentEditingStyle.fontFamily}
                          onValueChange={(value) => {
                            if (editingRangeId) {
                              updateStyledRange(editingRangeId, { fontFamily: value })
                            } else {
                              setFontFamily(value)
                            }
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {fontFamilies.map((font) => (
                              <SelectItem key={font} value={font} style={{ fontFamily: font }}>
                                {font}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label>Font Size: {currentEditingStyle.fontSize}px</Label>
                        <Slider
                          min={8}
                          max={48}
                          step={1}
                          value={[currentEditingStyle.fontSize]}
                          onValueChange={(value) => {
                            if (editingRangeId) {
                              updateStyledRange(editingRangeId, { fontSize: value[0] })
                            } else {
                              setFontSize(value[0])
                            }
                          }}
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-2">
                          <Label>Text Color</Label>
                          <Input
                            type="color"
                            value={currentEditingStyle.textColor}
                            onChange={(e) => {
                              if (editingRangeId) {
                                updateStyledRange(editingRangeId, { textColor: e.target.value })
                              } else {
                                setTextColor(e.target.value)
                              }
                            }}
                            className="h-10"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Background</Label>
                          <Input
                            type="color"
                            value={backgroundColor}
                            onChange={(e) => setBackgroundColor(e.target.value)}
                            className="h-10"
                            disabled={!!editingRangeId} // Background applies to whole canvas, not individual text
                          />
                        </div>
                      </div>
                    </TabsContent>

                    <TabsContent value="style" className="space-y-4">
                      <div className="space-y-3">
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            id="bold"
                            checked={currentEditingStyle.isBold}
                            onCheckedChange={(checked) => {
                              if (editingRangeId) {
                                updateStyledRange(editingRangeId, { isBold: checked as boolean })
                              } else {
                                setIsBold(checked as boolean)
                              }
                            }}
                          />
                          <Label htmlFor="bold" className="font-bold">
                            Bold
                          </Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            id="italic"
                            checked={currentEditingStyle.isItalic}
                            onCheckedChange={(checked) => {
                              if (editingRangeId) {
                                updateStyledRange(editingRangeId, { isItalic: checked as boolean })
                              } else {
                                setIsItalic(checked as boolean)
                              }
                            }}
                          />
                          <Label htmlFor="italic" className="italic">
                            Italic
                          </Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            id="underline"
                            checked={currentEditingStyle.isUnderline}
                            onCheckedChange={(checked) => {
                              if (editingRangeId) {
                                updateStyledRange(editingRangeId, { isUnderline: checked as boolean })
                              } else {
                                setIsUnderline(checked as boolean)
                              }
                            }}
                          />
                          <Label htmlFor="underline" className="underline">
                            Underline
                          </Label>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label>Letter Spacing: {currentEditingStyle.letterSpacing}px</Label>
                        <Slider
                          min={-2}
                          max={10}
                          step={0.5}
                          value={[currentEditingStyle.letterSpacing]}
                          onValueChange={(value) => {
                            if (editingRangeId) {
                              updateStyledRange(editingRangeId, { letterSpacing: value[0] })
                            } else {
                              setLetterSpacing(value[0])
                            }
                          }}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label>Word Spacing: {currentEditingStyle.wordSpacing}px</Label>
                        <Slider
                          min={-5}
                          max={20}
                          step={1}
                          value={[currentEditingStyle.wordSpacing]}
                          onValueChange={(value) => {
                            if (editingRangeId) {
                              updateStyledRange(editingRangeId, { wordSpacing: value[0] })
                            } else {
                              setWordSpacing(value[0])
                            }
                          }}
                        />
                      </div>
                    </TabsContent>

                    <TabsContent value="layout" className="space-y-4">
                      <div className="space-y-2">
                        <Label>Line Height: {lineHeight}</Label>
                        <Slider
                          min={0.8}
                          max={3}
                          step={0.1}
                          value={[lineHeight]}
                          onValueChange={(value) => setLineHeight(value[0])}
                          disabled={!!editingRangeId} // Line height applies to whole document
                        />
                      </div>

                      <div className="space-y-2">
                        <Label>Text Alignment</Label>
                        <div className="grid grid-cols-2 gap-2">
                          <Button
                            variant={currentEditingStyle.textAlign === "left" ? "default" : "outline"}
                            size="sm"
                            onClick={() => {
                              if (editingRangeId) {
                                updateStyledRange(editingRangeId, { textAlign: "left" })
                              } else {
                                setTextAlign("left")
                              }
                            }}
                            className="flex items-center gap-1"
                          >
                            <AlignLeft className="w-4 h-4" />
                            Left
                          </Button>
                          <Button
                            variant={currentEditingStyle.textAlign === "center" ? "default" : "outline"}
                            size="sm"
                            onClick={() => {
                              if (editingRangeId) {
                                updateStyledRange(editingRangeId, { textAlign: "center" })
                              } else {
                                setTextAlign("center")
                              }
                            }}
                            className="flex items-center gap-1"
                          >
                            <AlignCenter className="w-4 h-4" />
                            Center
                          </Button>
                          <Button
                            variant={currentEditingStyle.textAlign === "right" ? "default" : "outline"}
                            size="sm"
                            onClick={() => {
                              if (editingRangeId) {
                                updateStyledRange(editingRangeId, { textAlign: "right" })
                              } else {
                                setTextAlign("right")
                              }
                            }}
                            className="flex items-center gap-1"
                          >
                            <AlignRight className="w-4 h-4" />
                            Right
                          </Button>
                          <Button
                            variant={currentEditingStyle.textAlign === "justify" ? "default" : "outline"}
                            size="sm"
                            onClick={() => {
                              if (editingRangeId) {
                                updateStyledRange(editingRangeId, { textAlign: "justify" })
                              } else {
                                setTextAlign("justify")
                              }
                            }}
                            className="flex items-center gap-1"
                          >
                            <AlignJustify className="w-4 h-4" />
                            Justify
                          </Button>
                        </div>
                      </div>
                    </TabsContent>
                  </Tabs>
                  {editingRangeId && (
                    <Button onClick={() => setEditingRangeId(null)} variant="outline" className="w-full mt-4">
                      Done Editing
                    </Button>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
        {/* Hidden canvas for export */}
        <canvas ref={exportCanvasRef} className="hidden" />
      </div>
    </div>
  )
}
