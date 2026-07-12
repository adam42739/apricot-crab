import Home from './Pages/Home/Home'
import Aviation from './Pages/Aviation/Aviation'

function App() {
  const path = window.location.pathname

  return path === '/aviation' ? <Aviation /> : <Home />
}

export default App
