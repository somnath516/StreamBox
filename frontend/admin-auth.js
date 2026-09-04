(function () {
  'use strict';

  const TOKEN_KEY = 'streambox_admin_token';
  const LEGACY_TOKEN_KEY = 'streamboxAdminToken';

  function migrate() {
    const token = localStorage.getItem(TOKEN_KEY) || localStorage.getItem(LEGACY_TOKEN_KEY) || '';
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
      localStorage.removeItem(LEGACY_TOKEN_KEY);
    }
    return token;
  }

  window.StreamBoxAuth = {
    getToken() {
      return migrate();
    },
    headers() {
      const token = migrate();
      return token ? { 'X-Admin-Token': token } : {};
    },
    clear() {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(LEGACY_TOKEN_KEY);
    },
    redirectToLogin() {
      const returnTo = `${window.location.pathname}${window.location.search}`;
      window.location.href = `/login.html?returnTo=${encodeURIComponent(returnTo)}`;
    },
    require() {
      if (!migrate()) {
        this.redirectToLogin();
        return false;
      }
      return true;
    }
  };
})();
