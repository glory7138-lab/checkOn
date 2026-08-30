const mariadb = require('mariadb');
const pool = mariadb.createPool({host: 'jbchcw.com', port: 3307, user: 'changwon', password: 'Changwon0691!', database: 'mysql'});
pool.query("SELECT User, Host FROM user WHERE User='changwon'").then(r => console.log(r)).catch(e => console.error(e)).finally(() => process.exit());
