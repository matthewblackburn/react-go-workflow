package shared

import (
	"encoding/base64"
	"encoding/json"
	"net/http"
	"time"
)

// PageRequest holds pagination parameters from the client.
type PageRequest struct {
	Cursor string
	Limit  int
}

// PageResponse holds pagination metadata for the response.
type PageResponse struct {
	NextCursor string `json:"next_cursor,omitempty"`
	HasMore    bool   `json:"has_more"`
	Limit      int    `json:"limit"`
}

// CursorPayload is the decoded cursor content.
type CursorPayload struct {
	ID        string    `json:"id"`
	SortValue time.Time `json:"sv"`
}

// ParsePageRequest extracts pagination params from the request.
func ParsePageRequest(r *http.Request) PageRequest {
	limit := QueryInt(r, "limit", 50)
	if limit > 100 {
		limit = 100
	}
	if limit < 1 {
		limit = 1
	}

	cursor := ""
	if c := r.URL.Query().Get("cursor"); c != "" {
		cursor = c
	}

	return PageRequest{
		Cursor: cursor,
		Limit:  limit,
	}
}

// EncodeCursor encodes a cursor payload to a base64 string.
func EncodeCursor(id string, sortValue time.Time) string {
	payload := CursorPayload{ID: id, SortValue: sortValue}
	data, _ := json.Marshal(payload)
	return base64.StdEncoding.EncodeToString(data)
}

// DecodeCursor decodes a base64 cursor string.
func DecodeCursor(cursor string) (*CursorPayload, error) {
	data, err := base64.StdEncoding.DecodeString(cursor)
	if err != nil {
		return nil, ErrInvalidCursor
	}
	var payload CursorPayload
	if err := json.Unmarshal(data, &payload); err != nil {
		return nil, ErrInvalidCursor
	}
	return &payload, nil
}

// OffsetPageRequest holds offset/limit pagination parameters.
type OffsetPageRequest struct {
	Offset int
	Limit  int
}

// OffsetPageResponse holds offset/limit pagination metadata for the response.
type OffsetPageResponse struct {
	Total  int `json:"total"`
	Limit  int `json:"limit"`
	Offset int `json:"offset"`
}

// ParseOffsetPageRequest extracts offset/limit pagination params from the request.
func ParseOffsetPageRequest(r *http.Request) OffsetPageRequest {
	limit := QueryInt(r, "limit", 20)
	if limit > 100 {
		limit = 100
	}
	if limit < 1 {
		limit = 1
	}

	offset := QueryInt(r, "offset", 0)
	if offset < 0 {
		offset = 0
	}

	return OffsetPageRequest{
		Offset: offset,
		Limit:  limit,
	}
}
