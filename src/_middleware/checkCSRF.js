module.exports = function (req, res, next) {
  const csrfToken = req.get("X-CSRF-Token");
  if (!csrfToken) return res.status(401).json({ error: "CSRF token missing. Please refresh the page." });
  if (!req.session.csrfToken) {
    return res.status(401).json({ error: "No CSRF token recorded in your session. Please refresh the page." });
  }
  if (req.session.csrfToken !== csrfToken) return res.status(401).json({ error: "Invalid CSRF token. Please refresh the page." });
  next();
};
