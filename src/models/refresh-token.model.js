const { DataTypes } = require("sequelize");
const moment = require("moment");

module.exports = model;

function model(sequelize) {
  const attributes = {
    token: { type: DataTypes.STRING },
    expires: { type: DataTypes.DATE },
    created: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    },
    createdByIp: { type: DataTypes.STRING },
    revoked: { type: DataTypes.DATE },
    revokedByIp: { type: DataTypes.STRING },
    replacedByToken: { type: DataTypes.STRING },
    isExpired: {
      type: DataTypes.VIRTUAL,
      get() {
        return this.expires < moment(new Date().getTime()).utc().milliseconds();
      }
    },
    isActive: {
      type: DataTypes.VIRTUAL,
      get() {
        return !this.revoked && !this.isExpired;
      }
    }
  };

  const options = {
    // disable default timestamp fields (createdAt and updatedAt)
    timestamps: false
  };

  return sequelize.define("refreshToken", attributes, options);
}
