const jwt = require("express-jwt");
const db = require("../_helpers/db");
const fs = require("fs");
const path = require("path");

const PUB_KEY = fs.readFileSync(path.join(__dirname, "../..", "/keys/id_rsa_pub.pem"), "utf8");

module.exports = authorize;

function authorize(roles = []) {
  // roles param can be a single role string (e.g. Role.User or 'User')
  // or an array of roles (e.g. [Role.Admin, Role.User] or ['Admin', 'User'])
  if (typeof roles === "string") {
    roles = [roles];
  }

  return [
    // authenticate JWT token and attach user to request object (req.user)
    jwt({ secret: PUB_KEY, algorithms: ["RS256"] }),

    // authorize based on user role
    async (req, res, next) => {
      const account = await db.Account.findByPk(req.user.id);

      if (!account || (roles.length && !roles.includes(account.role))) {
        // account no longer exists or role not authorized
        return res.status(401).json({ message: "Unauthorized Access" });
      }

      // authentication and authorization successful
      req.user.role = account.role;
      req.user.customerId = account.customerId;
      const refreshTokens = await account.getRefreshTokens();
      req.user.ownsToken = (token) => !!refreshTokens.find((x) => x.token === token);
      next();
    }
  ];
}
