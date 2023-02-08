const jsforce = require("jsforce");
const {
  contactsTableFields,
  submissionsTableFields,
  generateSFContactFieldList,
  formatDate
} = require("../utils/fieldConfigs");

// setup for sandbox in both dev and prod for now
// switch to production on launch
let loginUrl =
  process.env.NODE_ENV === "production"
    ? "https://test.salesforce.com"
    : "https://test.salesforce.com";

let conn = new jsforce.Connection({ loginUrl });
const user = process.env.SALESFORCE_USER;
const password = process.env.SALESFORCE_PWD;
const fieldList = generateSFContactFieldList();

/** Fetch one contact from Salesforce by Salesforce Contact ID
 *  @param    {String}   id  	Salesforce Contact ID
 *  @returns  {Object}       	Salesforce Contact object OR error message.
 */
exports.getSFContactById = async (req, res, next) => {
  // console.log(`sf.ctrl.js > getSFContactById`);
  const { id } = req.params;
  const query = `SELECT ${fieldList.join(
    ","
  )}, Id FROM Contact WHERE Id = \'${id}\'`;
  let conn = new jsforce.Connection({ loginUrl });
  try {
    await conn.login(user, password);
  } catch (err) {
    // console.error(`sf.ctrl.js > 36: ${err}`);
    return res.status(500).json({ message: err.message });
  }
  let contact;
  try {
    contact = await conn.query(query);
    return res.status(200).json(contact.records[0]);
  } catch (err) {
    // console.error(`sf.ctrl.js > 44: ${err}`);
    return res.status(500).json({ message: err.message });
  }
};

/** Delete one contact from Salesforce by Salesforce Contact ID
 *  @param    {String}   id   Salesforce Contact ID
 *  @returns  {Object}        Success or error message.
 */
exports.deleteSFContactById = async (req, res, next) => {
  const { id } = req.params;
  let conn = new jsforce.Connection({ loginUrl });
  try {
    await conn.login(user, password);
  } catch (err) {
    // console.error(`sf.ctrl.js > 58: ${err}`);
    return res.status(500).json({ message: err.message });
  }
  try {
    let result = await conn.sobject("Contact").destroy(id);
    return res.status(200).json({ message: "Successfully deleted contact" });
  } catch (err) {
    // console.error(`sf.ctrl.js > 65: ${err}`);
    return res.status(500).json({ message: err.message });
  }
};

exports.createSFContact = async (req, res, next) => {
  // console.log(`sf.ctrl.js > 75: createSFContact`);
  const bodyRaw = { ...req.body };
  const body = {};

  // convert raw body to key/value pairs using SF API field names
  Object.keys(bodyRaw).forEach(key => {
    if (contactsTableFields[key]) {
      const sfFieldName = contactsTableFields[key].SFAPIName;
      body[sfFieldName] = bodyRaw[key];
    }
  });
  delete body["Account.Id"];
  delete body["Account.Agency_Number__c"];
  delete body["Account.WS_Subdivision_from_Agency__c"];
  body.AccountId = bodyRaw.employer_id;

  let conn = new jsforce.Connection({ loginUrl });
  try {
    await conn.login(user, password);
  } catch (err) {
    // console.error(`sf.ctrl.js > 91: ${err}`);
    return res.status(500).json({ message: err.message });
  }

  let contact;
  try {
    contact = await conn.sobject("Contact").create({ ...body });
    if (res.locals.next) {
      // console.log(`sf.ctrl.js > 99: returning next`);
      res.locals.sf_contact_id = contact.Id || contact.id;
      return next();
    }
    // console.log(`sf.ctrl.js > 103: returning to client`);
    return res.status(200).json({ salesforce_id: contact.Id || contact.id });
  } catch (err) {
    // console.error(`sf.ctrl.js > 108: ${err}`);
    return res.status(500).json({ message: err.message });
  }
};

/** Lookup contact in Salesforce by Firstname, Lastname, & Email.
 *  @param    {Object}   body         first_name, last_name, home_email
 *  @returns  {Object}                sf_contact_id if successful, or returns
 *                                    object with error message to client.
 */

