/* ============ PAN-INDIA STATE -> CITY -> MICRO-ZONE DATA ============ */

const INDIA_STATES = [
  "Odisha","Maharashtra","Delhi","Karnataka","Tamil Nadu","West Bengal","Uttar Pradesh",
  "Gujarat","Rajasthan","Bihar","Kerala","Telangana","Madhya Pradesh","Punjab","Assam",
  "Haryana","Jharkhand","Chhattisgarh","Uttarakhand","Himachal Pradesh","Goa","Tripura",
  "Manipur","Meghalaya","Puducherry"
];

const STATE_CITIES = {
  "Odisha":["Bhubaneswar","Cuttack"],
  "Maharashtra":["Mumbai","Pune","Nagpur"],
  "Delhi":["New Delhi"],
  "Karnataka":["Bengaluru","Mysuru"],
  "Tamil Nadu":["Chennai","Coimbatore"],
  "West Bengal":["Kolkata","Siliguri"],
  "Uttar Pradesh":["Lucknow","Kanpur","Varanasi"],
  "Gujarat":["Ahmedabad","Surat"],
  "Rajasthan":["Jaipur","Jodhpur"],
  "Bihar":["Patna","Gaya"],
  "Kerala":["Kochi","Thiruvananthapuram"],
  "Telangana":["Hyderabad","Warangal"],
  "Madhya Pradesh":["Bhopal","Indore"],
  "Punjab":["Amritsar","Ludhiana"],
  "Assam":["Guwahati"],
  "Haryana":["Gurugram","Faridabad"],
  "Jharkhand":["Ranchi"],
  "Chhattisgarh":["Raipur"],
  "Uttarakhand":["Dehradun"],
  "Himachal Pradesh":["Shimla"],
  "Goa":["Panaji"],
  "Tripura":["Agartala"],
  "Manipur":["Imphal"],
  "Meghalaya":["Shillong"],
  "Puducherry":["Puducherry"]
};

/* Hand-curated micro-zones for major metros */
const CURATED_ZONES = {
  "Bhubaneswar": ["Old Town","Patia","Chandrasekharpur","Nayapalli","Khandagiri"],
  "Mumbai": ["Dadar","Kurla","Andheri East","Sion","Bandra"],
  "New Delhi": ["Yamuna Bank","Karol Bagh","Lajpat Nagar","Dwarka"],
  "Bengaluru": ["Koramangala","Bellandur","Whitefield","Yelahanka"],
  "Chennai": ["T. Nagar","Velachery","Adyar","Mylapore"],
  "Kolkata": ["Salt Lake","Behala","Howrah Bridge Area","Tollygunge"],
  "Lucknow": ["Gomti Nagar","Hazratganj","Aliganj"],
  "Ahmedabad": ["Vastrapur","Maninagar","Naranpura"],
  "Jaipur": ["C-Scheme","Malviya Nagar","Sanganer"],
  "Patna": ["Kankarbagh","Boring Road","Rajendra Nagar"],
  "Kochi": ["Fort Kochi","Edappally","Kadavanthra"],
  "Hyderabad": ["Kukatpally","Begumpet","Uppal"]
};

function seededRandom(seed){
  let x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}
function hashStr(str){
  let h = 0;
  for(let i=0;i<str.length;i++){ h = (h<<5) - h + str.charCodeAt(i); h |= 0; }
  return Math.abs(h);
}

function getZonesForCity(cityName){
  if(CURATED_ZONES[cityName]) return CURATED_ZONES[cityName];
  // deterministic seeded generation for any other city
  const base = hashStr(cityName);
  const names = ["North Ward","South Ward","East Ward","Central Market","Riverside Colony"];
  return names.map((n,i)=> n + " (" + cityName.slice(0,3).toUpperCase() + (i+1) + ")");
}

function buildZoneRecord(cityName, zoneName, idx){
  const seed = hashStr(cityName + zoneName);
  return {
    id: 'z' + hashStr(cityName+zoneName),
    name: zoneName,
    elevation: Math.round(2 + seededRandom(seed+1)*18),
    drainageCapacity: Math.round(40 + seededRandom(seed+2)*50),
    drainageBlockage: Math.round(seededRandom(seed+3)*60),
    imperviousArea: Math.round(35 + seededRandom(seed+4)*50),
    historicalIncidents: Math.round(seededRandom(seed+5)*8),
    waterLevel: +(seededRandom(seed+6)*1.5).toFixed(2)
  };
}

function getAllZoneRecords(cityName){
  return getZonesForCity(cityName).map((z,i)=>buildZoneRecord(cityName,z,i));
}
