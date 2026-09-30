"""
DEMO DATA generators.

These are a direct Python port of the same deterministic logic already used
by the existing frontend (js/locations.js) so that zone names/stats seeded
here line up with what the app previously fabricated client-side in
localStorage. This is clearly demo data (see config.DATA_MODE) and is meant
to be replaced by real municipal GIS / sensor feeds later.
"""
import math

INDIA_STATES = [
    "Odisha", "Maharashtra", "Delhi", "Karnataka", "Tamil Nadu", "West Bengal",
    "Uttar Pradesh", "Gujarat", "Rajasthan", "Bihar", "Kerala", "Telangana",
    "Madhya Pradesh", "Punjab", "Assam", "Haryana", "Jharkhand", "Chhattisgarh",
    "Uttarakhand", "Himachal Pradesh", "Goa", "Tripura", "Manipur", "Meghalaya",
    "Puducherry",
]

STATE_CITIES = {
    "Odisha": ["Bhubaneswar", "Cuttack"],
    "Maharashtra": ["Mumbai", "Pune", "Nagpur"],
    "Delhi": ["New Delhi"],
    "Karnataka": ["Bengaluru", "Mysuru"],
    "Tamil Nadu": ["Chennai", "Coimbatore"],
    "West Bengal": ["Kolkata", "Siliguri"],
    "Uttar Pradesh": ["Lucknow", "Kanpur", "Varanasi"],
    "Gujarat": ["Ahmedabad", "Surat"],
    "Rajasthan": ["Jaipur", "Jodhpur"],
    "Bihar": ["Patna", "Gaya"],
    "Kerala": ["Kochi", "Thiruvananthapuram"],
    "Telangana": ["Hyderabad", "Warangal"],
    "Madhya Pradesh": ["Bhopal", "Indore"],
    "Punjab": ["Amritsar", "Ludhiana"],
    "Assam": ["Guwahati"],
    "Haryana": ["Gurugram", "Faridabad"],
    "Jharkhand": ["Ranchi"],
    "Chhattisgarh": ["Raipur"],
    "Uttarakhand": ["Dehradun"],
    "Himachal Pradesh": ["Shimla"],
    "Goa": ["Panaji"],
    "Tripura": ["Agartala"],
    "Manipur": ["Imphal"],
    "Meghalaya": ["Shillong"],
    "Puducherry": ["Puducherry"],
}

CURATED_ZONES = {
    "Bhubaneswar": ["Old Town", "Patia", "Chandrasekharpur", "Nayapalli", "Khandagiri"],
    "Mumbai": ["Dadar", "Kurla", "Andheri East", "Sion", "Bandra"],
    "New Delhi": ["Yamuna Bank", "Karol Bagh", "Lajpat Nagar", "Dwarka"],
    "Bengaluru": ["Koramangala", "Bellandur", "Whitefield", "Yelahanka"],
    "Chennai": ["T. Nagar", "Velachery", "Adyar", "Mylapore"],
    "Kolkata": ["Salt Lake", "Behala", "Howrah Bridge Area", "Tollygunge"],
    "Lucknow": ["Gomti Nagar", "Hazratganj", "Aliganj"],
    "Ahmedabad": ["Vastrapur", "Maninagar", "Naranpura"],
    "Jaipur": ["C-Scheme", "Malviya Nagar", "Sanganer"],
    "Patna": ["Kankarbagh", "Boring Road", "Rajendra Nagar"],
    "Kochi": ["Fort Kochi", "Edappally", "Kadavanthra"],
    "Hyderabad": ["Kukatpally", "Begumpet", "Uppal"],
}

