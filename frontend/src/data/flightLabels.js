// Shared flight-label lookups used by both the SSR middleware (bot HTML boards)
// and the SPA AirportPanel, so arrivals/departures read like a real board:
// "United UAL123 · Boeing 737-800" instead of "UAL123".

// ICAO callsign prefix → airline name. US carriers first, then the global
// majors that appear in our search impressions.
export const AIRLINE_BY_ICAO = {
  UAL: 'United', AAL: 'American', DAL: 'Delta', SWA: 'Southwest', JBU: 'JetBlue',
  ASA: 'Alaska', NKS: 'Spirit', FFT: 'Frontier', HAL: 'Hawaiian', SKW: 'SkyWest',
  ENY: 'Envoy Air', RPA: 'Republic', AAY: 'Allegiant', JIA: 'PSA', EDV: 'Endeavor',
  UPS: 'UPS', FDX: 'FedEx', GTI: 'Atlas Air', SCX: 'Sun Country', VXP: 'Avelo', MXY: 'Breeze',
  ACA: 'Air Canada', WJA: 'WestJet', ROU: 'Air Canada Rouge', JZA: 'Jazz',
  BAW: 'British Airways', VIR: 'Virgin Atlantic', DLH: 'Lufthansa', AFR: 'Air France',
  KLM: 'KLM', IBE: 'Iberia', SWR: 'Swiss', EZY: 'easyJet', RYR: 'Ryanair', THY: 'Turkish',
  UAE: 'Emirates', ETD: 'Etihad', QTR: 'Qatar Airways', SIA: 'Singapore Airlines',
  QFA: 'Qantas', ANZ: 'Air New Zealand', CPA: 'Cathay Pacific', ANA: 'All Nippon',
  JAL: 'Japan Airlines', KAL: 'Korean Air', AAR: 'Asiana', CCA: 'Air China',
  CES: 'China Eastern', CSN: 'China Southern', IGO: 'IndiGo', AIC: 'Air India',
  VTI: 'Vistara', SEJ: 'SpiceJet', AXB: 'Air India Express',
  AMX: 'Aeroméxico', GLO: 'GOL', AZU: 'Azul', TAM: 'LATAM', AVA: 'Avianca',
  SAS: 'SAS', FIN: 'Finnair', TAP: 'TAP Portugal', AUA: 'Austrian', BEL: 'Brussels Airlines',
  ELY: 'El Al', SVA: 'Saudia', MEA: 'Middle East Airlines', ABY: 'Air Arabia', WZZ: 'Wizz Air',
}

// ICAO aircraft type code → friendly name (common types).
export const AIRCRAFT_BY_TYPE = {
  B737: 'Boeing 737-700', B738: 'Boeing 737-800', B739: 'Boeing 737-900',
  B38M: 'Boeing 737 MAX 8', B39M: 'Boeing 737 MAX 9', B3XM: 'Boeing 737 MAX 10',
  B752: 'Boeing 757-200', B753: 'Boeing 757-300', B762: 'Boeing 767-200',
  B763: 'Boeing 767-300', B764: 'Boeing 767-400', B772: 'Boeing 777-200',
  B77L: 'Boeing 777-200LR', B77W: 'Boeing 777-300ER', B773: 'Boeing 777-300',
  B788: 'Boeing 787-8', B789: 'Boeing 787-9', B78X: 'Boeing 787-10',
  B744: 'Boeing 747-400', B748: 'Boeing 747-8', B712: 'Boeing 717',
  A319: 'Airbus A319', A320: 'Airbus A320', A321: 'Airbus A321',
  A19N: 'Airbus A319neo', A20N: 'Airbus A320neo', A21N: 'Airbus A321neo',
  A332: 'Airbus A330-200', A333: 'Airbus A330-300', A339: 'Airbus A330-900neo',
  A359: 'Airbus A350-900', A35K: 'Airbus A350-1000', A388: 'Airbus A380',
  E170: 'Embraer E170', E175: 'Embraer E175', E190: 'Embraer E190', E195: 'Embraer E195',
  E75L: 'Embraer E175', E75S: 'Embraer E175',
  CRJ2: 'Bombardier CRJ200', CRJ7: 'Bombardier CRJ700', CRJ9: 'Bombardier CRJ900',
  CRJX: 'Bombardier CRJ1000', DH8D: 'Dash 8 Q400', AT76: 'ATR 72', AT75: 'ATR 72',
  MD88: 'McDonnell Douglas MD-88', MD90: 'McDonnell Douglas MD-90',
  BCS1: 'Airbus A220-100', BCS3: 'Airbus A220-300',
}

export function airlineFromCs(cs) {
  if (!cs) return ''
  const m = String(cs).toUpperCase().match(/^[A-Z]{3}/)
  return m ? (AIRLINE_BY_ICAO[m[0]] || '') : ''
}

export function aircraftName(t) {
  return t ? (AIRCRAFT_BY_TYPE[t] || t) : ''
}
