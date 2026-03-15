package utils

// MetersToFeet converts meters to feet.
func MetersToFeet(m float64) float64 {
	return m * 3.28084
}

// MpsToKnots converts meters/second to knots.
func MpsToKnots(mps float64) float64 {
	return mps * 1.94384
}

// TrimCallsign removes trailing spaces from a raw OpenSky callsign.
func TrimCallsign(s string) string {
	result := []byte(s)
	end := len(result)
	for end > 0 && result[end-1] == ' ' {
		end--
	}
	return string(result[:end])
}
