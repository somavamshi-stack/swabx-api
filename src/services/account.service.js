const fs = require("fs");
const path = require("path");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const { Op } = require("sequelize");
const sendEmail = require("../_helpers/send-email");
const Pagination = require("../utils/pagination");
const db = require("../_helpers/db");
const Role = require("../_helpers/role");
const API_URL = process.env.PUBLIC_URL + "/api/v1";
const timeParser = require("parse-duration");
const OTP_EXPIRY_TIME = (process.env.OTP_EXPIRY_TIME && timeParser(process.env.OTP_EXPIRY_TIME)) || timeParser("5m");
const REFRESH_TOKEN_EXPIRY = (process.env.REFRESH_TOKEN_EXPIRY && timeParser(process.env.REFRESH_TOKEN_EXPIRY)) || timeParser("2h");
const TOKEN_EXPIRY = process.env.JWT_TOKEN_EXPIRY || "1h";
const CLIENT_NAME = process.env.CLIENT_NAME || "TracieX";
const PRIV_KEY = fs.readFileSync(path.join(__dirname, "../..", "/keys/id_rsa_priv.pem"), "utf8");

module.exports = {
  authenticate,
  refreshToken,
  revokeToken,
  register,
  verifyEmail,
  forgotPassword,
  validateResetToken,
  changePassword,
  resetPassword,
  getAll,
  getAllByRole,
  getById,
  create,
  update,
  delete: _delete
};

async function authenticate({ email, password, ipAddress, userAgent }) {
  const account = await db.Account.scope("withHash").findOne({
    where: { email }
  });

  if (!account || !account.isVerified || !(await bcrypt.compare(password, account.passwordHash))) {
    let msg = "Email or password is incorrect";
    if (userAgent == "HealthX-Mobile") {
      msg += "\nIn case you do not have Account please Signup";
    }
    throw new Error(msg);
  }

  // authentication successful so generate jwt and refresh tokens
  const jwtToken = generateJwtToken(account);
  const rt = generateRefreshToken(account, ipAddress);

  // save refresh token
  await rt.save();

  // return basic details and tokens
  return {
    ...basicDetails(account),
    jwtToken,
    refreshToken: rt.token
  };
}

async function refreshToken({ token, ipAddress }) {
  const rt = await getRefreshToken(token);
  const account = await rt.getAccount();

  // replace old refresh token with a new one and save
  const newRefreshToken = generateRefreshToken(account, ipAddress);
  rt.revoked = Date.now();
  rt.revokedByIp = ipAddress;
  rt.replacedByToken = newRefreshToken.token;
  await rt.save();
  await newRefreshToken.save();

  // generate new jwt
  const jwtToken = generateJwtToken(account);

  // return basic details and tokens
  return {
    ...basicDetails(account),
    jwtToken,
    refreshToken: newRefreshToken.token
  };
}

async function revokeToken({ token, ipAddress }) {
  const rt = await getRefreshToken(token);

  // revoke token and save
  rt.revoked = Date.now();
  rt.revokedByIp = ipAddress;
  await rt.save();
}

function register(params) {
  return new Promise(async (resolve) => {
    // validate
    let info = await db.Account.findOne({ where: { email: params.email } });
    if (info) {
      // send already registered error in email to prevent account enumeration
      resolve(false);
      return await sendAlreadyRegisteredEmail(info);
    }

    // create account object
    const account = new db.Account(params);

    // first registered account is an admin
    const isFirstAccount = (await db.Account.count()) === 0;
    if (isFirstAccount) {
      account.role = Role.Admin;
      account.verificationToken = randomTokenString();
    } else {
      account.role = Role.Patient;
      account.verificationToken = generateOTP();
    }

    // hash password
    account.passwordHash = await hash(params.password);

    // save account
    await account.save();
    resolve(true);
    // send email
    sendVerificationEmail(account);
  });
}

async function verifyEmail({ token, email }) {
  const account = await db.Account.findOne({
    where: { verificationToken: token, email: email }
  });

  if (!account) throw new Error("Verification failed");

  account.verified = Date.now();
  account.verificationToken = null;
  await account.save();
}

