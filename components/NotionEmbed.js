import { useEffect, useRef, useState } from 'react'
import { useNotionContext } from 'react-notion-x'

export const HTML_ARTIFACT_RESIZE_MESSAGE = 'notion-next:html-artifact-resize'
export const HTML_ARTIFACT_MEASURE_MESSAGE = 'notion-next:html-artifact-measure'
export const HTML_ARTIFACT_MIN_HEIGHT = 32
export const HTML_ARTIFACT_MAX_HEIGHT = 4096
export const HTML_ARTIFACT_QUERY_PARAM = 'htmlBlock'

const clearHtmlArtifactQuery = blockId => {
  const url = new URL(window.location.href)
  if (url.searchParams.get(HTML_ARTIFACT_QUERY_PARAM) !== blockId) return

  url.searchParams.delete(HTML_ARTIFACT_QUERY_PARAM)
  window.history.replaceState(window.history.state, '', url.toString())
}

const HTML_ARTIFACT_RESIZE_BRIDGE = `<script data-notion-next-auto-height>
(() => {
  if (window.__notionNextHtmlArtifactAutoHeight) return
  window.__notionNextHtmlArtifactAutoHeight = true

  const messageType = ${JSON.stringify(HTML_ARTIFACT_RESIZE_MESSAGE)}
  const measureMessageType = ${JSON.stringify(HTML_ARTIFACT_MEASURE_MESSAGE)}
  let frameId = null
  let lastHeight = 0

  const measure = () => {
    frameId = null
    const body = document.body
    if (!body) return

    const bodyRect = body.getBoundingClientRect()
    let contentTop = bodyRect.top
    let contentBottom = bodyRect.bottom

    for (const element of body.children) {
      const rect = element.getBoundingClientRect()
      if (rect.width === 0 && rect.height === 0) continue
      contentTop = Math.min(contentTop, rect.top)
      contentBottom = Math.max(contentBottom, rect.bottom)
    }

    const style = window.getComputedStyle(body)
    const marginTop = Number.parseFloat(style.marginTop) || 0
    const marginBottom = Number.parseFloat(style.marginBottom) || 0
    let height = contentBottom - contentTop + marginTop + marginBottom

    if (body.scrollHeight > window.innerHeight + 1) {
      height = Math.max(height, body.scrollHeight + marginTop + marginBottom)
    }

    height = Math.ceil(height)
    if (!Number.isFinite(height) || height <= 0 || height === lastHeight) return

    lastHeight = height
    window.parent.postMessage({ type: messageType, height }, '*')
  }

  const scheduleMeasure = () => {
    if (frameId !== null) return
    frameId = window.requestAnimationFrame(measure)
  }

  window.addEventListener('message', event => {
    if (event.source !== window.parent) return
    if (event.data?.type !== measureMessageType) return
    scheduleMeasure()
  })

  const start = () => {
    if (!document.body) return

    if (typeof ResizeObserver === 'function') {
      const resizeObserver = new ResizeObserver(scheduleMeasure)
      resizeObserver.observe(document.body)
    }

    if (typeof MutationObserver === 'function') {
      const mutationObserver = new MutationObserver(scheduleMeasure)
      mutationObserver.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true
      })
    }

    window.addEventListener('load', scheduleMeasure, true)
    document.fonts?.ready?.then(scheduleMeasure).catch(() => {})
    scheduleMeasure()
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true })
  } else {
    start()
  }
})()
</script>`

export const withHtmlArtifactResizeBridge = srcDoc => {
  if (typeof srcDoc !== 'string' || !srcDoc) return srcDoc

  const injectBeforeClosingTag = tagName => {
    const closingTagPattern = new RegExp(`</${tagName}\\s*>`, 'gi')
    let closingTagIndex = -1

    for (const match of srcDoc.matchAll(closingTagPattern)) {
      closingTagIndex = match.index
    }

    if (closingTagIndex < 0) return null
    return `${srcDoc.slice(
      0,
      closingTagIndex
    )}${HTML_ARTIFACT_RESIZE_BRIDGE}\n${srcDoc.slice(closingTagIndex)}`
  }

  const documentWithBridge =
    injectBeforeClosingTag('body') || injectBeforeClosingTag('html')

  if (documentWithBridge) return documentWithBridge
  return `${srcDoc}\n${HTML_ARTIFACT_RESIZE_BRIDGE}`
}

