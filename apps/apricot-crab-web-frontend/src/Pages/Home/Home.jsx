import { useCallback, useEffect, useRef, useState } from 'react'
import NavBanner from '../../Components/NavBanner/NavBanner'
import TitleCard from '../../Components/TitleCard/TitleCard'
import { titleCards } from '../../titleCards'
import './Home.css'

// Keep these in sync with .title-card width and .title-card-grid gap.
const CARD_WIDTH_REM = 15
const CARD_GAP_REM = 1.5

function Home() {
  const gridRef = useRef(null)
  const [placeholderCount, setPlaceholderCount] = useState(0)

  // Work out how many cards fit on a row, then add just enough placeholders
  // to fill the last row all the way to the right.
  const recalculate = useCallback(() => {
    const grid = gridRef.current
    if (!grid) return

    const rootFontSize = parseFloat(
      getComputedStyle(document.documentElement).fontSize,
    )
    const cardWidth = CARD_WIDTH_REM * rootFontSize
    const gap = CARD_GAP_REM * rootFontSize

    // clientWidth excludes the scrollbar; subtract padding to get the
    // width actually available for laying out cards.
    const styles = getComputedStyle(grid)
    const paddingX =
      parseFloat(styles.paddingLeft) + parseFloat(styles.paddingRight)
    const available = grid.clientWidth - paddingX

    // n cards occupy n * cardWidth + (n - 1) * gap.
    const columns = Math.max(
      1,
      Math.floor((available + gap) / (cardWidth + gap)),
    )

    const remainder = titleCards.length % columns
    setPlaceholderCount(remainder === 0 ? 0 : columns - remainder)
  }, [])

  useEffect(() => {
    recalculate()

    // ResizeObserver keeps the fill logic in step with any layout change,
    // including window resizes.
    const observer = new ResizeObserver(recalculate)
    if (gridRef.current) observer.observe(gridRef.current)
    return () => observer.disconnect()
  }, [recalculate])

  return (
    <div className="page">
      <NavBanner />
      <section className="home-hero">
        <h1 className="home-hero-title">Apricot Crab</h1>
      </section>
      <main className="content">
        <div className="title-card-grid" ref={gridRef}>
          {titleCards.map((card) => (
            <TitleCard key={card.path} title={card.title} path={card.path} image={card.image} />
          ))}
          {Array.from({ length: placeholderCount }).map((_, i) => (
            <TitleCard key={`placeholder-${i}`} placeholder />
          ))}
        </div>
      </main>
    </div>
  )
}

export default Home
