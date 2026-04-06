package data

// AirportInfo holds metadata for one airport.
type AirportInfo struct {
	ICAO string
	IATA string
	Name string
	Lat  float64
	Lon  float64
}

// AirportByICAO maps ICAO codes to airport info.
// Covers the top ~200 busiest airports worldwide.
var AirportByICAO = map[string]AirportInfo{
	// ── North America ──────────────────────────────────────────────────────
	"KATL": {ICAO: "KATL", IATA: "ATL", Name: "Atlanta", Lat: 33.64, Lon: -84.43},
	"KLAX": {ICAO: "KLAX", IATA: "LAX", Name: "Los Angeles", Lat: 33.94, Lon: -118.41},
	"KORD": {ICAO: "KORD", IATA: "ORD", Name: "Chicago O'Hare", Lat: 41.97, Lon: -87.91},
	"KDFW": {ICAO: "KDFW", IATA: "DFW", Name: "Dallas/Fort Worth", Lat: 32.90, Lon: -97.04},
	"KDEN": {ICAO: "KDEN", IATA: "DEN", Name: "Denver", Lat: 39.86, Lon: -104.67},
	"KJFK": {ICAO: "KJFK", IATA: "JFK", Name: "New York JFK", Lat: 40.64, Lon: -73.78},
	"KSFO": {ICAO: "KSFO", IATA: "SFO", Name: "San Francisco", Lat: 37.62, Lon: -122.38},
	"KSEA": {ICAO: "KSEA", IATA: "SEA", Name: "Seattle", Lat: 47.45, Lon: -122.31},
	"KLAS": {ICAO: "KLAS", IATA: "LAS", Name: "Las Vegas", Lat: 36.08, Lon: -115.15},
	"KMCO": {ICAO: "KMCO", IATA: "MCO", Name: "Orlando", Lat: 28.43, Lon: -81.31},
	"KEWR": {ICAO: "KEWR", IATA: "EWR", Name: "Newark", Lat: 40.69, Lon: -74.17},
	"KMSP": {ICAO: "KMSP", IATA: "MSP", Name: "Minneapolis", Lat: 44.88, Lon: -93.22},
	"KBOS": {ICAO: "KBOS", IATA: "BOS", Name: "Boston", Lat: 42.36, Lon: -71.01},
	"KDTW": {ICAO: "KDTW", IATA: "DTW", Name: "Detroit", Lat: 42.21, Lon: -83.35},
	"KPHL": {ICAO: "KPHL", IATA: "PHL", Name: "Philadelphia", Lat: 39.87, Lon: -75.24},
	"KLGA": {ICAO: "KLGA", IATA: "LGA", Name: "New York LaGuardia", Lat: 40.78, Lon: -73.87},
	"KFLL": {ICAO: "KFLL", IATA: "FLL", Name: "Fort Lauderdale", Lat: 26.07, Lon: -80.15},
	"KBWI": {ICAO: "KBWI", IATA: "BWI", Name: "Baltimore", Lat: 39.18, Lon: -76.67},
	"KDCA": {ICAO: "KDCA", IATA: "DCA", Name: "Washington Reagan", Lat: 38.85, Lon: -77.04},
	"KIAD": {ICAO: "KIAD", IATA: "IAD", Name: "Washington Dulles", Lat: 38.94, Lon: -77.46},
	"KSLC": {ICAO: "KSLC", IATA: "SLC", Name: "Salt Lake City", Lat: 40.79, Lon: -111.98},
	"KSAN": {ICAO: "KSAN", IATA: "SAN", Name: "San Diego", Lat: 32.73, Lon: -117.19},
	"KIAH": {ICAO: "KIAH", IATA: "IAH", Name: "Houston", Lat: 29.98, Lon: -95.34},
	"KTPA": {ICAO: "KTPA", IATA: "TPA", Name: "Tampa", Lat: 27.98, Lon: -82.53},
	"KPDX": {ICAO: "KPDX", IATA: "PDX", Name: "Portland", Lat: 45.59, Lon: -122.60},
	"KMIA": {ICAO: "KMIA", IATA: "MIA", Name: "Miami", Lat: 25.79, Lon: -80.29},
	"KSTL": {ICAO: "KSTL", IATA: "STL", Name: "St. Louis", Lat: 38.75, Lon: -90.37},
	"KHNL": {ICAO: "KHNL", IATA: "HNL", Name: "Honolulu", Lat: 21.32, Lon: -157.92},
	"PANC": {ICAO: "PANC", IATA: "ANC", Name: "Anchorage", Lat: 61.17, Lon: -149.99},
	"CYYZ": {ICAO: "CYYZ", IATA: "YYZ", Name: "Toronto Pearson", Lat: 43.68, Lon: -79.63},
	"CYVR": {ICAO: "CYVR", IATA: "YVR", Name: "Vancouver", Lat: 49.19, Lon: -123.18},
	"CYUL": {ICAO: "CYUL", IATA: "YUL", Name: "Montreal", Lat: 45.47, Lon: -73.74},
	"CYOW": {ICAO: "CYOW", IATA: "YOW", Name: "Ottawa", Lat: 45.32, Lon: -75.67},
	"CYCL": {ICAO: "CYCL", IATA: "YCL", Name: "Calgary", Lat: 51.11, Lon: -114.02},
	"MMMX": {ICAO: "MMMX", IATA: "MEX", Name: "Mexico City", Lat: 19.44, Lon: -99.07},
	"MMUN": {ICAO: "MMUN", IATA: "CUN", Name: "Cancun", Lat: 21.04, Lon: -86.87},

	// ── Europe ─────────────────────────────────────────────────────────────
	"EGLL": {ICAO: "EGLL", IATA: "LHR", Name: "London Heathrow", Lat: 51.47, Lon: -0.46},
	"EGKK": {ICAO: "EGKK", IATA: "LGW", Name: "London Gatwick", Lat: 51.15, Lon: -0.19},
	"EGSS": {ICAO: "EGSS", IATA: "STN", Name: "London Stansted", Lat: 51.89, Lon: 0.24},
	"EGLC": {ICAO: "EGLC", IATA: "LCY", Name: "London City", Lat: 51.50, Lon: 0.05},
	"LFPG": {ICAO: "LFPG", IATA: "CDG", Name: "Paris CDG", Lat: 49.01, Lon: 2.55},
	"LFPO": {ICAO: "LFPO", IATA: "ORY", Name: "Paris Orly", Lat: 48.72, Lon: 2.36},
	"EDDF": {ICAO: "EDDF", IATA: "FRA", Name: "Frankfurt", Lat: 50.03, Lon: 8.57},
	"EDDM": {ICAO: "EDDM", IATA: "MUC", Name: "Munich", Lat: 48.36, Lon: 11.79},
	"EDDB": {ICAO: "EDDB", IATA: "BER", Name: "Berlin", Lat: 52.36, Lon: 13.51},
	"EHAM": {ICAO: "EHAM", IATA: "AMS", Name: "Amsterdam", Lat: 52.31, Lon: 4.77},
	"LEMD": {ICAO: "LEMD", IATA: "MAD", Name: "Madrid", Lat: 40.47, Lon: -3.56},
	"LEBL": {ICAO: "LEBL", IATA: "BCN", Name: "Barcelona", Lat: 41.30, Lon: 2.08},
	"LIRF": {ICAO: "LIRF", IATA: "FCO", Name: "Rome Fiumicino", Lat: 41.80, Lon: 12.25},
	"LIMC": {ICAO: "LIMC", IATA: "MXP", Name: "Milan Malpensa", Lat: 45.63, Lon: 8.72},
	"LSZH": {ICAO: "LSZH", IATA: "ZRH", Name: "Zurich", Lat: 47.46, Lon: 8.55},
	"LOWW": {ICAO: "LOWW", IATA: "VIE", Name: "Vienna", Lat: 48.11, Lon: 16.57},
	"EKCH": {ICAO: "EKCH", IATA: "CPH", Name: "Copenhagen", Lat: 55.62, Lon: 12.66},
	"ESSA": {ICAO: "ESSA", IATA: "ARN", Name: "Stockholm", Lat: 59.65, Lon: 17.92},
	"EFHK": {ICAO: "EFHK", IATA: "HEL", Name: "Helsinki", Lat: 60.32, Lon: 24.96},
	"ENGM": {ICAO: "ENGM", IATA: "OSL", Name: "Oslo", Lat: 60.19, Lon: 11.10},
	"EIDW": {ICAO: "EIDW", IATA: "DUB", Name: "Dublin", Lat: 53.42, Lon: -6.27},
	"LPPT": {ICAO: "LPPT", IATA: "LIS", Name: "Lisbon", Lat: 38.77, Lon: -9.13},
	"EBBR": {ICAO: "EBBR", IATA: "BRU", Name: "Brussels", Lat: 50.90, Lon: 4.48},
	"EPWA": {ICAO: "EPWA", IATA: "WAW", Name: "Warsaw", Lat: 52.17, Lon: 20.97},
	"LKPR": {ICAO: "LKPR", IATA: "PRG", Name: "Prague", Lat: 50.10, Lon: 14.26},
	"LHBP": {ICAO: "LHBP", IATA: "BUD", Name: "Budapest", Lat: 47.44, Lon: 19.26},
	"LGAV": {ICAO: "LGAV", IATA: "ATH", Name: "Athens", Lat: 37.94, Lon: 23.94},
	"LTFM": {ICAO: "LTFM", IATA: "IST", Name: "Istanbul", Lat: 41.27, Lon: 28.74},
	"LTBA": {ICAO: "LTBA", IATA: "ISL", Name: "Istanbul Ataturk", Lat: 40.98, Lon: 28.82},
	"UUEE": {ICAO: "UUEE", IATA: "SVO", Name: "Moscow Sheremetyevo", Lat: 55.97, Lon: 37.41},
	"UUDD": {ICAO: "UUDD", IATA: "DME", Name: "Moscow Domodedovo", Lat: 55.41, Lon: 37.91},

	// ── Middle East ────────────────────────────────────────────────────────
	"OMDB": {ICAO: "OMDB", IATA: "DXB", Name: "Dubai", Lat: 25.25, Lon: 55.36},
	"OMDW": {ICAO: "OMDW", IATA: "DWC", Name: "Dubai World Central", Lat: 24.90, Lon: 55.16},
	"OMAA": {ICAO: "OMAA", IATA: "AUH", Name: "Abu Dhabi", Lat: 24.43, Lon: 54.65},
	"OTHH": {ICAO: "OTHH", IATA: "DOH", Name: "Doha", Lat: 25.27, Lon: 51.61},
	"OEJN": {ICAO: "OEJN", IATA: "JED", Name: "Jeddah", Lat: 21.68, Lon: 39.16},
	"OERK": {ICAO: "OERK", IATA: "RUH", Name: "Riyadh", Lat: 24.96, Lon: 46.70},
	"LLBG": {ICAO: "LLBG", IATA: "TLV", Name: "Tel Aviv", Lat: 32.01, Lon: 34.89},
	"OIIE": {ICAO: "OIIE", IATA: "IKA", Name: "Tehran", Lat: 35.42, Lon: 51.15},

	// ── Asia ───────────────────────────────────────────────────────────────
	"RJTT": {ICAO: "RJTT", IATA: "HND", Name: "Tokyo Haneda", Lat: 35.55, Lon: 139.78},
	"RJAA": {ICAO: "RJAA", IATA: "NRT", Name: "Tokyo Narita", Lat: 35.77, Lon: 140.39},
	"RJBB": {ICAO: "RJBB", IATA: "KIX", Name: "Osaka Kansai", Lat: 34.43, Lon: 135.24},
	"ZBAA": {ICAO: "ZBAA", IATA: "PEK", Name: "Beijing", Lat: 40.08, Lon: 116.60},
	"ZSPD": {ICAO: "ZSPD", IATA: "PVG", Name: "Shanghai Pudong", Lat: 31.14, Lon: 121.81},
	"ZSSS": {ICAO: "ZSSS", IATA: "SHA", Name: "Shanghai Hongqiao", Lat: 31.20, Lon: 121.34},
	"ZGGG": {ICAO: "ZGGG", IATA: "CAN", Name: "Guangzhou", Lat: 23.39, Lon: 113.30},
	"ZGSZ": {ICAO: "ZGSZ", IATA: "SZX", Name: "Shenzhen", Lat: 22.64, Lon: 113.81},
	"VHHH": {ICAO: "VHHH", IATA: "HKG", Name: "Hong Kong", Lat: 22.31, Lon: 113.92},
	"RKSI": {ICAO: "RKSI", IATA: "ICN", Name: "Seoul Incheon", Lat: 37.46, Lon: 126.44},
	"WSSS": {ICAO: "WSSS", IATA: "SIN", Name: "Singapore", Lat: 1.36, Lon: 103.99},
	"VTBS": {ICAO: "VTBS", IATA: "BKK", Name: "Bangkok", Lat: 13.68, Lon: 100.75},
	"WMKK": {ICAO: "WMKK", IATA: "KUL", Name: "Kuala Lumpur", Lat: 2.75, Lon: 101.71},
	"WIII": {ICAO: "WIII", IATA: "CGK", Name: "Jakarta", Lat: -6.13, Lon: 106.66},
	"RPLL": {ICAO: "RPLL", IATA: "MNL", Name: "Manila", Lat: 14.51, Lon: 121.02},
	"VVNB": {ICAO: "VVNB", IATA: "HAN", Name: "Hanoi", Lat: 21.22, Lon: 105.81},
	"VVTS": {ICAO: "VVTS", IATA: "SGN", Name: "Ho Chi Minh City", Lat: 10.82, Lon: 106.65},
	"VIDP": {ICAO: "VIDP", IATA: "DEL", Name: "New Delhi", Lat: 28.56, Lon: 77.10},
	"VABB": {ICAO: "VABB", IATA: "BOM", Name: "Mumbai", Lat: 19.09, Lon: 72.87},
	"VOBL": {ICAO: "VOBL", IATA: "BLR", Name: "Bangalore", Lat: 13.20, Lon: 77.71},
	"VOMM": {ICAO: "VOMM", IATA: "MAA", Name: "Chennai", Lat: 12.99, Lon: 80.17},
	"VECC": {ICAO: "VECC", IATA: "CCU", Name: "Kolkata", Lat: 22.65, Lon: 88.45},
	"RCTP": {ICAO: "RCTP", IATA: "TPE", Name: "Taipei", Lat: 25.08, Lon: 121.23},
	"ZUUU": {ICAO: "ZUUU", IATA: "CTU", Name: "Chengdu", Lat: 30.57, Lon: 103.95},

	// ── Oceania ─────────────────────────────────────────────────────────────
	"YSSY": {ICAO: "YSSY", IATA: "SYD", Name: "Sydney", Lat: -33.95, Lon: 151.18},
	"YMML": {ICAO: "YMML", IATA: "MEL", Name: "Melbourne", Lat: -37.67, Lon: 144.84},
	"YBBN": {ICAO: "YBBN", IATA: "BNE", Name: "Brisbane", Lat: -27.38, Lon: 153.12},
	"YPPH": {ICAO: "YPPH", IATA: "PER", Name: "Perth", Lat: -31.94, Lon: 115.97},
	"NZAA": {ICAO: "NZAA", IATA: "AKL", Name: "Auckland", Lat: -37.01, Lon: 174.79},

	// ── South America ──────────────────────────────────────────────────────
	"SBGR": {ICAO: "SBGR", IATA: "GRU", Name: "Sao Paulo", Lat: -23.43, Lon: -46.47},
	"SBGL": {ICAO: "SBGL", IATA: "GIG", Name: "Rio de Janeiro", Lat: -22.81, Lon: -43.25},
	"SCEL": {ICAO: "SCEL", IATA: "SCL", Name: "Santiago", Lat: -33.39, Lon: -70.79},
	"SKBO": {ICAO: "SKBO", IATA: "BOG", Name: "Bogota", Lat: 4.70, Lon: -74.15},
	"SPJC": {ICAO: "SPJC", IATA: "LIM", Name: "Lima", Lat: -12.02, Lon: -77.11},
	"SAEZ": {ICAO: "SAEZ", IATA: "EZE", Name: "Buenos Aires", Lat: -34.82, Lon: -58.54},

	// ── Africa ──────────────────────────────────────────────────────────────
	"FAOR": {ICAO: "FAOR", IATA: "JNB", Name: "Johannesburg", Lat: -26.13, Lon: 28.23},
	"FACT": {ICAO: "FACT", IATA: "CPT", Name: "Cape Town", Lat: -33.97, Lon: 18.60},
	"HECA": {ICAO: "HECA", IATA: "CAI", Name: "Cairo", Lat: 30.12, Lon: 31.41},
	"DNMM": {ICAO: "DNMM", IATA: "LOS", Name: "Lagos", Lat: 6.58, Lon: 3.32},
	"HKJK": {ICAO: "HKJK", IATA: "NBO", Name: "Nairobi", Lat: -1.32, Lon: 36.93},
	"GMMN": {ICAO: "GMMN", IATA: "CMN", Name: "Casablanca", Lat: 33.37, Lon: -7.59},
	"HAAB": {ICAO: "HAAB", IATA: "ADD", Name: "Addis Ababa", Lat: 8.98, Lon: 38.80},
}

// LookupICAO returns airport info for an ICAO code, or nil if not found.
func LookupICAO(icao string) *AirportInfo {
	a, ok := AirportByICAO[icao]
	if !ok {
		return nil
	}
	return &a
}
