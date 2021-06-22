const db = require("../_helpers/db");
const sendRequest = require("./appointment.request");

module.exports = {
  getAll,
  getById,
  create,
  update,
  delete: _delete
};

async function getAll(userID) {
  let whereClause = {
    order: [["created", "DESC"]]
  };
  if (userID) {
    whereClause.where = { accountId: userID };
  } else {
    whereClause.attributes = ["id", "location"];
  }

  const locations = await db.Location.findAll(whereClause);
  return locations.map((x) => basicDetails(x));
}

async function getById(id, userID) {
  const location = getLocation(id, userID);
  return basicDetails(location);
}

async function create(params, userID) {
  // validate
  if (
    await db.Location.findOne({
      where: { location: params.location, accountId: userID }
    })
  ) {
    throw 'Location "' + params.location + '" already exist';
  }
  //
  // this should be customer id taken from params.
  const location = new db.Location({ accountId: userID, location: params.location });
  // save location
  await location.save();
  let slot = {
    ...params,
    customerid: userID,
    locationid: location.id
  };

  const response = await sendRequest("/scheduleconfig", "POST", null, slot);
  location.slot_config = response.body;

  return basicDetails(location);
}

async function update(id, params, userID) {
  const location = getLocation(id, userID);

  // validate (if location was changed)
  if (
    params.location &&
    (await db.Location.findOne({
      where: { location: params.location, accountId: userID }
    }))
  ) {
    throw new Error('Location "' + params.location + '" already exist');
  }

  // copy params to location and save
  Object.assign(location, params);
  location.updated = Date.now();
  await location.save();

  return basicDetails(location);
}

async function _delete(id, userID) {
  try {
    const location = await getLocation(id, userID);
    await location.destroy();
  } catch (error) {
    throw new Error("Location does not exists");
  }
}

// helper functions

async function getLocation(id, userID) {
  const location = await db.Location.findOne({
    where: { id: id, accountId: userID }
  });
  if (!location) throw new Error("Location not found");
  return location;
}

function basicDetails(loc) {
  const { id, location, created, slot_config } = loc;
  return {
    id,
    location,
    created,
    slot_config
  };
}
