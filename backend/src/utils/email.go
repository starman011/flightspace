package utils

import (
	"errors"
	"regexp"
	"strings"
)

// Email normalization that intentionally does NOT fold homoglyphs.
//
// We lowercase (ASCII only), trim whitespace, and reject any non-ASCII
// characters. This prevents two classes of account-confusion attacks:
//
//  1. Accent-insensitive collisions: `raj@gmail.com` vs `raj@gmáil.com` —
//     naive NFKC/NFKD folding would collapse `á → a`, letting an attacker
//     sign up for a visually-identical email and later reset/hijack the
//     real account.
//
//  2. Homoglyph attacks: Cyrillic `а` (U+0430) looks identical to Latin
//     `a` (U+0061) but is a different codepoint. Unicode-aware
//     case-folding in some libraries treats them as equivalent.
//
// The safe policy: require emails to be ASCII-only in both local part
// and domain. Users with IDN domains must submit the punycode form
// themselves — this is the same policy Gmail, GitHub, and Auth0 apply.
//
// For the domain component we additionally lowercase (domains are
// case-insensitive per RFC 1035). The local part is case-preserving in
// RFC 5321 but almost no provider enforces it, so we lowercase it too
// for a deterministic unique key. This is safe precisely because we've
// already rejected all non-ASCII.
var (
	errEmailNonASCII  = errors.New("email contains non-ASCII characters")
	errEmailFormat    = errors.New("invalid email format")
	errEmailEmpty     = errors.New("email is required")
	errEmailTooLong   = errors.New("email exceeds 254 characters")
	strictEmailRegexp = regexp.MustCompile(`^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$`)
)

// NormalizeEmail returns a canonical lowercase ASCII form of the email,
// or an error if the input contains any non-ASCII byte or fails basic
// format validation. The returned value is safe to use as a uniqueness
// key — distinct-looking Unicode strings cannot collide with it.
func NormalizeEmail(raw string) (string, error) {
	s := strings.TrimSpace(raw)
	if s == "" {
		return "", errEmailEmpty
	}
	if len(s) > 254 {
		return "", errEmailTooLong
	}
	// Reject any byte > 0x7F — this catches accented chars, Cyrillic
	// homoglyphs, zero-width joiners, RTL overrides, and every other
	// Unicode trick without needing to enumerate them.
	for i := 0; i < len(s); i++ {
		if s[i] > 0x7F {
			return "", errEmailNonASCII
		}
	}
	s = strings.ToLower(s)
	if !strictEmailRegexp.MatchString(s) {
		return "", errEmailFormat
	}
	return s, nil
}
