const mariadb = require('mariadb');
const pool = mariadb.createPool({host: 'jbchcw.com', port: 3307, user: 'changwon', password: 'Changwon0691!', database: 'jbchcwDB'});
pool.query("SELECT DEL_YN, POSITION FROM CWTB_USER WHERE REPLACE(REPLACE(PHONE, '-', ''), ' ', '') = '01040837041' AND YEAR='2026'").then(r => console.log(r)).catch(e => console.error(e)).finally(() => process.exit());
