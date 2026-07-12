import './NavBanner.css'

function NavBanner() {
  const path = window.location.pathname

  return (
    <nav className="banner">
      <a className={`brand${path === '/' ? ' active' : ''}`} href="/">
        <img className="logo" src="/logo.svg" alt="Apricot Crab logo" />
        Home
      </a>
      <span className="divider" aria-hidden="true"></span>
      <a
        className={`brand${path === '/aviation' ? ' active' : ''}`}
        href="/aviation"
      >
        Aviation
      </a>
    </nav>
  )
}

export default NavBanner
