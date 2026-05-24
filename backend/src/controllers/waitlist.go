package controllers

import (
	"bytes"
	"context"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/skydot/backend/src/utils"
)

type WaitlistController struct{ pool *pgxpool.Pool }

func NewWaitlistController(pool *pgxpool.Pool) *WaitlistController {
	return &WaitlistController{pool: pool}
}

// Subscribe saves an email to the waitlist and sends a confirmation via Resend.
// Idempotent — duplicate emails are silently accepted (no second email sent).
func (c *WaitlistController) Subscribe(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, 4096)
	var body struct {
		Email  string `json:"email"`
		Source string `json:"source"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		utils.Error(w, http.StatusBadRequest, "invalid json")
		return
	}

	email, err := utils.NormalizeEmail(body.Email)
	if err != nil {
		utils.Error(w, http.StatusBadRequest, "invalid email")
		return
	}

	source := body.Source
	if source == "" {
		source = "popup"
	}
	if len(source) > 50 {
		utils.Error(w, http.StatusBadRequest, "source too long")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	// rowsAffected = 0 means duplicate — skip the confirmation email
	tag, err := c.pool.Exec(ctx,
		`INSERT INTO waitlist_emails (email, source)
		 VALUES ($1, $2)
		 ON CONFLICT (email) DO NOTHING`,
		email, source,
	)
	if err != nil {
		utils.Error(w, http.StatusInternalServerError, "server error")
		return
	}

	if tag.RowsAffected() > 0 {
		go sendWaitlistEmail(email)
	}

	utils.JSON(w, http.StatusOK, map[string]string{"status": "subscribed"})
}

// sendWaitlistEmail fires a confirmation email via Resend in a goroutine.
// Failures are logged but never surface to the user.
func sendWaitlistEmail(to string) {
	apiKey := os.Getenv("RESEND_API_KEY")
	if apiKey == "" {
		log.Println(`{"level":"warn","service":"waitlist","msg":"RESEND_API_KEY not set — skipping email"}`)
		return
	}

	payload := map[string]any{
		"from":    "ObjectTracer <hello@objecttracer.com>",
		"to":      []string{to},
		"subject": "Welcome to the mission — ObjectTracer",
		"html": `<!DOCTYPE html>
<html >
<head>
<meta charset="utf-8">
</head>
<body style="margin:0;padding:0;background-color:#04080f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">

<!-- Outer wrapper -->
<table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#04080f" style="background-color:#04080f;padding:32px 16px;">
  <tr><td align="center">

  <!-- Card -->
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:580px;background-color:#08101a;border:1px solid #192808;border-radius:20px;overflow:hidden;">

    <!-- ── HERO IMAGE ── -->
    <tr>
      <td style="padding:0;position:relative;line-height:0;">
        <img src="https://images.unsplash.com/photo-1462331940025-496dfbfc7564?w=580&h=300&fit=crop&q=85"
             width="580" alt="The Milky Way"
             style="display:block;width:100%;height:auto;border-radius:19px 19px 0 0;opacity:.85;" />
        <!-- Gradient fade over hero -->
        <div style="position:absolute;bottom:0;left:0;right:0;height:120px;background:linear-gradient(to bottom,transparent,#08101a);"></div>
      </td>
    </tr>

    <!-- ── WORDMARK + QUOTE ── -->
    <tr>
      <td style="padding:0 36px 28px;">

        <p style="margin:0 0 20px;font-size:11px;font-family:'Courier New',Courier,monospace;font-weight:700;letter-spacing:.22em;text-transform:uppercase;color:#b2ff1a;">&#9711; OBJECTTRACER</p>

        <!-- Quote block -->
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:28px;">
          <tr>
            <td style="border-left:2px solid rgba(178,255,26,0.3);padding:4px 0 4px 16px;">
              <p style="margin:0 0 6px;font-size:16px;line-height:1.6;color:#c8d8e4;font-style:italic;font-family:Georgia,'Times New Roman',serif;">
                "The cosmos is within us. We are made of star-stuff.
                We are a way for the universe to know itself."
              </p>
              <p style="margin:0;font-size:11px;font-family:'Courier New',Courier,monospace;color:#4a7018;letter-spacing:.06em;">— Carl Sagan, Cosmos</p>
            </td>
          </tr>
        </table>

        <!-- Intro -->
        <h1 style="margin:0 0 12px;font-size:28px;font-weight:800;color:#f3f2ec;letter-spacing:-.025em;line-height:1.1;">
          Welcome to the mission.
        </h1>
        <p style="margin:0 0 16px;font-size:14.5px;line-height:1.75;color:#7a8a9a;">
          We're building the platform we always wished existed —
          one place where <strong style="color:#c8d8e4;">anyone</strong> can see what's flying above them,
          what's orbiting Earth, what's hurtling through the solar system,
          and what lies in the deep field beyond.
          No paywalls. No subscriptions. The universe, open to all.
        </p>
        <p style="margin:0;font-size:14.5px;line-height:1.75;color:#7a8a9a;">
          You joined early. That means you're part of shaping what this becomes.
          Here's a look at what ObjectTracer can do right now — and what's coming.
        </p>

      </td>
    </tr>

    <!-- ── DIVIDER ── -->
    <tr>
      <td style="padding:0 36px 28px;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td style="height:1px;background:linear-gradient(to right,transparent,#1c2d0e 30%,#1c2d0e 70%,transparent);font-size:0;line-height:0;">&nbsp;</td>
          </tr>
        </table>
      </td>
    </tr>

    <!-- ── SECTION LABEL ── -->
    <tr>
      <td style="padding:0 36px 12px;">
        <p style="margin:0;font-size:9px;font-family:'Courier New',Courier,monospace;letter-spacing:.2em;text-transform:uppercase;color:#3a5218;">What you can explore today</p>
      </td>
    </tr>


    <!-- ════════════════════════════════════
         FEATURE 1 — EARTH VIEW
         ════════════════════════════════════ -->
    <tr>
      <td style="padding:0 36px 32px;">

        <p style="margin:0 0 8px;font-size:9px;font-family:'Courier New',Courier,monospace;letter-spacing:.18em;text-transform:uppercase;color:#4a7018;">01 — EARTH VIEW</p>

        <!-- Image -->
        <img src="https://images.unsplash.com/photo-1614730321146-b6fa6a46bcb4?w=508&h=260&fit=crop&q=85"
             width="508" alt="Earth from space"
             style="display:block;width:100%;height:auto;border-radius:12px;margin-bottom:16px;" />

        <h2 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#f3f2ec;letter-spacing:-.01em;line-height:1.2;">
          Live Flights, ISS &amp; Wind Layer
        </h2>
        <p style="margin:0;font-size:13.5px;line-height:1.75;color:#7a8a9a;">
          Watch over 10,000 commercial flights move across the globe in real time.
          Track the International Space Station as it orbits at 28,000 km/h —
          completing a full lap every 90 minutes.
          Overlay live global wind patterns to see the atmosphere breathe.
          Every data point updates live, second by second.
        </p>

      </td>
    </tr>


    <!-- ════════════════════════════════════
         FEATURE 2 — MOON
         ════════════════════════════════════ -->
    <tr>
      <td style="padding:0 36px 32px;">

        <p style="margin:0 0 8px;font-size:9px;font-family:'Courier New',Courier,monospace;letter-spacing:.18em;text-transform:uppercase;color:#4a7018;">02 — LUNAR SURFACE</p>

        <img src="https://images.unsplash.com/photo-1446941611757-91d2c3bd3d45?w=508&h=260&fit=crop&q=85"
             width="508" alt="Moon surface"
             style="display:block;width:100%;height:auto;border-radius:12px;margin-bottom:16px;" />

        <h2 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#f3f2ec;letter-spacing:-.01em;line-height:1.2;">
          Lunar Explorer
        </h2>
        <p style="margin:0;font-size:13.5px;line-height:1.75;color:#7a8a9a;">
          Navigate the Moon's surface in 3D. Discover every Apollo landing site,
          Chinese Chang'e missions, and future Artemis targets.
          See craters, mare regions, and mission coordinates
          exactly as they appear from orbit.
        </p>

      </td>
    </tr>


    <!-- ════════════════════════════════════
         FEATURE 3 — SOLAR SYSTEM
         ════════════════════════════════════ -->
    <tr>
      <td style="padding:0 36px 32px;">

        <p style="margin:0 0 8px;font-size:9px;font-family:'Courier New',Courier,monospace;letter-spacing:.18em;text-transform:uppercase;color:#4a7018;">03 — SOLAR SYSTEM</p>

        <img src="https://images.unsplash.com/photo-1614732414444-096e5f1122d5?w=508&h=260&fit=crop&q=85"
             width="508" alt="The Sun"
             style="display:block;width:100%;height:auto;border-radius:12px;margin-bottom:16px;" />

        <h2 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#f3f2ec;letter-spacing:-.01em;line-height:1.2;">
          Planets in Motion
        </h2>
        <p style="margin:0;font-size:13.5px;line-height:1.75;color:#7a8a9a;">
          See all eight planets at their real positions right now.
          Explore orbital mechanics, active exploration missions,
          and the near-Earth asteroid belt — all rendered in a live 3D solar system
          built to scale.
        </p>

      </td>
    </tr>


    <!-- ════════════════════════════════════
         FEATURE 4 — DEEP SPACE (BETA)
         ════════════════════════════════════ -->
    <tr>
      <td style="padding:0 36px 32px;">

        <!-- BETA badge row -->
        <table cellpadding="0" cellspacing="0" border="0" style="margin-bottom:8px;">
          <tr>
            <td style="font-size:9px;font-family:'Courier New',Courier,monospace;letter-spacing:.18em;text-transform:uppercase;color:#4a7018;">04 — DEEP SPACE</td>
            <td style="padding-left:10px;">
              <span style="display:inline-block;font-size:8px;font-family:'Courier New',Courier,monospace;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#b2ff1a;background-color:#0d1b0a;border:1px solid #2a4010;border-radius:4px;padding:2px 7px;">BETA</span>
            </td>
          </tr>
        </table>

        <img src="https://images.unsplash.com/photo-1543722530-d2c3201371e7?w=508&h=260&fit=crop&q=85"
             width="508" alt="Deep space galaxies"
             style="display:block;width:100%;height:auto;border-radius:12px;margin-bottom:16px;" />

        <h2 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#f3f2ec;letter-spacing:-.01em;line-height:1.2;">
          Galaxies &amp; Deep Field — Beta
        </h2>
        <p style="margin:0 0 10px;font-size:13.5px;line-height:1.75;color:#7a8a9a;">
          This is where it gets extraordinary.
          We've mapped over 2 million galaxies and quasars from the DESI Legacy Survey
          into a navigable 3D deep-field view.
          You can fly through the observable universe — from the Milky Way's edge
          to objects 13 billion light-years away.
        </p>
        <p style="margin:0;font-size:12px;font-family:'Courier New',Courier,monospace;color:#4a7018;letter-spacing:.04em;">
          Deep Space is in active beta. You're among the first to experience it.
        </p>

      </td>
    </tr>


    <!-- ════════════════════════════════════
         FEATURE 5 — ROCKET LAUNCHES
         ════════════════════════════════════ -->
    <tr>
      <td style="padding:0 36px 32px;">

        <p style="margin:0 0 8px;font-size:9px;font-family:'Courier New',Courier,monospace;letter-spacing:.18em;text-transform:uppercase;color:#4a7018;">05 — ROCKET LAUNCHES</p>

        <img src="https://images.unsplash.com/photo-1541185934-01b600ea069c?w=508&h=260&fit=crop&q=85"
             width="508" alt="Rocket launch"
             style="display:block;width:100%;height:auto;border-radius:12px;margin-bottom:16px;" />

        <h2 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#f3f2ec;letter-spacing:-.01em;line-height:1.2;">
          Every Launch, Live
        </h2>
        <p style="margin:0;font-size:13.5px;line-height:1.75;color:#7a8a9a;">
          Live countdown timers for every scheduled orbital launch worldwide —
          SpaceX, Rocket Lab, ISRO, ESA, and more.
          Watch trajectory data update in real time as the rocket climbs.
          Get notified 30 minutes before liftoff so you never miss a launch.
        </p>

      </td>
    </tr>


    <!-- ════════════════════════════════════
         FEATURE 6 — NEAR-EARTH ASTEROIDS
         ════════════════════════════════════ -->
    <tr>
      <td style="padding:0 36px 32px;">

        <p style="margin:0 0 8px;font-size:9px;font-family:'Courier New',Courier,monospace;letter-spacing:.18em;text-transform:uppercase;color:#4a7018;">06 — NEAR-EARTH OBJECTS</p>

        <img src="https://images.unsplash.com/photo-1419242902214-272b3f66ee7a?w=508&h=260&fit=crop&q=85"
             width="508" alt="Meteor shower"
             style="display:block;width:100%;height:auto;border-radius:12px;margin-bottom:16px;" />

        <h2 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#f3f2ec;letter-spacing:-.01em;line-height:1.2;">
          Asteroids &amp; Close Approaches
        </h2>
        <p style="margin:0;font-size:13.5px;line-height:1.75;color:#7a8a9a;">
          Monitor near-Earth asteroids in the inner solar system,
          visualise their orbital paths, and track confirmed close approaches to Earth.
          Data pulled live from NASA's Center for Near-Earth Object Studies.
        </p>

      </td>
    </tr>


    <!-- ── DIVIDER ── -->
    <tr>
      <td style="padding:0 36px 28px;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td style="height:1px;background:linear-gradient(to right,transparent,#1c2d0e 30%,#1c2d0e 70%,transparent);font-size:0;line-height:0;">&nbsp;</td>
          </tr>
        </table>
      </td>
    </tr>


    <!-- ── COMING NEXT ── -->
    <tr>
      <td style="padding:0 36px 28px;">

        <p style="margin:0 0 16px;font-size:9px;font-family:'Courier New',Courier,monospace;letter-spacing:.2em;text-transform:uppercase;color:#3a5218;">On the roadmap</p>

        <!-- Coming feature row 1 -->
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:8px;">
          <tr>
            <td style="background-color:#0a1118;border:1px solid #141e28;border-radius:10px;padding:14px 18px;">
              <p style="margin:0 0 3px;font-size:11px;font-weight:700;font-family:'Courier New',Courier,monospace;color:#c8d8e4;letter-spacing:.04em;text-transform:uppercase;">Precision Tracking</p>
              <p style="margin:0;font-size:12.5px;line-height:1.6;color:#607080;">Sub-second position updates on any object — earth to deep space.</p>
            </td>
          </tr>
        </table>

        <!-- Coming feature row 2 -->
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:8px;">
          <tr>
            <td style="background-color:#0a1118;border:1px solid #141e28;border-radius:10px;padding:14px 18px;">
              <p style="margin:0 0 3px;font-size:11px;font-weight:700;font-family:'Courier New',Courier,monospace;color:#c8d8e4;letter-spacing:.04em;text-transform:uppercase;">Smart Custom Alerts</p>
              <p style="margin:0;font-size:12.5px;line-height:1.6;color:#607080;">ISS overhead, launches 30 min before, flight landings — you set the rules.</p>
            </td>
          </tr>
        </table>

        <!-- Coming feature row 3 -->
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:0;">
          <tr>
            <td style="background-color:#0a1118;border:1px solid #141e28;border-radius:10px;padding:14px 18px;">
              <p style="margin:0 0 3px;font-size:11px;font-weight:700;font-family:'Courier New',Courier,monospace;color:#c8d8e4;letter-spacing:.04em;text-transform:uppercase;">Flight Replay</p>
              <p style="margin:0;font-size:12.5px;line-height:1.6;color:#607080;">Rewind any flight or launch trajectory, hour by hour, on the live globe.</p>
            </td>
          </tr>
        </table>

      </td>
    </tr>


    <!-- ── CONTRIBUTION BLOCK ── -->
    <tr>
      <td style="padding:0 36px 32px;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td style="background-color:#0d1b0a;border:1px solid #1c2d0e;border-radius:14px;padding:22px 24px;">
              <p style="margin:0 0 8px;font-size:9px;font-family:'Courier New',Courier,monospace;letter-spacing:.18em;text-transform:uppercase;color:#4a7018;">Your ideas shape this</p>
              <p style="margin:0 0 14px;font-size:14px;line-height:1.75;color:#8090a0;">
                We build ObjectTracer in public and we
                <strong style="color:#c8d8e4;">genuinely care about what you think.</strong>
                Got a feature request? Something that confused you? A use case we haven't considered?
                Just reply to this email — every message lands in our inbox and we read every single one.
                This platform is as much yours as it is ours.
              </p>
              <p style="margin:0;font-size:12px;color:#b2ff1a;font-family:'Courier New',Courier,monospace;letter-spacing:.04em;">Reply to this email with your thoughts.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>


    <!-- ── CTA ── -->
    <tr>
      <td align="center" style="padding:0 36px 32px;">
        <a href="https://objecttracer.com"
           style="display:inline-block;background-color:#13200a;border:1px solid #3a600f;border-radius:10px;padding:14px 40px;font-size:12px;font-family:'Courier New',Courier,monospace;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#b2ff1a;text-decoration:none;">
          Open ObjectTracer
        </a>
      </td>
    </tr>


    <!-- ── FOOTER ── -->
    <tr>
      <td style="padding:20px 36px 28px;border-top:1px solid #0f1f08;">
        <p style="margin:0;font-size:11px;line-height:1.8;color:#253540;text-align:center;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
          You received this because you joined the waitlist at objecttracer.com.<br>
          We will only ever send launch announcements and feature drops.<br>
          <a href="https://objecttracer.com" style="color:#2a4030;text-decoration:underline;">Unsubscribe</a>
        </p>
      </td>
    </tr>

  </table>
  <!-- /Card -->

  </td></tr>
</table>

</body>
</html>
`,
	}

	b, _ := json.Marshal(payload)
	req, err := http.NewRequest(http.MethodPost, "https://api.resend.com/emails", bytes.NewReader(b))
	if err != nil {
		log.Printf(`{"level":"error","service":"waitlist","msg":"resend request build failed","error":%q}`, err)
		return
	}
	req.Header.Set("Authorization", "Bearer "+apiKey)
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		log.Printf(`{"level":"error","service":"waitlist","msg":"resend send failed","error":%q}`, err)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		log.Printf(`{"level":"error","service":"waitlist","msg":"resend non-2xx","status":%d}`, resp.StatusCode)
		return
	}

	log.Printf(`{"level":"info","service":"waitlist","msg":"confirmation sent","to":%q}`, to)
}
