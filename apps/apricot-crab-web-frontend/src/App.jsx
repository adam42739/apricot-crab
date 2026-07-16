import FlightDisruption from './Pages/FlightDisruption/FlightDisruption'
import Home from './Pages/Home/Home'

function App() {
  const path = window.location.pathname

  if (path === '/analytics/aviation/flight-disruption') {
    return <FlightDisruption />
  }

  return <Home />
}

export default App