export const normalizeHtmlArtifactHeight = value => {
  const height = Number(value)
  if (!Number.isFinite(height) || height <= 0) return null

  return Math.min(
    HTML_ARTIFACT_MAX_HEIGHT,
    Math.max(HTML_ARTIFACT_MIN_HEIGHT, Math.ceil(height))
  )
}

const getConfiguredHeight = (block, isHtmlArtifact) => {
  const height = Number(block?.format?.block_height)
  if (Number.isFinite(height) && height > 0) return height
  return isHtmlArtifact ? 640 : 480
}

const NotionEmbed = ({ block }) => {
  const { recordMap } = useNotionContext()
  const iframeRef = useRef(null)
  const frameContainerRef = useRef(null)
  const source =
    recordMap?.signed_urls?.[block?.id] ||
    block?.format?.display_source ||
    block?.properties?.source?.[0]?.[0]
  const isHtmlArtifact =
    block?.type === 'embed' && block?.format?.embed_variant === 'html_artifact'
  const srcDoc = isHtmlArtifact
    ? block?.format?.html_artifact_content
    : undefined
  const configuredHeight = getConfiguredHeight(block, isHtmlArtifact)
  const [height, setHeight] = useState(configuredHeight)
  const [isNativeFullscreen, setIsNativeFullscreen] = useState(false)
  const [isFallbackFullscreen, setIsFallbackFullscreen] = useState(false)
  const isFullscreen = isNativeFullscreen || isFallbackFullscreen

  const requestHtmlArtifactHeight = () => {
    if (!isHtmlArtifact) return
    iframeRef.current?.contentWindow?.postMessage(
      { type: HTML_ARTIFACT_MEASURE_MESSAGE },
      '*'
    )
  }

  useEffect(() => {
    setHeight(configuredHeight)
    setIsFallbackFullscreen(false)
  }, [block?.id, configuredHeight])

  useEffect(() => {
    if (!isHtmlArtifact || !block?.id) return

    const requestedBlockId = new URLSearchParams(window.location.search).get(
      HTML_ARTIFACT_QUERY_PARAM
    )
    if (requestedBlockId === block.id) setIsFallbackFullscreen(true)
  }, [block?.id, isHtmlArtifact])

  useEffect(() => {
    if (!isHtmlArtifact) return

    const handleFullscreenChange = () => {
      const fullscreenElement =
        document.fullscreenElement || document.webkitFullscreenElement
      setIsNativeFullscreen(fullscreenElement === frameContainerRef.current)
    }

    document.addEventListener('fullscreenchange', handleFullscreenChange)
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange)

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange)
      document.removeEventListener(
        'webkitfullscreenchange',
        handleFullscreenChange
      )
    }
  }, [isHtmlArtifact])

  useEffect(() => {
    if (!isFallbackFullscreen) return

    const previousOverflow = document.body.style.overflow
    const handleKeyDown = event => {
      if (event.key !== 'Escape') return
      setIsFallbackFullscreen(false)
      clearHtmlArtifactQuery(block?.id)
    }

    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [block?.id, isFallbackFullscreen])

  // block.id is intentionally excluded: the handler reads the current iframe
  // ref at message time, and onLoad remeasures whenever its document changes.
  useEffect(() => {
    if (!isHtmlArtifact) return

    const handleResizeMessage = event => {
      if (event.source !== iframeRef.current?.contentWindow) return
      if (event.data?.type !== HTML_ARTIFACT_RESIZE_MESSAGE) return

      const nextHeight = normalizeHtmlArtifactHeight(event.data.height)
      if (nextHeight === null) return
      setHeight(currentHeight =>
        currentHeight === nextHeight ? currentHeight : nextHeight
      )
    }

    window.addEventListener('message', handleResizeMessage)
    iframeRef.current?.contentWindow?.postMessage(
      { type: HTML_ARTIFACT_MEASURE_MESSAGE },
      '*'
    )

    return () => window.removeEventListener('message', handleResizeMessage)
  }, [isHtmlArtifact])

  if (
    !srcDoc &&
    (typeof source !== 'string' || source.startsWith('attachment:'))
  ) {
    return null
  }

  const title =
    block?.properties?.title?.[0]?.[0] ||
    (isHtmlArtifact ? 'Notion HTML block' : 'iframe embed')
  const resizableSrcDoc = isHtmlArtifact
    ? withHtmlArtifactResizeBridge(srcDoc)
    : undefined

  const toggleHtmlArtifactFullscreen = () => {
    const container = frameContainerRef.current
    if (!container) return

    if (isFallbackFullscreen) {
      setIsFallbackFullscreen(false)
      clearHtmlArtifactQuery(block?.id)
      return
    }

    const fullscreenElement =
      document.fullscreenElement || document.webkitFullscreenElement
    if (fullscreenElement === container) {
      const exitFullscreen =
        document.exitFullscreen || document.webkitExitFullscreen
      exitFullscreen?.call(document)
      return
    }

    const requestFullscreen =
      container.requestFullscreen || container.webkitRequestFullscreen
    if (!requestFullscreen) {
      setIsFallbackFullscreen(true)
      return
    }

    try {
      const result = requestFullscreen.call(container)
      result?.catch?.(() => setIsFallbackFullscreen(true))
    } catch {
      setIsFallbackFullscreen(true)
    }
  }

  const openHtmlArtifactInNewTab = () => {
    if (!block?.id) return

    const url = new URL(window.location.href)
    url.searchParams.set(HTML_ARTIFACT_QUERY_PARAM, block.id)
    window.open(url.toString(), '_blank', 'noopener,noreferrer')
  }

  return (
    <figure className='notion-asset-wrapper notion-asset-wrapper-embed'>
      <div
        ref={frameContainerRef}
        className={
          isHtmlArtifact
            ? `notion-html-artifact-frame${
                isFallbackFullscreen
                  ? ' notion-html-artifact-frame-expanded'
                  : ''
              }`
            : undefined
        }
        style={{ height, position: 'relative' }}>
        <iframe
          ref={iframeRef}
          className='notion-asset-object-fit'
          src={resizableSrcDoc ? undefined : source}
          srcDoc={resizableSrcDoc}
          title={title}
          frameBorder='0'
          loading='lazy'
          scrolling='auto'
          onLoad={requestHtmlArtifactHeight}
          allowFullScreen={!isHtmlArtifact}
          sandbox={
            isHtmlArtifact
              ? 'allow-scripts allow-forms allow-popups'
              : undefined
          }
        />
        {isHtmlArtifact && (
          <div className='notion-html-artifact-controls'>
            {!isFullscreen && (
              <button
                type='button'
                className='notion-html-artifact-control-button'
                onClick={openHtmlArtifactInNewTab}
                aria-label='在新标签页打开'
                title='在新标签页打开'>
                <i
                  className='fa-solid fa-up-right-from-square'
                  aria-hidden='true'
                />
              </button>
            )}
            <button
              type='button'
              className='notion-html-artifact-control-button'
              onClick={toggleHtmlArtifactFullscreen}
              aria-label={isFullscreen ? '退出全屏' : '全屏查看'}
              title={isFullscreen ? '退出全屏' : '全屏查看'}>
              <i
                className={`fa-solid ${
                  isFullscreen ? 'fa-compress' : 'fa-expand'
                }`}
                aria-hidden='true'
              />
            </button>
          </div>
        )}
      </div>
    </figure>
  )
}

export default NotionEmbed
