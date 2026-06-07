package controllers

import "testing"

func TestBlogSlug(t *testing.T) {
	got := blogSlug("2026-06-06", "The Cosmic Cliffs of Carina!")
	want := "2026-06-06-the-cosmic-cliffs-of-carina"
	if got != want {
		t.Fatalf("blogSlug = %q, want %q", got, want)
	}
}

func TestBlogSlugCollapsesSymbols(t *testing.T) {
	got := blogSlug("2026-01-02", "M31: Andromeda & Friends   (Wide)")
	want := "2026-01-02-m31-andromeda-friends-wide"
	if got != want {
		t.Fatalf("blogSlug = %q, want %q", got, want)
	}
}

func TestBlogIntroDeterministic(t *testing.T) {
	a := blogIntro("2026-06-06", "Nebula")
	b := blogIntro("2026-06-06", "Nebula")
	if a != b {
		t.Fatal("blogIntro not deterministic for same date")
	}
	if a == "" {
		t.Fatal("blogIntro empty")
	}
}
