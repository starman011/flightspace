package utils

import "testing"

func TestNormalizeEmail(t *testing.T) {
	tests := []struct {
		name    string
		input   string
		want    string
		wantErr bool
	}{
		// Valid
		{"simple", "user@example.com", "user@example.com", false},
		{"uppercase", "USER@EXAMPLE.COM", "user@example.com", false},
		{"whitespace", "  user@example.com  ", "user@example.com", false},
		{"mixed case", "User.Name@Gmail.COM", "user.name@gmail.com", false},
		{"plus tag", "user+tag@example.com", "user+tag@example.com", false},
		{"dots", "user.name@sub.example.com", "user.name@sub.example.com", false},

		// Invalid
		{"empty", "", "", true},
		{"no at", "userexample.com", "", true},
		{"no domain", "user@", "", true},
		{"no tld", "user@example", "", true},
		{"spaces in middle", "us er@example.com", "", true},
		{"double at", "user@@example.com", "", true},

		// Unicode/homoglyph attacks
		{"cyrillic a", "user@gmа" + "il.com", "", true},       // Cyrillic а U+0430
		{"accented", "user@gmáil.com", "", true},               // á U+00E1
		{"zero width joiner", "user@example\u200d.com", "", true},
		{"rtl override", "user@example\u202e.com", "", true},

		// Length
		{"too long", string(make([]byte, 255)) + "@x.com", "", true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := NormalizeEmail(tt.input)
			if (err != nil) != tt.wantErr {
				t.Errorf("NormalizeEmail(%q) error = %v, wantErr %v", tt.input, err, tt.wantErr)
				return
			}
			if got != tt.want {
				t.Errorf("NormalizeEmail(%q) = %q, want %q", tt.input, got, tt.want)
			}
		})
	}
}