exports.lookupSFContactByFLE = async (req, res, next) => {
  // console.log("lookupSFContactByFLE");
  const { first_name, last_name, home_email } = req.body;
  // fuzzy match on first name AND exact match on last name
  // AND exact match on either home OR work email
  // limit one most recently updated record

  if (!first_name || !last_name || !home_email) {
    return res
      .status(500)
      .json({ message: "Please complete all required fields." });
  }

  const query = `SELECT Id, ${fieldList.join(
    ","
  )} FROM Contact WHERE FirstName LIKE \'${first_name}\' AND LastName = \'${last_name}\' AND (Home_Email__c = \'${home_email}\' OR Work_Email__c = \'${home_email}\') ORDER BY LastModifiedDate DESC LIMIT 1`;

  let conn = new jsforce.Connection({ loginUrl });
  try {
    await conn.login(user, password);
  } catch (err) {
    // console.error(`sf.ctrl.js > 138: ${err}`);
    return res.status(500).json({ message: err.message });
  }

  let contact;
  try {
    contact = await conn.query(query);
    if (contact.totalSize === 0 || !contact) {
      // if no contact found, return error message to client
      return res.status(200).json({
        message:
          "Sorry, we could not find a record matching that name and email. Please contact your organizer at 1-844-503-SEIU (7348) for help."
      });
    }
    return res
      .status(200)
      .json({ salesforce_id: contact.records[0].Id || contact.records[0].id });
  } catch (err) {
    // console.error(`sf.ctrl.js > 194: ${err}`);
    return res.status(500).json({ message: err.message });
  }
};

/** Update a contact in Salesforce by Salesforce Contact ID
 *  @param    {String}   id           Salesforce Contact ID
 *  @param    {Object}   body         Raw submission data used to generate
 *                                    updates object, containing
 *                                    key/value pairs of fields to be updated.
 *  @returns  {Object}        Salesforce Contact id OR error message.
 */
exports.updateSFContact = async (req, res, next) => {
  // console.log(`sf.ctrl.js > 284: updateSFContact`);
  const { id } = req.params;
  const updatesRaw = { ...req.body };
  const updates = {};
  // convert updates object to key/value pairs using
  // SF API field names
  Object.keys(updatesRaw).forEach(key => {
    if (contactsTableFields[key]) {
      const sfFieldName = contactsTableFields[key].SFAPIName;
      updates[sfFieldName] = updatesRaw[key];
    }
  });
  delete updates["Account.Id"];
  delete updates["Account.Agency_Number__c"];
  delete updates["Account.WS_Subdivision_from_Agency__c"];
  updates.AccountId = updatesRaw.employer_id;

  let conn = new jsforce.Connection({ loginUrl });
  try {
    await conn.login(user, password);
  } catch (err) {
    // console.error(`sf.ctrl.js > 190: ${err}`);
    return res.status(500).json({ message: err.message });
  }
  let contact;
  try {
    contact = await conn.sobject("Contact").update({
      Id: id,
      ...updates
    });
    if (res.locals.next) {
      // console.log(`sf.ctrl.js > 210: returning next`);
      return next();
    }

    let response = {
      salesforce_id: id
    };
    if (res.locals.submission_id) {
      response.submission_id = res.locals.submission_id;
    }
    // console.log(response);

    // console.log(`sf.ctrl.js > 213: returning to client`);
    return res.status(200).json(response);
  } catch (err) {
    // console.error(`sf.ctrl.js > 210: ${err}`);
    return res.status(500).json({ message: err.message });
  }
};

/** Lookup contact in Salesforce, by id if prefill,
 *  otherwise by Firstname, Lastname, & Email.
 *  If existing contact found, update with submission data, then pass id
 *  to next middleware.
 *  If no match found, create new contact and pass id
 *  to next middleware.
 *  @param    {Object}   body         Raw submission data, containing
 *                                    key/value pairs of fields to match/
 *                                    upsert. Minimum fields required to pass
 *                                    SF validation for lookup and potential
 *                                    new contact creation:
 *                                    first_name, last_name, email, employer_id
 *  @returns  {null||Object}          If successful, returns nothing to client
 *                                    but passes object with contact id to
 *                                    next middleware. If failed, returns
 *                                    object with error message to client.
 */

exports.createOrUpdateSFContact = async (req, res, next) => {
  // console.log(`sf.ctrl.js > 197 > createOrUpdateSFContact`);

  const { salesforce_id } = req.body;

  // if contact id is sent in request body, then this is a prefill
  // skip the lookup function and head straight to updateSFContact
  if (salesforce_id) {
    // save contact_id to res.locals to pass to next middleware
    // (it was in the body already but updateSFContact
    // doesn't know to look for it there)
    res.locals.sf_contact_id = salesforce_id;
    res.locals.next = true;

    // console.log(`sf.ctrljs > 208 > found contact id (salesforce_id)`);
    return exports.updateSFContact(req, res, next);
  }

  // otherwise, proceed with lookup:
  const { first_name, last_name, home_email } = req.body;
  // fuzzy match on first name AND exact match on last name
  // AND exact match on either home OR work email
  // limit one most recently updated record

  const query = `SELECT Id, ${fieldList.join(
    ","
  )} FROM Contact WHERE FirstName LIKE \'${first_name}\' AND LastName = \'${last_name}\' AND (Home_Email__c = \'${home_email}\' OR Work_Email__c = \'${home_email}\') ORDER BY LastModifiedDate DESC LIMIT 1`;

  let conn = new jsforce.Connection({ loginUrl });
  try {
    await conn.login(user, password);
  } catch (err) {
    // console.error(`sf.ctrl.js > 275: ${err}`);
    return res.status(500).json({ message: err.message });
  }

  let contact;
  try {
    contact = await conn.query(query);
    if (contact.totalSize === 0 || !contact) {
      // if no contact found, create new contact, then pass id to
      // next middleware in res.locals
      res.locals.next = true;
      // console.log(`sf.ctrl.js > 286: creating new contact`);
      return exports.createSFContact(req, res, next);
    }
    // if contact found, pass contact id to next middleware, which will
    // update it with the submission data from res.body
    if (contact) {
      // console.log(`sf.ctrl.js > 292: found matching contact`);
      res.locals.sf_contact_id = contact.records[0].Id;
      res.locals.next = true;
      return exports.updateSFContact(req, res, next);
    }
  } catch (err) {
    // console.error(`sf.ctrl.js > 298: ${err}`);
    return res.status(500).json({ message: err.message });
  }
};