function forgotPassword({ email }) {
  return new Promise(async (resolve, reject) => {
    const account = await db.Account.findOne({ where: { email } });
    // always return ok response to prevent email enumeration
    if (!account) return reject("We're sorry. We weren't able to identify you given the information provided.");

    account.resetToken = generateOTP();
    account.resetTokenExpires = new Date(Date.now() + OTP_EXPIRY_TIME);
    resolve(await account.save());
    await sendPasswordResetOTP(account);
  });
}

async function validateResetToken({ token, email }) {
  const account = await db.Account.findOne({
    where: {
      email: email,
      resetToken: token,
      resetTokenExpires: { [Op.gt]: Date.now() }
    }
  });

  if (!account) throw new Error("Please enter valid token");

  return account;
}

async function changePassword(userID, params) {
  return new Promise(async (resolve, reject) => {
    const account = await db.Account.scope("withHash").findOne({
      where: { id: userID }
    });

    if (!account || !account.isVerified) {
      reject("Account not Found. Please check if you have a verified and active account.");
    } else if (!(await bcrypt.compare(params.oldPassword, account.passwordHash))) {
      reject("Old Password doesn't match");
    }

    // update password
    account.passwordHash = await hash(params.password);
    account.passwordReset = Date.now();
    resolve(await account.save());
    sendPasswordResetEmail(account);
  });
}

async function resetPassword({ email, token, password }) {
  return new Promise(async (resolve, reject) => {
    try {
      const account = await validateResetToken({ email, token });

      // update password and remove reset token
      account.passwordHash = await hash(password);
      account.passwordReset = Date.now();
      account.resetToken = null;
      resolve(await account.save());
      sendPasswordResetEmail(account);
    } catch (error) {
      reject(error);
    }
  });
}

async function getAll(custID = null) {
  let accounts;
  if (custID) {
    accounts = await db.Account.findAll({
      where: { customerId: custID },
      order: [["created", "DESC"]]
    });
  } else {
    accounts = await db.Account.findAll({
      include: db.Location
    });
  }

  return accounts.map((x) => basicDetails(x));
}

async function getAllByRole(req, res) {
  let { page, size, token } = req.query;
  let { role } = req.params;
  if (token == null) token = "";
  let { limit, offset } = Pagination.getPagination(page, size);
  let accounts, data;
  if (["Customer"].includes(role)) {
    data = await db.Account.findAndCountAll({
      where: {
        [Op.or]: [
          {
            name: { [Op.like]: `%${token}%` }
          },
          {
            email: { [Op.like]: `%${token}%` }
          }
        ],
        role
      },
      limit,
      offset
    });
  } else if (role == "all") {
    data = await db.Account.findAndCountAll();
  } else {
    data = {
      count: 0,
      rows: []
    };
  }
  accounts = Pagination.getPagingData(data, page, limit);
  accounts.items = accounts.items.map((x) => basicDetails(x));
  for (let i = 0; i < accounts.items.length; i++) {
    accounts.items[i].locations = await db.Location.findAll({
      attributes: ["id", "location", "created"],
      where: { accountId: accounts.items[i].id },
      order: [["location", "ASC"]]
    });
  }
  return accounts;
}

async function getById(id, custID = null) {
  let account;
  if (custID) {
    account = await getAccount(id, custID);
  } else {
    account = await getAccount(id);
  }

  return basicDetails(account);
}

async function create(params, userID = null) {
  // validate
  if (await db.Account.findOne({ where: { email: params.email } })) {
    throw new Error('Email "' + params.email + '" is already registered');
  }

  if (params.role == "Admin") {
    Object.assign(params, { addedbyId: userID });
  }

  if (params.role == "Staff") {
    Object.assign(params, { customerId: userID });
  }

  const account = new db.Account(params);
  account.verified = Date.now();

  // hash password
  account.passwordHash = await hash(params.password);

  // save account
  await account.save();

  // send email
  sendOnboardEmail(account, params.password);
  return basicDetails(account);
}

async function update(id, params, userID, userRole) {
  let account = await getAccount(id);

  if (userRole === "Customer" && account.customerId !== userID) {
    throw new Error("The staff doesnt belong to your Organization");
  }

  // validate (if email was changed)
  if (params.email && account.email !== params.email && (await db.Account.findOne({ where: { email: params.email } }))) {
    throw new Error('Email "' + params.email + '" is already taken');
  }

  // hash password if it was entered
  if (params.password) {
    params.passwordHash = await hash(params.password);
  }

  // copy params to account and save
  Object.assign(account, params);
  account.updated = Date.now();
  await account.save();

  return basicDetails(account);
}

