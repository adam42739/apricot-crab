import NavBanner from '../../Components/NavBanner/NavBanner'
import './FlightDisruption.css'

function FlightDisruption() {
  return (
    <div className="page">
      <NavBanner />
      <main className="flight-disruption">
        <h1 className="flight-disruption-title">Flight Disruption</h1>
        <div className="flight-disruption-search">
          <div className="flight-disruption-field">
            <label htmlFor="airline">Airline</label>
            <input id="airline" type="text" />
          </div>
          <div className="flight-disruption-field">
            <label htmlFor="origin">Origin</label>
            <input id="origin" type="text" />
          </div>
          <div className="flight-disruption-field">
            <label htmlFor="destination">Destination</label>
            <input id="destination" type="text" />
          </div>
          <div className="flight-disruption-field">
            <label htmlFor="date">Date</label>
            <input id="date" type="text" />
          </div>
          <button type="button">Search Flights</button>
        </div>
      </main>
    </div>
  )
}

export default FlightDisruption
