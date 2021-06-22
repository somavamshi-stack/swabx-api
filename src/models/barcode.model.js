const { DataTypes } = require("sequelize");

module.exports = model;

function model(sequelize) {
  const attributes = {
    code: { type: DataTypes.UUID, allowNull: false, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    batchId: { type: DataTypes.UUID, allowNull: false, defaultValue: DataTypes.UUIDV4 },
    status: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    accountId: { type: DataTypes.UUID, allowNull: false },
    staffId: { type: DataTypes.UUID },
    patientId: { type: DataTypes.STRING(300), allowNull: false },
    locationId: { type: DataTypes.UUID, allowNull: false },
    diagnosis: { type: DataTypes.STRING, allowNull: false, defaultValue: "Pending" },
    reportTime: { type: DataTypes.DATE },
    checkoutTime: { type: DataTypes.DATE },
    isCheckout: {
      type: DataTypes.VIRTUAL,
      get() {
        return !!this.checkoutTime;
      }
    }
  };

  return sequelize.define("barcode", attributes);
}
