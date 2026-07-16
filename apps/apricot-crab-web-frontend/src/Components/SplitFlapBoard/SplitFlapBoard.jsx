import { useEffect, useRef, useState } from 'react'
import './SplitFlapBoard.css'

// One flip step (a single fold) lasts this long; the CSS animation duration is
// driven by the --flip-ms variable set on the root, so keep them in sync.
const FLIP_MS = 140
// Cells shuffle for a burst of this many flips before settling on their value.
const MIN_FLIPS = 6
const MAX_FLIPS = 14
// Cells within a section start their burst slightly after their neighbour, so
// the flips ripple left-to-right instead of all firing at once.
const CELL_STAGGER_MS = 55
// Each section re-flips on its own timer somewhere in this window.
const SPIN_MIN_MS = 5000
const SPIN_MAX_MS = 8000

// Cell geometry. These mirror the CSS custom properties on .split-flap-board
// and are used to work out whether all three sections fit; keep them in sync.
const FLAP_W_REM = 2.4
const FLAP_GAP_REM = 0.15
const SECTION_GAP_REM = 2.5

const SHUFFLE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'

// Characters that are never animated: separators and the blank between words.
const FIXED_CHARS = new Set([':', '/', ' '])

const prefersReducedMotion =
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

function randomShuffleChar() {
  return SHUFFLE_CHARS[Math.floor(Math.random() * SHUFFLE_CHARS.length)]
}

function pad(value) {
  return String(value).padStart(2, '0')
}

// Section value sources — module-level so their identity is stable and they can
// be read fresh (in the user's local time zone) each time a section flips.
function getTimeText() {
  const now = new Date()
  return `${pad(now.getHours())}:${pad(now.getMinutes())}`
}

function getDateText() {
  const now = new Date()
  return `${pad(now.getMonth() + 1)}/${pad(now.getDate())}/${now.getFullYear()}`
}

function getTitleText() {
  return 'APRICOT CRAB'
}

function sectionWidthRem(cellCount) {
  return cellCount * FLAP_W_REM + (cellCount - 1) * FLAP_GAP_REM
}

// Width needed to show all three sections plus the gaps between them.
const REQUIRED_REM =
  sectionWidthRem(5) +
  sectionWidthRem(12) +
  sectionWidthRem(10) +
  2 * SECTION_GAP_REM

/**
 * A single split-flap character cell. At rest it shows `target` across both
 * halves. When `spinToken` changes it runs a burst of fold animations through
 * random characters before settling back on the current `target`.
 */
