package controllers

import (
	"encoding/json"
	"net/http"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
	"github.com/skydot/backend/src/middlewares"
	"github.com/skydot/backend/src/models"
	"github.com/skydot/backend/src/utils"
)

// UserController handles preferences and watchlist endpoints.
type UserController struct {
	pool *pgxpool.Pool
	rdb  *redis.Client
}

// NewUserController creates a UserController.
func NewUserController(pool *pgxpool.Pool, rdb *redis.Client) *UserController {
	return &UserController{pool: pool, rdb: rdb}
}

// GetPreferences handles GET /api/v1/user/preferences.
func (uc *UserController) GetPreferences(w http.ResponseWriter, r *http.Request) {
	session := middlewares.GetSession(r)
	if session == nil || session.UserID == nil {
		utils.Error(w, http.StatusUnauthorized, "authentication required")
		return
	}

	ctx := r.Context()
	var prefs json.RawMessage
	err := uc.pool.QueryRow(ctx, `SELECT preferences FROM users WHERE id=$1`, *session.UserID).Scan(&prefs)
	if err != nil {
		utils.Error(w, http.StatusInternalServerError, "failed to fetch preferences")
		return
	}

	utils.JSON(w, http.StatusOK, prefs)
}

// UpdatePreferences handles PUT /api/v1/user/preferences.
func (uc *UserController) UpdatePreferences(w http.ResponseWriter, r *http.Request) {
	session := middlewares.GetSession(r)
	if session == nil || session.UserID == nil {
		utils.Error(w, http.StatusUnauthorized, "authentication required")
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, 8192)
	var prefs models.UserPreferences
	if err := json.NewDecoder(r.Body).Decode(&prefs); err != nil {
		utils.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	prefsJSON, err := json.Marshal(prefs)
	if err != nil {
		utils.Error(w, http.StatusInternalServerError, "failed to marshal preferences")
		return
	}

	ctx := r.Context()
	_, err = uc.pool.Exec(ctx, `UPDATE users SET preferences=$1 WHERE id=$2`, prefsJSON, *session.UserID)
	if err != nil {
		utils.Error(w, http.StatusInternalServerError, "failed to update preferences")
		return
	}

	utils.JSON(w, http.StatusOK, prefs)
}

// GetWatchlist handles GET /api/v1/user/watchlist.
func (uc *UserController) GetWatchlist(w http.ResponseWriter, r *http.Request) {
	session := middlewares.GetSession(r)
	if session == nil || session.UserID == nil {
		utils.Error(w, http.StatusUnauthorized, "authentication required")
		return
	}

	ctx := r.Context()
	rows, err := uc.pool.Query(ctx,
		`SELECT id, user_id, callsign, icao24, label, created_at FROM watchlists WHERE user_id=$1 ORDER BY created_at DESC`,
		*session.UserID,
	)
	if err != nil {
		utils.Error(w, http.StatusInternalServerError, "failed to fetch watchlist")
		return
	}
	defer rows.Close()

	items := []models.Watchlist{}
	for rows.Next() {
		var w models.Watchlist
		if err := rows.Scan(&w.ID, &w.UserID, &w.Callsign, &w.ICAO24, &w.Label, &w.CreatedAt); err == nil {
			items = append(items, w)
		}
	}

	utils.JSON(w, http.StatusOK, map[string]interface{}{"items": items, "count": len(items)})
}

// AddWatchlist handles POST /api/v1/user/watchlist.
func (uc *UserController) AddWatchlist(w http.ResponseWriter, r *http.Request) {
	session := middlewares.GetSession(r)
	if session == nil || session.UserID == nil {
		utils.Error(w, http.StatusUnauthorized, "authentication required")
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, 4096)
	var req models.WatchlistAddRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		utils.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Callsign == nil && req.ICAO24 == nil {
		utils.Error(w, http.StatusBadRequest, "callsign or icao24 required")
		return
	}
	// Input length validation — prevent oversized payloads stored in DB
	if req.Callsign != nil && len(*req.Callsign) > 20 {
		utils.Error(w, http.StatusBadRequest, "callsign too long (max 20)")
		return
	}
	if req.ICAO24 != nil && len(*req.ICAO24) > 10 {
		utils.Error(w, http.StatusBadRequest, "icao24 too long (max 10)")
		return
	}
	if req.Label != nil && len(*req.Label) > 100 {
		utils.Error(w, http.StatusBadRequest, "label too long (max 100)")
		return
	}

	ctx := r.Context()
	id := uuid.New().String()
	var item models.Watchlist
	err := uc.pool.QueryRow(ctx,
		`INSERT INTO watchlists (id, user_id, callsign, icao24, label)
		 VALUES ($1, $2, $3, $4, $5)
		 RETURNING id, user_id, callsign, icao24, label, created_at`,
		id, *session.UserID, req.Callsign, req.ICAO24, req.Label,
	).Scan(&item.ID, &item.UserID, &item.Callsign, &item.ICAO24, &item.Label, &item.CreatedAt)
	if err != nil {
		utils.Error(w, http.StatusInternalServerError, "failed to add watchlist item")
		return
	}

	utils.JSON(w, http.StatusCreated, item)
}

// GetPinnedLaunches handles GET /api/v1/user/pinned-launches.
func (uc *UserController) GetPinnedLaunches(w http.ResponseWriter, r *http.Request) {
	session := middlewares.GetSession(r)
	if session == nil || session.UserID == nil {
		utils.Error(w, http.StatusUnauthorized, "authentication required")
		return
	}

	ctx := r.Context()
	rows, err := uc.pool.Query(ctx,
		`SELECT id, user_id, launch_id, name, net_time, created_at
		   FROM pinned_launches
		  WHERE user_id=$1
		  ORDER BY net_time NULLS LAST, created_at DESC`,
		*session.UserID,
	)
	if err != nil {
		utils.Error(w, http.StatusInternalServerError, "failed to fetch pinned launches")
		return
	}
	defer rows.Close()

	items := []models.PinnedLaunch{}
	for rows.Next() {
		var p models.PinnedLaunch
		if err := rows.Scan(&p.ID, &p.UserID, &p.LaunchID, &p.Name, &p.NetTime, &p.CreatedAt); err == nil {
			items = append(items, p)
		}
	}

	utils.JSON(w, http.StatusOK, map[string]interface{}{"items": items, "count": len(items)})
}

// AddPinnedLaunch handles POST /api/v1/user/pinned-launches.
// Idempotent — pinning the same launch twice returns the existing row.
func (uc *UserController) AddPinnedLaunch(w http.ResponseWriter, r *http.Request) {
	session := middlewares.GetSession(r)
	if session == nil || session.UserID == nil {
		utils.Error(w, http.StatusUnauthorized, "authentication required")
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, 4096)
	var req models.PinnedLaunchAddRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		utils.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.LaunchID == "" {
		utils.Error(w, http.StatusBadRequest, "launch_id required")
		return
	}
	if len(req.LaunchID) > 64 {
		utils.Error(w, http.StatusBadRequest, "launch_id too long")
		return
	}
	if req.Name != nil && len(*req.Name) > 200 {
		utils.Error(w, http.StatusBadRequest, "launch name too long (max 200)")
		return
	}

	ctx := r.Context()
	id := uuid.New().String()
	var item models.PinnedLaunch
	err := uc.pool.QueryRow(ctx,
		`INSERT INTO pinned_launches (id, user_id, launch_id, name, net_time)
		 VALUES ($1, $2, $3, $4, $5)
		 ON CONFLICT (user_id, launch_id) DO UPDATE
		   SET name = EXCLUDED.name, net_time = EXCLUDED.net_time
		 RETURNING id, user_id, launch_id, name, net_time, created_at`,
		id, *session.UserID, req.LaunchID, req.Name, req.NetTime,
	).Scan(&item.ID, &item.UserID, &item.LaunchID, &item.Name, &item.NetTime, &item.CreatedAt)
	if err != nil {
		utils.Error(w, http.StatusInternalServerError, "failed to pin launch")
		return
	}

	utils.JSON(w, http.StatusCreated, item)
}

// DeletePinnedLaunch handles DELETE /api/v1/user/pinned-launches/{id}.
func (uc *UserController) DeletePinnedLaunch(w http.ResponseWriter, r *http.Request) {
	session := middlewares.GetSession(r)
	if session == nil || session.UserID == nil {
		utils.Error(w, http.StatusUnauthorized, "authentication required")
		return
	}

	itemID := r.PathValue("id")
	if itemID == "" {
		utils.Error(w, http.StatusBadRequest, "missing pinned launch id")
		return
	}
	if len(itemID) > 64 {
		utils.Error(w, http.StatusBadRequest, "invalid id format")
		return
	}

	ctx := r.Context()
	result, err := uc.pool.Exec(ctx,
		`DELETE FROM pinned_launches WHERE id=$1 AND user_id=$2`,
		itemID, *session.UserID,
	)
	if err != nil {
		utils.Error(w, http.StatusInternalServerError, "failed to unpin launch")
		return
	}
	if result.RowsAffected() == 0 {
		utils.Error(w, http.StatusNotFound, "pinned launch not found")
		return
	}

	utils.JSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

// DeleteWatchlist handles DELETE /api/v1/user/watchlist/{id}.
func (uc *UserController) DeleteWatchlist(w http.ResponseWriter, r *http.Request) {
	session := middlewares.GetSession(r)
	if session == nil || session.UserID == nil {
		utils.Error(w, http.StatusUnauthorized, "authentication required")
		return
	}

	itemID := r.PathValue("id")
	if itemID == "" {
		utils.Error(w, http.StatusBadRequest, "missing watchlist item id")
		return
	}
	if len(itemID) > 64 {
		utils.Error(w, http.StatusBadRequest, "invalid id format")
		return
	}

	ctx := r.Context()
	result, err := uc.pool.Exec(ctx,
		`DELETE FROM watchlists WHERE id=$1 AND user_id=$2`,
		itemID, *session.UserID,
	)
	if err != nil {
		utils.Error(w, http.StatusInternalServerError, "failed to delete watchlist item")
		return
	}
	if result.RowsAffected() == 0 {
		utils.Error(w, http.StatusNotFound, "watchlist item not found")
		return
	}

	utils.JSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}
