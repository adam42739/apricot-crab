// Configuration for the home page title cards.
// Add a new entry here to surface another quick link on the home page.
export const titleCards = [
  {
    title: 'Flight Disruption',
    path: '/analytics/aviation/flight-disruption',
    image: '/flight_disruption.jpg',
    // Render the title as a split-flap board: two stacked rows. Each line takes
    // the full FlapBoard API (word, flapIndices, spinMinMs/spinMaxMs, cell size);
    // omitted fields fall back to "all letters flap, 5–8s window".
    flap: [{ word: 'FLIGHT' }, { word: 'DISRUPTION' }],
  },
]
