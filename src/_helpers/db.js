const mysql = require("mysql2/promise");
const { Sequelize } = require("sequelize");

module.exports = db = { Sequelize };

initialize();

async function initialize() {
  const host = process.env.MYSQL_HOST || "localhost";
  const port = process.env.MYSQL_PORT || 3306;
  const user = process.env.MYSQL_USER || "app";
  const password = process.env.MYSQL_PASSWORD || "app@123";
  const database = process.env.MYSQL_DATABASE || "breathalyzer";
  const dialect = process.env.MYSQL_DIALECT || "mysql";

  // connect to db
  const sequelize = new Sequelize(database, user, password, {
    logging: false,
    host: host,
    port: port,
    dialect: dialect,
    pool: {
      max: 40,
      min: 0,
      acquire: 30000,
      idle: 10000
    }
  });

  // init models and add them to the exported db object
  db.Account = require("../models/account.model")(sequelize);
  db.RefreshToken = require("../models/refresh-token.model")(sequelize);
  db.Location = require("../models/location.model")(sequelize);
  db.Barcode = require("../models/barcode.model")(sequelize);

  // define relationships
  db.Account.hasMany(db.RefreshToken, { onDelete: "CASCADE" });
  db.RefreshToken.belongsTo(db.Account);

  db.Account.hasMany(db.Location, {
    foreignKey: "accountId",
    sourceKey: "id",
    onDelete: "CASCADE"
  });
  db.Location.belongsTo(db.Account);

  db.Barcode.belongsTo(db.Account);
  db.Account.hasMany(db.Barcode, {
    foreignKey: "staffId",
    sourceKey: "id"
  });

  db.sequelize = sequelize;
  // sync all models with database
  await sequelize.sync();
}
