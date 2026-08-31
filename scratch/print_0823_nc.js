const fs = require('fs');

const data = JSON.parse(fs.readFileSync('scratch_parsed_0823.json', 'utf8'));
const newcomers = data.filter(x => x.type === 'newcomer');

console.log(`Total newcomers: ${newcomers.length}`);
newcomers.forEach((nc, idx) => {
    console.log(`${idx+1}. Row ${nc.row}: [${nc.area_code}구역] ${nc.name} (인도: ${nc.guide_name}) -> 출석 ${nc.attended_dates.length}회 (${nc.attended_dates.join(', ')})`);
});
