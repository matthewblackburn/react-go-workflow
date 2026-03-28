package auth

import (
	"github.com/supertokens/supertokens-golang/recipe/emailpassword"
	"github.com/supertokens/supertokens-golang/recipe/session"
	"github.com/supertokens/supertokens-golang/supertokens"
)

// Init initializes the Supertokens SDK with EmailPassword + Session recipes.
//
//	Go API ──► Supertokens Core (HTTP) ──► Auth DB (Postgres)
//	  │            port 3567                  users, sessions
//	  │
//	  └── session.VerifySession() verifies access tokens locally (no network call)
func Init(supertokensURL, apiDomain, websiteDomain string) error {
	return supertokens.Init(supertokens.TypeInput{
		Supertokens: &supertokens.ConnectionInfo{
			ConnectionURI: supertokensURL,
		},
		AppInfo: supertokens.AppInfo{
			AppName:       "Workflow Builder",
			APIDomain:     apiDomain,
			WebsiteDomain: websiteDomain,
			APIBasePath:   strPtr("/auth"),
		},
		RecipeList: []supertokens.Recipe{
			emailpassword.Init(nil),
			session.Init(nil),
		},
	})
}

func strPtr(s string) *string {
	return &s
}
