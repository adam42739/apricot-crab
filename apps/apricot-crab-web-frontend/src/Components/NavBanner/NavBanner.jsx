import './NavBanner.css'

function NavBanner() {
  const path = window.location.pathname

  return (
    <nav className="banner">
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
