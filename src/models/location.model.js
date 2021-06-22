const { DataTypes } = require("sequelize");

module.exports = model;

function model(sequelize) {
  const attributes = {
    id: {
      type: DataTypes.UUID,
      allowNull: false,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4
    },
    location: { type: DataTypes.STRING, allowNull: false },
    created: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    },
    updated: { type: DataTypes.DATE }
  };

  const options = {
    // disable default timestamp fields (createdAt and updatedAt)
    timestamps: false
  };

  return sequelize.define("location", attributes, options);
}
