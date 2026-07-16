import { useEffect, useRef, useState } from 'react'
import './NavBanner.css'

// How close to the top of the viewport (in px) the cursor must be to reveal
// the banner once the page has been scrolled down.
const TOP_HOVER_ZONE = 80
// How long the cursor can stay away from the top before the banner hides.
const HIDE_DELAY_MS = 2500

function NavBanner() {
  const path = window.location.pathname
  const [visible, setVisible] = useState(true)
  const hideTimer = useRef(null)
  const lastPointerY = useRef(0)

  useEffect(() => {
    const clearHideTimer = () => {
      if (hideTimer.current) {
        clearTimeout(hideTimer.current)
        hideTimer.current = null
      }
    }

    const update = (pointerY) => {
      // At the very top of the page the banner is always shown.
      if (window.scrollY <= 0) {
        clearHideTimer()
        setVisible(true)
        return
      }

      if (pointerY <= TOP_HOVER_ZONE) {
        // Cursor is near the top: reveal and cancel any pending hide.
        clearHideTimer()
        setVisible(true)
      } else if (!hideTimer.current) {
        // Cursor is away from the top: hide after a short delay.
        hideTimer.current = setTimeout(() => {
          setVisible(false)
          hideTimer.current = null
        }, HIDE_DELAY_MS)
      }
    }

    const handleMouseMove = (e) => {
      lastPointerY.current = e.clientY
      update(e.clientY)
    }
    const handleScroll = () => update(lastPointerY.current)

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('scroll', handleScroll, { passive: true })

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('scroll', handleScroll)
      clearHideTimer()
    }
  }, [])

  return (
    <nav className={`banner${visible ? '' : ' hidden'}`}>
      <a className={`brand${path === '/' ? ' active' : ''}`} href="/">
        <span className="logo" aria-label="Apricot Crab logo" role="img">
          <img className="logo-right" src="/crab_right.png" alt="" />
          <img className="logo-left" src="/crab_left.png" alt="" />
        </span>
        Home
      </a>
    </nav>
  )
}

export default NavBanner
