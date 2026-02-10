export function isAuthenticated() {
  // replace later with real auth (JWT, cookies, etc.)
  return Boolean(localStorage.getItem("token"));
}