/** Get an array of all employers from Salesforce
 *  @param    {none}
 *  @returns  {Array||Object}    Array of SF Account objects OR error message.
 */
exports.getAllEmployers = async (req, res, next) => {
  // console.log("getAllEmployers");
  const query = `SELECT Id, Name, Sub_Division__c, Agency_Number__c FROM Account WHERE Id = '0014N00001iFKWWQA4' OR (RecordTypeId = '01261000000ksTuAAI' and Division__c IN ('Retirees', 'Public', 'Care Provider'))`;
  let conn = new jsforce.Connection({ loginUrl });
  try {
    await conn.login(user, password);
  } catch (err) {
    // console.error(`sf.ctrl.js > 300: ${err}`);
    return res.status(500).json({ message: err.message });
  }
  let accounts = [];
  try {
    accounts = await conn.query(query);
    // console.log(`sf.ctrl.js > 306: returning employers to client`);
    if (!accounts || !accounts.records || !accounts.records.length) {
      return res.status(500).json({ message: "Error while fetching accounts" });
    }
    return res.status(200).json(accounts.records);
  } catch (err) {
    // console.error(`sf.ctrl.js > 312: ${err}`);
    return res.status(500).json({ message: err.message });
  }
};

/** Create an OnlineMemberApps object in Salesforce with submission data
 *  @param    {Object}   body         Submission object
 *  @returns  does not return to client; passes salesforce_id to next function
 */

exports.createSFOnlineMemberApp = async (req, res, next) => {
  let conn = new jsforce.Connection({ loginUrl });
  try {
    await conn.login(user, password);
  } catch (err) {
    // console.error(`sf.ctrl.js > 91: ${err}`);
    return res.status(500).json({ message: err.message });
  }

  let oma;
  try {
    const dataRaw = { ...req.body };
    const data = {};
    // convert data object to key/value pairs using
    // SF API field names
    Object.keys(dataRaw).forEach(key => {
      if (submissionsTableFields[key]) {
        const sfFieldName = submissionsTableFields[key].SFAPIName;
        data[sfFieldName] = dataRaw[key];
      }
    });
    data.Worker__c = res.locals.sf_contact_id;
    data.Birthdate__c = formatDate(dataRaw.birthdate);
    delete data["Account.Id"];
    delete data["Account.Agency_Number__c"];
    delete data["Account.WS_Subdivision_from_Agency__c"];

    OMA = await conn.sobject("OnlineMemberApp__c").create({
      ...data
    });

    return res.status(200).json({
      salesforce_id: res.locals.sf_contact_id,
      submission_id: res.locals.submission_id,
      sf_OMA_id: OMA.id || OMA.Id
    });
  } catch (err) {
    // console.error(`sf.ctrl.js > 360: ${err}`);
    return res.status(500).json({ message: err.message });
  }
};

/** Delete OnlineMemberApp by Id
 *  @param    {String}   Id         OMA Id
 *  @returns  {Object}   Success or error message
 */

exports.deleteSFOnlineMemberApp = async (req, res, next) => {
  let conn = new jsforce.Connection({ loginUrl });
  try {
    await conn.login(user, password);
  } catch (err) {
    // console.error(`sf.ctrl.js > 91: ${err}`);
    return res.status(500).json({ message: err.message });
  }

  try {
    const { id } = req.params;
    await conn.sobject("OnlineMemberApp__c").destroy(id);
    return res
      .status(200)
      .json({ message: "Successfully deleted Online Member App" });
  } catch (err) {
    // console.error(`sf.ctrl.js > 418: ${err}`);
    return res.status(500).json({ message: err.message });
  }
};
