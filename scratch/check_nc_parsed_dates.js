const fs = require('fs');
const data = JSON.parse(fs.readFileSync('scratch_parsed_0823_corrected.json', 'utf8'));

const ncItems = data.filter(x => x.type === 'newcomer');
console.log('--- Newcomer Rows in scratch_parsed_0823_corrected.json ---');
ncItems.forEach(nc => {
    console.log(`Row ${nc.row} [${nc.area_code}구역] name=${nc.name}, guide=${nc.guide_name}, dates=`, nc.attended_dates);
});