# Same lat/lng the frontend already uses for map centering (citizen.js / authority.js)
CITY_COORDS = {
    "Bhubaneswar": (20.2961, 85.8245),
    "Cuttack": (20.4625, 85.8828),
    "Mumbai": (19.0760, 72.8777),
    "Pune": (18.5204, 73.8567),
    "Nagpur": (21.1458, 79.0882),
    "New Delhi": (28.6139, 77.2090),
    "Bengaluru": (12.9716, 77.5946),
    "Mysuru": (12.2958, 76.6394),
    "Chennai": (13.0827, 80.2707),
    "Coimbatore": (11.0168, 76.9558),
    "Kolkata": (22.5726, 88.3639),
    "Siliguri": (26.7271, 88.3953),
    "Lucknow": (26.8467, 80.9462),
    "Kanpur": (26.4499, 80.3319),
    "Varanasi": (25.3176, 82.9739),
    "Ahmedabad": (23.0225, 72.5714),
    "Surat": (21.1702, 72.8311),
    "Jaipur": (26.9124, 75.7873),
    "Jodhpur": (26.2389, 73.0243),
    "Patna": (25.5941, 85.1376),
    "Gaya": (24.7955, 84.9994),
    "Kochi": (9.9312, 76.2673),
    "Thiruvananthapuram": (8.5241, 76.9366),
    "Hyderabad": (17.3850, 78.4867),
    "Warangal": (17.9689, 79.5941),
    "Bhopal": (23.2599, 77.4126),
    "Indore": (22.7196, 75.8577),
    "Amritsar": (31.6340, 74.8723),
    "Ludhiana": (30.9010, 75.8573),
    "Guwahati": (26.1445, 91.7362),
    "Gurugram": (28.4595, 77.0266),
    "Faridabad": (28.4089, 77.3178),
    "Ranchi": (23.3441, 85.3096),
    "Raipur": (21.2514, 81.6296),
    "Dehradun": (30.3165, 78.0322),
    "Shimla": (31.1048, 77.1734),
    "Panaji": (15.4909, 73.8278),
    "Agartala": (23.8315, 91.2868),
    "Imphal": (24.8170, 93.9368),
    "Shillong": (25.5788, 91.8933),
    "Puducherry": (11.9416, 79.8083),
}

DEFAULT_COORDS = (20.2961, 85.8245)  # Bhubaneswar fallback, matches frontend default


def hash_str(s: str) -> int:
    """Mirrors js/locations.js hashStr() exactly (32-bit signed overflow behaviour)."""
    h = 0
    for ch in s:
        h = (h << 5) - h + ord(ch)
        h &= 0xFFFFFFFF
        if h >= 0x80000000:
            h -= 0x100000000
    return abs(h)


def seeded_random(seed: int) -> float:
    """Mirrors js/locations.js seededRandom()."""
    x = math.sin(seed) * 10000
    return x - math.floor(x)


def zones_for_city(city_name: str):
    if city_name in CURATED_ZONES:
        return CURATED_ZONES[city_name]
    base = hash_str(city_name)  # noqa: F841  (kept for parity with the JS source)
    names = ["North Ward", "South Ward", "East Ward", "Central Market", "Riverside Colony"]
    return [f"{n} ({city_name[:3].upper()}{i + 1})" for i, n in enumerate(names)]


def build_zone_record(city_name: str, zone_name: str):
    seed = hash_str(city_name + zone_name)
    return {
        "zone_name": zone_name,
        "elevation": round(2 + seeded_random(seed + 1) * 18, 1),
        "drainage_capacity": round(40 + seeded_random(seed + 2) * 50, 1),
        "drainage_blockage": round(seeded_random(seed + 3) * 60, 1),
        "imperviousness": round(35 + seeded_random(seed + 4) * 50, 1),
        "historical_flood_count": int(seeded_random(seed + 5) * 8),
        "water_level": round(seeded_random(seed + 6) * 1.5, 2),
        "rainfall": round(seeded_random(seed + 7) * 20, 1),
    }


def city_coords(city_name: str):
    return CITY_COORDS.get(city_name, DEFAULT_COORDS)


def zone_latlng(city_name: str, zone_index: int):
    """Mirrors the small deterministic offset used by citizen.js/authority.js
    to scatter zone markers around the city center."""
    lat, lng = city_coords(city_name)
    return (
        lat + math.sin(zone_index * 1.7) * 0.03,
        lng + math.cos(zone_index * 1.7) * 0.03,
    )
