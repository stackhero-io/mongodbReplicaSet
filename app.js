require('dotenv').config()
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const MongoClient = require('mongodb').MongoClient;

// This script will show your replica set health and will try to insert and read datas in it, every second.
// To stop it, hit CTRL + C.
// Note: when your replica set has to elect a new primary node, it will refuse new connections for some seconds.
// You'll get more informations in Stackhero's documentation on https://www.stackhero.io

(async () => {
  if (!process.env.MONGODB_NODES) {
    throw Error('You should first fill the .env-example file and the rename it to .env');
  }

  const configuration = {
    nodes: process.env.MONGODB_NODES.split(','),
    username: 'admin',
    password: process.env.MONGODB_PASSWORD,
    replicaSetName: process.env.MONGODB_REPLICA_NAME,
    db: 'stackhero-tests', // You can let this defaut value
    sslValidate: true // just for debug, should always be set to true
  };

  while (true) {
    console.log('\033c');

    const { username, password, nodes, replicaSetName, sslValidate } = configuration;
    const url = `mongodb://` +
      `${encodeURIComponent(username)}:${encodeURIComponent(password)}` +
      `@` +
      `${nodes.join(':27017,')}:27017` +
      `/?` +
        `ssl=true&sslValidate=${sslValidate}&replicaSet=${encodeURIComponent(replicaSetName)}`;

    let client;
    while (true) {
      console.log('Note: this script is running every second to check your replica set status');
      console.log(`Connecting to MongoDB nodes...`);
      try {
        client = await MongoClient.connect(url, { useNewUrlParser: true, useUnifiedTopology: true });
        break;
      }
      catch (err) {
        console.warn('The connection to MongoDB has failed. Maybe it is because an election is going.');
        console.warn(err.toString());
        console.log('');
        await delay(1000);
      }
    }
    console.log('');

    // Get replica set status
    // See https://docs.mongodb.com/manual/reference/command/replSetGetStatus/
    console.log('Getting replica set status...');
    const replicaStatus = await client.db('admin').admin().replSetGetStatus();
    console.log('');

    console.log(`Replica set name: ${replicaStatus.set}`);
    console.log('');

    // Get primary startOptimeDate
    const primaryMember = replicaStatus.members.find(({ stateStr }) => stateStr === 'PRIMARY');
    const primaryOptimeDate = primaryMember ? primaryMember.optimeDate : null;

    console.log('Replica set members:');
    console.log(replicaStatus.members
        .map(({ name, stateStr, optimeDate }) => {
          if (primaryOptimeDate && stateStr === 'SECONDARY' && primaryOptimeDate - optimeDate >= 0) {
            return ` - ${name}, state is ${stateStr}, ${(primaryOptimeDate - optimeDate) / 1000} second(s) behind the primary`;
          }
          else {
            return ` - ${name}, state is ${stateStr}`
          }
        })
        .join('\n')
    );
    console.log('');


    // Select the database
    console.log(`Selecting database ${configuration.db}...`);
    const db = client.db(configuration.db);
    console.log(' ✅ Select OK');
    console.log('');

    // Remove entries from collection
    console.log('Removing entries from collection stackhero-test');
    await db.collection('stackhero-test').deleteMany({});
    console.log(' ✅ Delete OK');
    console.log('');

    // Insert a test document
    console.log('Inserting test datas');
    const dateOrg = new Date();
    await db.collection('stackhero-test').insertOne({ date: dateOrg });
    console.log(' ✅ Insert OK');
    console.log('');

    // Get back the inserted document
    console.log('Checking inserted datas');
    const { date } = await db.collection('stackhero-test').findOne({});
    if (date.toString() === dateOrg.toString()) {
      console.log(' ✅ Test datas are OK');
    }
    else {
      throw Error(` ❌ Test datas aren't identical! ${date.toString()} !== ${dateOrg.toString()}`);
    }
    console.log('');

    client.close();

    await delay(1000);
  }
})().catch(error => {
  console.error('');
  console.error('🐞 An error occurred!');
  console.error(error);
  process.exit(1);
});