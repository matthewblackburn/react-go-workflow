import SuperTokens from 'supertokens-web-js';
import EmailPassword from 'supertokens-web-js/recipe/emailpassword';
import Session from 'supertokens-web-js/recipe/session';

export function initSuperTokens() {
  SuperTokens.init({
    appInfo: {
      appName: 'Workflow Builder',
      apiDomain: window.location.origin.includes('localhost:3000')
        ? 'http://localhost:8080'
        : window.location.origin,
      apiBasePath: '/auth',
    },
    recipeList: [EmailPassword.init(), Session.init()],
  });
}