function Flap({ target, spinToken, index, fixed }) {
  const [current, setCurrent] = useState(target)
  // The character being folded to mid-flip, or null when the cell is at rest.
  const [flipTo, setFlipTo] = useState(null)
  const timersRef = useRef([])

  // Separators/blanks never animate, but should still track their value.
  useEffect(() => {
    if (fixed) setCurrent(target)
  }, [fixed, target])

  useEffect(() => {
    // spinToken starts at 0; the first real spin is 1.
    if (fixed || spinToken === 0) return

    const finalChar = target

    if (prefersReducedMotion) {
      setCurrent(finalChar)
      return
    }

    const timers = timersRef.current
    const totalFlips =
      MIN_FLIPS + Math.floor(Math.random() * (MAX_FLIPS - MIN_FLIPS + 1))
    let flipsDone = 0
    let cancelled = false

    const runStep = () => {
      if (cancelled) return
      flipsDone += 1
      const isLast = flipsDone >= totalFlips
      const nextChar = isLast ? finalChar : randomShuffleChar()
      setFlipTo(nextChar)

      // Commit the fold once the CSS animation has run its course.
      const commit = setTimeout(() => {
        if (cancelled) return
        setCurrent(nextChar)
        setFlipTo(null) // brief rest so the next fold remounts and replays
        if (!isLast) {
          const gap = setTimeout(runStep, 20)
          timers.push(gap)
        }
      }, FLIP_MS)
      timers.push(commit)
    }

    // Stagger the start so the section ripples left-to-right.
    const start = setTimeout(runStep, index * CELL_STAGGER_MS)
    timers.push(start)

    return () => {
      cancelled = true
      timers.forEach(clearTimeout)
      timersRef.current = []
    }
    // Intentionally only re-run on a new spin; target is read fresh above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spinToken])

  const flipping = flipTo !== null
  // Static background: the top half already shows the incoming character (it is
  // revealed as the top flap folds away), the bottom half still shows the
  // outgoing one until the bottom flap covers it.
  const staticTopChar = flipTo ?? current
  const staticBottomChar = current
  const isBlank = current === ' ' || current === ''

  return (
    <div className={`flap${isBlank ? ' flap-blank' : ''}`}>
      <div className="flap-half flap-half-top">
        <span className="flap-char">{staticTopChar}</span>
      </div>
      <div className="flap-half flap-half-bottom">
        <span className="flap-char">{staticBottomChar}</span>
      </div>
      {flipping && (
        <>
          <div className="flap-half flap-half-top flap-fold-top">
            <span className="flap-char">{current}</span>
          </div>
          <div className="flap-half flap-half-bottom flap-fold-bottom">
            <span className="flap-char">{flipTo}</span>
          </div>
        </>
      )}
    </div>
  )
}

/**
 * One aligned section of the board (time / title / date). Owns its own flip
 * timer so each section animates independently.
 */
function BoardSection({ getText, align, hidden, header }) {
  const [spinToken, setSpinToken] = useState(0)
  const [text, setText] = useState(getText)

  useEffect(() => {
    let cancelled = false
    let timer

    const schedule = () => {
      const delay = SPIN_MIN_MS + Math.random() * (SPIN_MAX_MS - SPIN_MIN_MS)
      timer = setTimeout(() => {
        if (cancelled) return
        setText(getText()) // pick up the current time/date before flipping
        setSpinToken((token) => token + 1)
        schedule()
      }, delay)
    }

    schedule()
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [getText])

  return (
    <div
      className={`board-column board-column-${align}${
        hidden ? ' board-column-hidden' : ''
      }`}
      aria-hidden={hidden ? 'true' : undefined}
    >
      <span className="board-column-header">{header}</span>
      <div className="board-section">
        {text.split('').map((char, i) => (
          <Flap
            key={i}
            target={char}
            spinToken={spinToken}
            index={i}
            fixed={FIXED_CHARS.has(char)}
          />
        ))}
      </div>
    </div>
  )
}

/**
 * Airport-style split-flap board used as the Home hero. Three sections: local
 * time (left), the site name (centre), and today's date (right). When the
 * window is too narrow for all three, only the centre section is shown.
 */
function SplitFlapBoard() {
  const rootRef = useRef(null)
  const [compact, setCompact] = useState(false)

  useEffect(() => {
    const el = rootRef.current
    if (!el) return

    const check = () => {
      const rootFontSize = parseFloat(
        getComputedStyle(document.documentElement).fontSize,
      )
      setCompact(el.clientWidth < REQUIRED_REM * rootFontSize)
    }

    check()
    const observer = new ResizeObserver(check)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <div
      className={`split-flap-board${compact ? ' split-flap-board-compact' : ''}`}
      ref={rootRef}
      style={{
        '--flip-ms': `${FLIP_MS}ms`,
      }}
      aria-label="Apricot Crab"
    >
      <BoardSection
        getText={getTimeText}
        align="start"
        hidden={compact}
        header="Time"
      />
      <BoardSection
        getText={getTitleText}
        align="center"
        hidden={false}
        header="Destination"
      />
      <BoardSection
        getText={getDateText}
        align="end"
        hidden={compact}
        header="Date"
      />
    </div>
  )
}

export default SplitFlapBoard
