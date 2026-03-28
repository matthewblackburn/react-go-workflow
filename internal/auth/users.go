package auth

import (
	"encoding/json"
	"fmt"
	"net/http"

	"react-go-workflow/internal/shared"

	"github.com/go-chi/chi/v5"
	"github.com/supertokens/supertokens-golang/recipe/emailpassword"
	"github.com/supertokens/supertokens-golang/supertokens"
)

type UserHandler struct{}

func NewUserHandler() *UserHandler {
	return &UserHandler{}
}

type userResponse struct {
	ID         string `json:"id"`
	Email      string `json:"email"`
	TimeJoined int64  `json:"time_joined"`
}

// List returns paginated users.
func (h *UserHandler) List(w http.ResponseWriter, r *http.Request) {
	limit := shared.QueryInt(r, "limit", 20)
	paginationToken := shared.QueryString(r, "cursor")

	result, err := supertokens.GetUsersNewestFirst("public", paginationToken, &limit, nil, nil)
	if err != nil {
		shared.WriteError(w, shared.ErrInternal)
		return
	}

	users := make([]userResponse, 0, len(result.Users))
	for _, u := range result.Users {
		userMap := u.User
		id, _ := userMap["id"].(string)
		email, _ := userMap["email"].(string)
		timeJoined, _ := userMap["timeJoined"].(float64)
		users = append(users, userResponse{
			ID:         id,
			Email:      email,
			TimeJoined: int64(timeJoined),
		})
	}

	resp := map[string]any{
		"data": users,
	}
	if result.NextPaginationToken != nil {
		resp["next_cursor"] = *result.NextPaginationToken
	}

	shared.WriteJSON(w, http.StatusOK, resp)
}

// Count returns the total number of users.
func (h *UserHandler) Count(w http.ResponseWriter, r *http.Request) {
	count, err := supertokens.GetUserCount(nil, nil)
	if err != nil {
		shared.WriteError(w, shared.ErrInternal)
		return
	}
	shared.WriteJSON(w, http.StatusOK, map[string]any{"count": int(count)})
}

// Delete removes a user by ID.
func (h *UserHandler) Delete(w http.ResponseWriter, r *http.Request) {
	userID := chi.URLParam(r, "id")
	if userID == "" {
		shared.WriteError(w, shared.ErrInvalidID)
		return
	}

	err := supertokens.DeleteUser(userID)
	if err != nil {
		shared.WriteError(w, shared.ErrInternal)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// UpdatePassword updates a user's password (admin action).
func (h *UserHandler) UpdatePassword(w http.ResponseWriter, r *http.Request) {
	userID := chi.URLParam(r, "id")
	if userID == "" {
		shared.WriteError(w, shared.ErrInvalidID)
		return
	}

	var req struct {
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Password == "" {
		shared.WriteValidationError(w, fmt.Errorf("password is required"))
		return
	}

	resp, err := emailpassword.UpdateEmailOrPassword(userID, nil, &req.Password, nil, nil)
	if err != nil {
		shared.WriteError(w, shared.ErrInternal)
		return
	}

	if resp.UnknownUserIdError != nil {
		shared.WriteError(w, shared.ErrNotFound)
		return
	}

	shared.WriteJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}
