package shared

import (
	"net/http"
	"net/url"
	"testing"
)

func makeRequest(params map[string]string) *http.Request {
	u := &url.URL{Path: "/test"}
	q := u.Query()
	for k, v := range params {
		q.Set(k, v)
	}
	u.RawQuery = q.Encode()
	return &http.Request{URL: u}
}

func TestParseOffsetPageRequest_Defaults(t *testing.T) {
	r := makeRequest(nil)
	p := ParseOffsetPageRequest(r)
	if p.Offset != 0 {
		t.Errorf("offset = %d, want 0", p.Offset)
	}
	if p.Limit != 20 {
		t.Errorf("limit = %d, want 20", p.Limit)
	}
}

func TestParseOffsetPageRequest_CustomValues(t *testing.T) {
	r := makeRequest(map[string]string{"offset": "40", "limit": "10"})
	p := ParseOffsetPageRequest(r)
	if p.Offset != 40 {
		t.Errorf("offset = %d, want 40", p.Offset)
	}
	if p.Limit != 10 {
		t.Errorf("limit = %d, want 10", p.Limit)
	}
}

func TestParseOffsetPageRequest_LimitClampMax(t *testing.T) {
	r := makeRequest(map[string]string{"limit": "500"})
	p := ParseOffsetPageRequest(r)
	if p.Limit != 100 {
		t.Errorf("limit = %d, want 100 (clamped)", p.Limit)
	}
}

func TestParseOffsetPageRequest_LimitClampMin(t *testing.T) {
	r := makeRequest(map[string]string{"limit": "0"})
	p := ParseOffsetPageRequest(r)
	if p.Limit != 1 {
		t.Errorf("limit = %d, want 1 (clamped)", p.Limit)
	}
}

func TestParseOffsetPageRequest_NegativeLimit(t *testing.T) {
	r := makeRequest(map[string]string{"limit": "-5"})
	p := ParseOffsetPageRequest(r)
	if p.Limit != 1 {
		t.Errorf("limit = %d, want 1 (clamped)", p.Limit)
	}
}

func TestParseOffsetPageRequest_NegativeOffset(t *testing.T) {
	r := makeRequest(map[string]string{"offset": "-10"})
	p := ParseOffsetPageRequest(r)
	if p.Offset != 0 {
		t.Errorf("offset = %d, want 0 (clamped)", p.Offset)
	}
}

func TestParseOffsetPageRequest_InvalidValues(t *testing.T) {
	r := makeRequest(map[string]string{"offset": "abc", "limit": "xyz"})
	p := ParseOffsetPageRequest(r)
	if p.Offset != 0 {
		t.Errorf("offset = %d, want 0 (default)", p.Offset)
	}
	if p.Limit != 20 {
		t.Errorf("limit = %d, want 20 (default)", p.Limit)
	}
}