async function _delete(id, custID = null) {
  let account;
  if (custID) {
    account = await getAccount(id, custID);
  } else {
    account = await getAccount(id);
  }

  await account.destroy();
}

// helper functions

async function getAccount(id, custID = null) {
  let account;
  if (custID) {
    account = await db.Account.findOne({
      where: { id: id, customerId: custID }
    });
  } else {
    account = await db.Account.findByPk(id);
  }

  if (!account) throw new Error("Account not found");
  return account;
}

async function getRefreshToken(token) {
  const rt = await db.RefreshToken.findOne({ where: { token } });
  if (!rt || !rt.isActive) throw new Error("Please enter valid token");
  return rt;
}

async function hash(password) {
  return await bcrypt.hash(password, 10);
}

function generateJwtToken(account) {
  // create a jwt token containing the account id that expires in 15 minutes
  return jwt.sign({ sub: account.id, id: account.id }, PRIV_KEY, {
    expiresIn: TOKEN_EXPIRY,
    algorithm: "RS256"
  });
}

function generateRefreshToken(account, ipAddress) {
  return new db.RefreshToken({
    accountId: account.id,
    token: randomTokenString(),
    expires: new Date(Date.now() + REFRESH_TOKEN_EXPIRY),
    createdByIp: ipAddress
  });
}

function randomTokenString() {
  return crypto.randomBytes(40).toString("hex");
}

const DIGITS = "0123456789";
function generateOTP() {
  // Declare a digits variable
  // which stores all digits
  let OTP = "";
  for (let i = 0; i < 4; i++) {
    OTP += DIGITS[Math.floor(Math.random() * 10)];
  }
  return OTP;
}

function basicDetails(account) {
  const { id, name, email, role, created, updated, isVerified, customerId, locations } = account;

  var newlocations = (locations || []).map(function (loc) {
    const { id, location, accountId } = loc;
    return {
      id,
      location,
      accountId
    };
  });
  return {
    id,
    name,
    email,
    role,
    created,
    updated,
    isVerified,
    customerId,
    locations: newlocations
  };
}

async function sendOnboardEmail(account, password) {
  try {
    return await sendEmail(
      account.email,
      [Role.Patient, Role.Customer, Role.Staff].includes(account.role) ? "welcome-customer.html" : "welcome-admin.html",
      {
        activationLink: API_URL + "/accounts/verify-otp",
        name: account.name,
        loginId: account.email,
        password
      },
      `Welcome to ${CLIENT_NAME}`
    );
  } catch (error) {
    console.error(error);
  }
}

async function sendVerificationEmail(account) {
  try {
    const verifyUrl =
      account.role == Role.Admin ? `${API_URL}/accounts/verify-email?token=${account.verificationToken}` : `${account.verificationToken}`;
    const activationLinkValidity = 3;

    return await sendEmail(
      account.email,
      account.role == Role.Admin ? "welcome.html" : "verification-code.html",
      {
        activationLink: verifyUrl,
        name: account.name,
        loginId: account.email,
        activationLinkValidity: activationLinkValidity
      },
      `Welcome to ${CLIENT_NAME}`
    );
  } catch (error) {
    console.error(error);
  }
}

async function sendAlreadyRegisteredEmail(account) {
  const verifyUrl = `${API_URL}/forgot-password`;

  return await sendEmail(
    account.email,
    "account-already.html",
    { activationLink: verifyUrl, loginId: account.email, name: account.name },
    "Email Already Registered"
  );
}

async function sendPasswordResetEmail(account) {
  try {
    const resetUrl = `${API_URL}/account/reset-password?token=${account.resetToken}`;
    return await sendEmail(
      account.email,
      "password-reset.html",
      { activationLink: resetUrl, loginId: account.email, name: account.name },
      `Revision to Your ${CLIENT_NAME} Account`
    );
  } catch (error) {
    console.error(error);
  }
}

async function sendPasswordResetOTP(account) {
  try {
    return await sendEmail(
      account.email,
      "verification-code.html",
      {
        activationLink: account.resetToken,
        loginId: account.email,
        name: account.name
      },
      `${CLIENT_NAME} password assistance`
    );
  } catch (error) {
    console.error(error);
  }
}
