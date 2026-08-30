const mariadb = require('mariadb');
const pool = mariadb.createPool({host: 'jbchcw.com', port: 3307, user: 'changwon', password: 'Changwon0691!', database: 'jbchcwDB'});
pool.query("SELECT CODE_NO, NAME, PHONE, YEAR FROM CWTB_USER WHERE REPLACE(REPLACE(PHONE, '-', ''), ' ', '') = '01040837041'").then(r => console.log(r)).catch(e => console.error(e)).finally(() => process.exit());
