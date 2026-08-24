package controllers

import (
	"strings"
	"testing"
)

// Fixtures captured from youtube.com/embed/<id> with a Referer set. Without the
// Referer every id returns "Error 153", which is why this check has to send one.
func TestPlayabilityStatusParsing(t *testing.T) {
	cases := []struct {
		name, body, want string
	}{
		{"playable", `\"previewPlayabilityStatus\":{\"status\":\"OK\",\"playableInEmbed\":true`, "OK"},
		{"private", `\"previewPlayabilityStatus\":{\"status\":\"LOGIN_REQUIRED\",\"reason\":\"This video is private\"`, "LOGIN_REQUIRED"},
		{"ended stream", `\"previewPlayabilityStatus\":{\"status\":\"UNPLAYABLE\",\"reason\":\"This live stream recording is not available.\"`, "UNPLAYABLE"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			unescaped := strings.ReplaceAll(c.body, `\"`, `"`)
			m := playabilityRe.FindStringSubmatch(unescaped)
			if m == nil {
				t.Fatalf("no status matched in %q", c.body)
			}
			if m[1] != c.want {
				t.Fatalf("status = %q, want %q", m[1], c.want)
			}
			if (m[1] == "OK") != (c.want == "OK") {
				t.Fatal("playable verdict disagrees with the parsed status")
			}
		})
	}
}

// A body with no marker at all (an error page, a bot wall) must not read as playable.
func TestPlayabilityMissingMarkerIsNotPlayable(t *testing.T) {
	if playabilityRe.FindStringSubmatch(`<html>nothing useful here</html>`) != nil {
		t.Fatal("matched a status in a body that has none")
	}
}
