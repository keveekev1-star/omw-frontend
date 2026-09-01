import { useState, useEffect, useRef, useCallback } from "react";

// ─── BACKEND API CLIENT ───────────────────────────────────────────────────────
// Privacy: GPS coordinates are NEVER sent to the server.
// Only distance_miles and general region travel over the network.
const API_BASE = process.env.REACT_APP_API_URL || "http://localhost:4000";

async function apiCall(path, options = {}) {
  const token = window.__omw_token;
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(err.error || `API error ${res.status}`);
  }
  return res.json();
}

// Save profile to backend after signup
async function saveProfileToBackend(accountType, travelerTier) {
  try {
    await apiCall("/api/users/me/profile", {
      method: "PUT",
      body: JSON.stringify({ account_type: accountType, traveler_tier: travelerTier }),
    });
  } catch (e) {
    console.warn("Profile save to backend failed:", e.message);
  }
}

// Record completed trip (distance + region only — no GPS)
async function recordTrip(distanceMiles, region, contribution, peakRate) {
  try {
    await apiCall("/api/trips", {
      method: "POST",
      body: JSON.stringify({
        distance_miles: distanceMiles,
        region: region || "Local",
        contribution,
        peak_rate: peakRate,
      }),
    });
  } catch (e) {
    console.warn("Trip record failed:", e.message);
  }
}
// ─────────────────────────────────────────────────────────────────────────────



// ─── RESPONSIVE HOOK ──────────────────────────────────────────────────────────
function useBreakpoint() {
  const [w, setW] = useState(typeof window !== "undefined" ? window.innerWidth : 1024);
  useEffect(() => {
    const h = () => setW(window.innerWidth);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);
  return { isMobile: w < 768, isTablet: w >= 768 && w < 1200, isDesktop: w >= 1200, w };
}

// ─── RATES ───────────────────────────────────────────────────────────────────
const RATE_STD  = 1.64;
const RATE_PEAK = 2.50;
const DEFAULT_PEAK = [
  { label:"Morning Rush", days:[1,2,3,4,5], startH:7,  startM:0, endH:9,  endM:0 },
  { label:"Evening Rush", days:[1,2,3,4,5], startH:16, startM:0, endH:19, endM:0 },
];
const inPeak = (wins, d=new Date()) => {
  const day=d.getDay(), m=d.getHours()*60+d.getMinutes();
  return wins.some(w=>w.days.includes(day)&&m>=w.startH*60+w.startM&&m<w.endH*60+w.endM);
};
const calcFare = (mi,pk) => parseFloat((mi*(pk?RATE_PEAK:RATE_STD)).toFixed(2));
const haversine = (a,b,c,d) => {
  const R=3958.8,dL=(c-a)*Math.PI/180,dO=(d-b)*Math.PI/180;
  const x=Math.sin(dL/2)**2+Math.cos(a*Math.PI/180)*Math.cos(c*Math.PI/180)*Math.sin(dO/2)**2;
  return parseFloat((R*2*Math.atan2(Math.sqrt(x),Math.sqrt(1-x))).toFixed(2));
};
const geocode = async q => {
  try {
    const r=await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1`,
      {headers:{"Accept-Language":"en","User-Agent":"OnMyWayApp/1.0"}});
    const d=await r.json();
    if(d.length) return {lat:+d[0].lat,lon:+d[0].lon,display:d[0].display_name.split(",").slice(0,3).join(", ")};
  } catch {}
  return null;
};
const reverseGeocode = async (lat,lon) => {
  try {
    const r=await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`,
      {headers:{"Accept-Language":"en","User-Agent":"OnMyWayApp/1.0"}});
    const d=await r.json(), a=d.address||{};
    return [a.city||a.town||a.village||a.municipality||a.county||"",a.country||""].filter(Boolean).join(", ")||"Your Location";
  } catch {} return "Your Location";
};
const fmt12=(h,m)=>{const ap=h>=12?"pm":"am",h12=h%12||12;return `${h12}:${String(m).padStart(2,"0")}${ap}`;};

// ─── TRAVELER TIERS ($50/$100/$200) ──────────────────────────────────────────
const TRAVELER_TIERS = {
  starter: {
    id:"starter", label:"Starter", icon:"🚗", color:"#FF6B35",
    gradient:"linear-gradient(135deg,#2D0F00,#9A3412)",
    subPrice:50, subPeriod:"/mo",
    tripLimit:50, unlimited:false,
    badge:"Traveler", visibility:"Standard",
    perks:[
      "50 trips per month included",
      "List your route on the app",
      "Live GPS broadcast to passengers",
      "In-app messaging & contribution negotiation",
      "Community news & weather access",
      "Basic traveler profile",
    ],
    restrictions:["Route shown after higher tiers in search","Max 2 open routes at a time"],
  },
  pro: {
    id:"pro", label:"Pro", icon:"🔑", color:"#F7C948",
    gradient:"linear-gradient(135deg,#2D1F00,#92400E)",
    subPrice:100, subPeriod:"/mo",
    tripLimit:100, unlimited:false,
    badge:"Pro Traveler", visibility:"Boosted",
    perks:[
      "100 trips per month included",
      "Boosted placement in passenger search",
      "Pro verified badge — higher trust",
      "Passenger rating filter unlocked",
      "Advanced route scheduling",
      "Weekly trip summary & earnings report",
      "Priority in-app support",
    ],
    restrictions:[],
  },
  elite: {
    id:"elite", label:"Elite", icon:"👑", color:"#A78BFA",
    gradient:"linear-gradient(135deg,#160428,#5B21B6)",
    subPrice:200, subPeriod:"/mo",
    tripLimit:Infinity, unlimited:true,
    badge:"Elite Traveler", visibility:"First Preferred",
    perks:[
      "Unlimited trips — no monthly cap",
      "⭐ First Preferred status — always shown first",
      "Shown #1 to ALL passengers",
      "Elite crown badge — highest trust signal",
      "Instant ride request notifications",
      "Dedicated personal account manager",
      "All passenger tiers visible at a glance",
      "Early access to every new feature",
    ],
    restrictions:[],
  },
};

// ─── PASSENGER TIERS ($8/mo flat) ────────────────────────────────────────────
const PASSENGER_TIERS = {
  rider: {
    id:"rider", label:"Rider", icon:"passenger", color:"#4CAF82",
    gradient:"linear-gradient(135deg,#0A2016,#14532D)",
    subPrice:8, subPeriod:"/mo",
    badge:"Verified Rider",
    perks:[
      "Browse all available routes",
      "Request rides from any traveler",
      "In-app messaging to negotiate contribution directly",
      "Live GPS tracking of your ride",
      "Counter-offer contribution system",
      "Ride history & digital receipts",
      "Community news & local weather",
      "Grocery pickup & food delivery access",
    ],
    restrictions:[],
  },
};

// ─── SPECIAL RATES ────────────────────────────────────────────────────────────
const SPECIAL_RATES = [
  { id:"senior", icon:"senior", label:"Senior (65+)", discount:"50% off", color:"#60A5FA", desc:"Verified seniors receive 50% off the $8/mo passenger subscription.", badge:"Senior Rate" },
  { id:"vet",    icon:"vet",    label:"Disabled Veteran", discount:"100% free", color:"#A78BFA", desc:"Disabled veterans ride free — full passenger platform access at no cost.", badge:"Vet Rate" },
];

// ─── MOCK TRAVELER ROUTES ─────────────────────────────────────────────────────
const TRAVELER_TEMPLATES = [
  {id:"t1",name:"Alex M.",  rating:4.9,trips:312,tier:"elite",  from:"North District",to:"City Centre",seats:2,miles:14.2},
  {id:"t2",name:"Priya S.", rating:5.0,trips:87, tier:"pro",    from:"Riverside Area", to:"East Market", seats:1,miles:8.6},
  {id:"t3",name:"Jordan L.",rating:4.8,trips:156,tier:"elite",  from:"West End",       to:"University",  seats:3,miles:19.1},
  {id:"t4",name:"Mei W.",   rating:4.6,trips:41, tier:"starter",from:"South Station",  to:"Midtown",     seats:2,miles:6.3},
];
const makeTravelers = (lat,lon) => TRAVELER_TEMPLATES.map((t,i)=>{
  const off=[[0.008,-0.005],[-0.004,0.009],[0.012,0.003],[-0.009,-0.007]];
  return {...t, lat:lat+off[i][0], lon:lon+off[i][1]};
});

// ─── MOCK GROCERY COURIERS ────────────────────────────────────────────────────
const GROCERY_TEMPLATES = [
  {id:"g1",name:"Sam K.",   rating:4.9,deliveries:208,tier:"elite",  store:"FreshMart",    radius:"5 mi",  eta:"20–30 min"},
  {id:"g2",name:"Diana R.", rating:5.0,deliveries:94, tier:"pro",    store:"Whole Foods",  radius:"3 mi",  eta:"25–35 min"},
  {id:"g3",name:"Tyler M.", rating:4.7,deliveries:61, tier:"starter",store:"Costco",       radius:"8 mi",  eta:"30–45 min"},
  {id:"g4",name:"Aria N.",  rating:4.8,deliveries:137,tier:"pro",    store:"Farmer Direct",radius:"4 mi",  eta:"15–25 min"},
];
const makeGroceryCouriers = (lat,lon) => GROCERY_TEMPLATES.map((t,i)=>{
  const off=[[0.006,-0.007],[-0.003,0.011],[0.009,0.002],[-0.011,-0.004]];
  return {...t, lat:lat+off[i][0], lon:lon+off[i][1], miles:parseFloat((3+i*2.2).toFixed(1))};
});

// ─── DEFAULT NEWS ─────────────────────────────────────────────────────────────
const DEFAULT_NEWS=[
  {id:1,category:"Traffic",    categoryColor:"#FF6B35",icon:"🚧",title:"Road closure on main arterial extended",  body:"Eastbound lane closed for emergency repairs. Use parallel roads as alternate routes.",          author:"Local Alert",  time:"12 min ago",likes:42, comments:8, verified:true},
  {id:2,category:"Community",  categoryColor:"#4CAF82",icon:"🌳",title:"New community garden opens this weekend", body:"Over 30 raised beds available. Sign-ups Saturday 9am at the park entrance.",                    author:"Marcus T.",   time:"1 hr ago",  likes:118,comments:23,verified:false},
  {id:3,category:"Safety",     categoryColor:"#F7C948",icon:"⚠️",title:"Ice warning near transit station",        body:"Crews treating walkways — caution near bus stops and subway entrances this morning.",           author:"City Alert",  time:"2 hrs ago", likes:201,comments:14,verified:true},
  {id:4,category:"Events",     categoryColor:"#C084FC",icon:"🎉",title:"Farmers market returns this weekend",     body:"40+ local vendors Sat & Sun 8am–2pm. Free parking at the community lot.",                      author:"Local Events",time:"3 hrs ago", likes:87, comments:31,verified:true},
  {id:5,category:"Lost & Found",categoryColor:"#60A5FA",icon:"🐾",title:"Lost golden retriever near the park",   body:"'Biscuit' last seen wearing a red collar. Contact jamie@example.com.",                          author:"Jamie R.",    time:"4 hrs ago", likes:56, comments:19,verified:false},
];

const C={bg:"#080810",surface:"rgba(255,255,255,0.05)",border:"rgba(255,255,255,0.09)",text:"#F0EDE8",muted:"rgba(240,237,232,0.45)",accent:"#FF6B35"};
const WX={
  clear: {label:"Clear & Sunny",icon:"☀️",grad:"linear-gradient(135deg,#FF8C42,#FF6B35,#E84545)"},
  cloudy:{label:"Partly Cloudy",icon:"⛅",grad:"linear-gradient(135deg,#6B7B8D,#4A5568)"},
  rain:  {label:"Rainy",        icon:"🌧️",grad:"linear-gradient(135deg,#4C6EF5,#2C3E8C)"},
  snow:  {label:"Snowy",        icon:"❄️",grad:"linear-gradient(135deg,#90CDF4,#4299E1)"},
  storm: {label:"Stormy",       icon:"⛈️",grad:"linear-gradient(135deg,#2D3748,#1A202C)"},
};

// ─── REALISTIC SVG AVATARS ───────────────────────────────────────────────────
// Passenger — young woman hailing a ride
function AvatarPassenger({ size = 48, color = "#4CAF82" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* body */}
      <ellipse cx="32" cy="52" rx="16" ry="10" fill={`${color}22`}/>
      <path d="M20 62 Q20 46 32 44 Q44 46 44 62Z" fill={color} opacity="0.7"/>
      {/* jacket lapels */}
      <path d="M26 44 L32 50 L38 44" stroke={color} strokeWidth="1.5" fill="none" opacity="0.5"/>
      {/* neck */}
      <rect x="29" y="35" width="6" height="9" rx="3" fill="#C8956C"/>
      {/* head */}
      <ellipse cx="32" cy="28" rx="10" ry="11" fill="#C8956C"/>
      {/* hair */}
      <path d="M22 26 Q22 14 32 14 Q42 14 42 26 Q40 18 32 17 Q24 18 22 26Z" fill="#3D2B1F"/>
      <path d="M22 26 Q20 30 22 34" stroke="#3D2B1F" strokeWidth="3" fill="none"/>
      {/* eyes */}
      <ellipse cx="27.5" cy="28" rx="2" ry="2.2" fill="#2C1810"/>
      <ellipse cx="36.5" cy="28" rx="2" ry="2.2" fill="#2C1810"/>
      <ellipse cx="28" cy="27.2" rx="0.7" ry="0.7" fill="white"/>
      <ellipse cx="37" cy="27.2" rx="0.7" ry="0.7" fill="white"/>
      {/* eyebrows */}
      <path d="M25 25.2 Q27.5 24 30 25.2" stroke="#2C1810" strokeWidth="1.2" fill="none" strokeLinecap="round"/>
      <path d="M34 25.2 Q36.5 24 39 25.2" stroke="#2C1810" strokeWidth="1.2" fill="none" strokeLinecap="round"/>
      {/* nose */}
      <path d="M31 30 Q32 32 33 30" stroke="#A0725A" strokeWidth="1" fill="none"/>
      {/* smile */}
      <path d="M28.5 33.5 Q32 36 35.5 33.5" stroke="#8B4513" strokeWidth="1.2" fill="none" strokeLinecap="round"/>
      {/* raised arm */}
      <path d="M44 44 Q52 38 50 32 Q49 28 46 30" stroke={color} strokeWidth="3.5" fill="none" strokeLinecap="round"/>
      <ellipse cx="46.5" cy="30.5" rx="3.5" ry="3.5" fill="#C8956C"/>
      {/* other arm */}
      <path d="M20 46 Q14 44 13 38" stroke={color} strokeWidth="3" fill="none" strokeLinecap="round" opacity="0.6"/>
    </svg>
  );
}

// Traveler — male driver, confident pose
function AvatarTraveler({ size = 48, color = "#FF6B35" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* body */}
      <path d="M18 62 Q18 46 32 44 Q46 46 46 62Z" fill={color} opacity="0.75"/>
      {/* collar */}
      <path d="M27 44 L32 49 L37 44" stroke="white" strokeWidth="1.5" fill="none" opacity="0.6"/>
      {/* neck */}
      <rect x="29" y="35" width="6" height="9" rx="3" fill="#B07850"/>
      {/* head */}
      <ellipse cx="32" cy="27" rx="10.5" ry="11.5" fill="#B07850"/>
      {/* short hair */}
      <path d="M21.5 22 Q22 13 32 13 Q42 13 42.5 22 Q41 15 32 15 Q23 15 21.5 22Z" fill="#1A0F0A"/>
      <path d="M21.5 22 Q21 18 22 16" stroke="#1A0F0A" strokeWidth="2.5" fill="none"/>
      <path d="M42.5 22 Q43 18 42 16" stroke="#1A0F0A" strokeWidth="2.5" fill="none"/>
      {/* ears */}
      <ellipse cx="21.5" cy="28" rx="2.2" ry="3" fill="#9E6B45"/>
      <ellipse cx="42.5" cy="28" rx="2.2" ry="3" fill="#9E6B45"/>
      {/* eyes */}
      <ellipse cx="27.5" cy="27" rx="2.2" ry="2.4" fill="#1A0A05"/>
      <ellipse cx="36.5" cy="27" rx="2.2" ry="2.4" fill="#1A0A05"/>
      <ellipse cx="28.1" cy="26.2" rx="0.7" ry="0.7" fill="white"/>
      <ellipse cx="37.1" cy="26.2" rx="0.7" ry="0.7" fill="white"/>
      {/* brows — strong */}
      <path d="M25 24 Q27.5 22.5 30 24" stroke="#1A0A05" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
      <path d="M34 24 Q36.5 22.5 39 24" stroke="#1A0A05" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
      {/* nose */}
      <path d="M30.5 30 Q32 33 33.5 30" stroke="#8A5C35" strokeWidth="1.2" fill="none"/>
      {/* slight grin */}
      <path d="M28 34 Q32 37.5 36 34" stroke="#6B3A1F" strokeWidth="1.3" fill="none" strokeLinecap="round"/>
      {/* stubble hint */}
      <ellipse cx="32" cy="35.5" rx="5" ry="2" fill="#8A5C35" opacity="0.18"/>
      {/* arms */}
      <path d="M20 46 Q12 44 11 36" stroke={color} strokeWidth="3.5" fill="none" strokeLinecap="round"/>
      <path d="M44 46 Q52 44 53 36" stroke={color} strokeWidth="3.5" fill="none" strokeLinecap="round"/>
      <ellipse cx="11.5" cy="35" rx="3.5" ry="3.5" fill="#B07850"/>
      <ellipse cx="52.5" cy="35" rx="3.5" ry="3.5" fill="#B07850"/>
    </svg>
  );
}

// Senior passenger — older woman, warm tone
function AvatarSenior({ size = 48, color = "#60A5FA" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* body */}
      <path d="M19 62 Q19 47 32 45 Q45 47 45 62Z" fill={color} opacity="0.65"/>
      {/* blouse detail */}
      <path d="M27 45 L32 50 L37 45" stroke="white" strokeWidth="1.2" fill="none" opacity="0.5"/>
      <circle cx="32" cy="47" r="1.2" fill="white" opacity="0.4"/>
      <circle cx="32" cy="51" r="1.2" fill="white" opacity="0.4"/>
      {/* neck */}
      <rect x="29.5" y="36" width="5" height="9" rx="2.5" fill="#C4906A"/>
      {/* head — slightly fuller */}
      <ellipse cx="32" cy="28" rx="10" ry="11" fill="#C4906A"/>
      {/* white/grey wavy hair */}
      <path d="M22 24 Q22 13 32 13 Q42 13 42 24 Q40 15 32 15.5 Q24 15 22 24Z" fill="#D8D0C8"/>
      <path d="M22 24 Q19 28 20 34" stroke="#D8D0C8" strokeWidth="3.5" fill="none" strokeLinecap="round"/>
      <path d="M42 24 Q45 28 44 34" stroke="#D8D0C8" strokeWidth="3.5" fill="none" strokeLinecap="round"/>
      {/* soft wave details */}
      <path d="M22 22 Q25 20 28 22 Q31 20 34 22 Q37 20 40 22" stroke="#C8C0B5" strokeWidth="1" fill="none"/>
      {/* ears */}
      <ellipse cx="22" cy="29" rx="2" ry="2.5" fill="#B07D58"/>
      <ellipse cx="42" cy="29" rx="2" ry="2.5" fill="#B07D58"/>
      {/* warm eyes — softer, slightly crinkled */}
      <ellipse cx="27.5" cy="28.5" rx="2" ry="1.9" fill="#3D2010"/>
      <ellipse cx="36.5" cy="28.5" rx="2" ry="1.9" fill="#3D2010"/>
      <ellipse cx="28" cy="27.8" rx="0.6" ry="0.6" fill="white"/>
      <ellipse cx="37" cy="27.8" rx="0.6" ry="0.6" fill="white"/>
      {/* crow's feet hint */}
      <path d="M23 27 Q22 28 23 29" stroke="#A07050" strokeWidth="0.8" fill="none"/>
      <path d="M41 27 Q42 28 41 29" stroke="#A07050" strokeWidth="0.8" fill="none"/>
      {/* gentle brows */}
      <path d="M25.5 25.8 Q27.5 24.5 29.5 25.8" stroke="#9A7060" strokeWidth="1.1" fill="none" strokeLinecap="round"/>
      <path d="M34.5 25.8 Q36.5 24.5 38.5 25.8" stroke="#9A7060" strokeWidth="1.1" fill="none" strokeLinecap="round"/>
      {/* nose */}
      <path d="M31 31 Q32 33 33 31" stroke="#A07050" strokeWidth="1" fill="none"/>
      {/* warm smile — deeper lines */}
      <path d="M28 34 Q32 37 36 34" stroke="#7A4020" strokeWidth="1.3" fill="none" strokeLinecap="round"/>
      <path d="M27.5 34 Q27 35.5 28.5 35.5" stroke="#A06040" strokeWidth="0.7" fill="none"/>
      <path d="M36.5 34 Q37 35.5 35.5 35.5" stroke="#A06040" strokeWidth="0.7" fill="none"/>
      {/* arms */}
      <path d="M20 47 Q14 44 14 37" stroke={color} strokeWidth="3" fill="none" strokeLinecap="round"/>
      <ellipse cx="14" cy="36.5" rx="3" ry="3" fill="#C4906A"/>
      {/* cane */}
      <path d="M44 48 Q48 46 50 38 Q51 32 48 30" stroke="#8B7355" strokeWidth="2" fill="none" strokeLinecap="round"/>
      <path d="M46 30 Q48 29 50 30" stroke="#8B7355" strokeWidth="2" fill="none" strokeLinecap="round"/>
    </svg>
  );
}

// Veteran — male, decorated uniform suggestion
function AvatarVet({ size = 48, color = "#A78BFA" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* uniform body — olive/navy */}
      <path d="M18 62 Q18 46 32 44 Q46 46 46 62Z" fill="#2D4A3E" opacity="0.9"/>
      {/* shoulder rank patches */}
      <rect x="18" y="46" width="6" height="3" rx="1" fill={color} opacity="0.8"/>
      <rect x="40" y="46" width="6" height="3" rx="1" fill={color} opacity="0.8"/>
      {/* medals ribbon bar */}
      <rect x="26" y="49" width="4" height="2.5" rx="0.5" fill="#FFD700"/>
      <rect x="31" y="49" width="4" height="2.5" rx="0.5" fill="#C0392B"/>
      {/* collar */}
      <path d="M27 44 L32 48 L37 44" stroke="#3A6B55" strokeWidth="1.5" fill="none"/>
      {/* neck */}
      <rect x="29" y="35" width="6" height="9" rx="3" fill="#9E7350"/>
      {/* head */}
      <ellipse cx="32" cy="27" rx="10.5" ry="11" fill="#9E7350"/>
      {/* short military cut */}
      <path d="M21.5 22 Q22 13 32 13 Q42 13 42.5 22 Q40 15 32 15 Q24 15 21.5 22Z" fill="#1C1008"/>
      <path d="M21.5 24 Q21 20 21.5 17" stroke="#1C1008" strokeWidth="3" fill="none"/>
      <path d="M42.5 24 Q43 20 42.5 17" stroke="#1C1008" strokeWidth="3" fill="none"/>
      {/* ears */}
      <ellipse cx="21.5" cy="27.5" rx="2.2" ry="3" fill="#8A6340"/>
      <ellipse cx="42.5" cy="27.5" rx="2.2" ry="3" fill="#8A6340"/>
      {/* determined eyes */}
      <ellipse cx="27.5" cy="27" rx="2.3" ry="2.3" fill="#1A0A05"/>
      <ellipse cx="36.5" cy="27" rx="2.3" ry="2.3" fill="#1A0A05"/>
      <ellipse cx="28.2" cy="26.3" rx="0.7" ry="0.7" fill="white"/>
      <ellipse cx="37.2" cy="26.3" rx="0.7" ry="0.7" fill="white"/>
      {/* strong brows */}
      <path d="M25 24 L30 23" stroke="#1C1008" strokeWidth="1.6" fill="none" strokeLinecap="round"/>
      <path d="M34 23 L39 24" stroke="#1C1008" strokeWidth="1.6" fill="none" strokeLinecap="round"/>
      {/* nose bridge — straight */}
      <line x1="32" y1="28" x2="32" y2="32" stroke="#7A5030" strokeWidth="1" opacity="0.5"/>
      <path d="M30 32 Q32 34 34 32" stroke="#7A5030" strokeWidth="1.2" fill="none"/>
      {/* composed expression */}
      <path d="M28.5 35 Q32 37.5 35.5 35" stroke="#5A3015" strokeWidth="1.3" fill="none" strokeLinecap="round"/>
      {/* jaw scar hint — subtle */}
      <path d="M38 33 Q39.5 34.5 38.5 36" stroke="#7A5030" strokeWidth="0.8" fill="none" opacity="0.4"/>
      {/* strong arms at sides */}
      <path d="M20 47 Q12 45 11 37" stroke="#2D4A3E" strokeWidth="4" fill="none" strokeLinecap="round"/>
      <path d="M44 47 Q52 45 53 37" stroke="#2D4A3E" strokeWidth="4" fill="none" strokeLinecap="round"/>
      <ellipse cx="11.5" cy="36" rx="3.5" ry="3.5" fill="#9E7350"/>
      <ellipse cx="52.5" cy="36" rx="3.5" ry="3.5" fill="#9E7350"/>
      {/* medal star */}
      <polygon points="32,7 33.2,10.5 37,10.5 34,12.5 35.2,16 32,14 28.8,16 30,12.5 27,10.5 30.8,10.5" fill={color} opacity="0.85"/>
    </svg>
  );
}

// Render the right avatar from an icon marker string
function RateIcon({ icon, size = 40, color }) {
  if (icon === "senior") return <AvatarSenior size={size} color={color || "#60A5FA"}/>;
  if (icon === "vet")    return <AvatarVet size={size} color={color || "#A78BFA"}/>;
  if (icon === "passenger") return <AvatarPassenger size={size} color={color || "#4CAF82"}/>;
  if (icon === "traveler")  return <AvatarTraveler size={size} color={color || "#FF6B35"}/>;
  return <span style={{fontSize: size * 0.5}}>{icon}</span>;
}

// ─── SHARED UI ────────────────────────────────────────────────────────────────
const TierBadge = ({tier,type,size="sm"}) => {
  const t = type==="traveler" ? TRAVELER_TIERS[tier] : PASSENGER_TIERS[tier];
  if (!t) return null;
  const p = size==="lg" ? "5px 14px" : "3px 9px";
  const fs = size==="lg" ? [14,12] : [11,10];
  return (
    <span style={{display:"inline-flex",alignItems:"center",gap:4,background:`${t.color}18`,border:`1px solid ${t.color}44`,borderRadius:20,padding:p}}>
      <span style={{fontSize:fs[0]}}>{t.icon}</span>
      <span style={{fontSize:fs[1],fontWeight:800,color:t.color}}>{t.label}</span>
    </span>
  );
};

const PeakBadge = ({peak}) => (
  <span style={{display:"inline-flex",alignItems:"center",gap:4,
    background:peak?"rgba(247,201,72,0.12)":"rgba(76,175,130,0.1)",
    border:`1px solid ${peak?"rgba(247,201,72,0.35)":"rgba(76,175,130,0.25)"}`,borderRadius:20,padding:"2px 8px"}}>
    <span style={{fontSize:9}}>{peak?"🔴":"🟢"}</span>
    <span style={{fontSize:9,fontWeight:800,color:peak?"#F7C948":"#4CAF82"}}>{peak?"PEAK":"STANDARD"}</span>
  </span>
);

const GPSStatusDot = ({tracking}) => (
  <div style={{width:7,height:7,borderRadius:"50%",background:tracking?"#4CAF82":"#FF6B35",
    animation:tracking?"gpsPulse 1.5s infinite":"none",flexShrink:0}}/>
);

function TripProgress({label,value,max,color,nextLabel}){
  const pct = max===Infinity ? 100 : Math.min(100,Math.round((value/max)*100));
  return (
    <div style={{marginBottom:12}}>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}>
        <span style={{fontSize:11,color:C.muted}}>{label}</span>
        <span style={{fontSize:11,fontWeight:700}}>{max===Infinity?"∞ Unlimited":`${value} / ${max}`}</span>
      </div>
      <div style={{height:5,background:"rgba(255,255,255,0.07)",borderRadius:3,overflow:"hidden"}}>
        <div style={{height:"100%",width:`${pct}%`,background:`linear-gradient(90deg,${color}55,${color})`,borderRadius:3,transition:"width 0.6s"}}/>
      </div>
      {nextLabel&&max!==Infinity&&<div style={{fontSize:10,color:C.muted,marginTop:3}}>{max-value} more trips to reach {nextLabel}</div>}
    </div>
  );
}

// ─── LIVE MAP (Leaflet) ───────────────────────────────────────────────────────
function LiveMap({userPos,travelers,isTracking,isDriver,height=280}){
  const mapRef=useRef(null),lmap=useRef(null),uMark=useRef(null),
        tMarks=useRef({}),aCirc=useRef(null),inited=useRef(false);

  const init = useCallback(() => {
    if (!mapRef.current||inited.current||!window.L) return;
    const L=window.L, center=userPos?[userPos.lat,userPos.lon]:[20,0];
    lmap.current=L.map(mapRef.current,{center,zoom:userPos?15:2,zoomControl:true,attributionControl:false});
    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",{maxZoom:19}).addTo(lmap.current);
    inited.current=true;
  },[]);

  useEffect(()=>{
    if (document.getElementById("lf-css")) { setTimeout(init,200); return; }
    const css=document.createElement("link"); css.id="lf-css"; css.rel="stylesheet";
    css.href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css";
    document.head.appendChild(css);
    const js=document.createElement("script"); js.src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js";
    js.onload=()=>setTimeout(init,300); document.head.appendChild(js);
  },[init]);

  // User position — exact GPS pin
  useEffect(()=>{
    if (!lmap.current||!userPos||!window.L) return;
    const L=window.L, ll=[userPos.lat,userPos.lon];
    // accuracy ring (small when GPS is exact)
    if (aCirc.current) aCirc.current.remove();
    if (userPos.accuracy && userPos.accuracy < 5000) {
      aCirc.current=L.circle(ll,{radius:userPos.accuracy,color:"#FF6B35",fillColor:"#FF6B35",fillOpacity:0.06,weight:1,dashArray:"4"}).addTo(lmap.current);
    }
    const icon=L.divIcon({
      html:`<div style="position:relative;">
        <div style="width:20px;height:20px;border-radius:50%;background:#FF6B35;border:3px solid #fff;box-shadow:0 0 0 5px rgba(255,107,53,0.25),0 2px 10px rgba(0,0,0,0.5);"></div>
        <div style="position:absolute;top:-2px;left:-2px;width:24px;height:24px;border-radius:50%;border:2px solid rgba(255,107,53,0.5);animation:gpsPulse 1.5s infinite;"></div>
      </div>`,
      iconSize:[20,20], iconAnchor:[10,10], className:""
    });
    if (uMark.current) uMark.current.setLatLng(ll).setIcon(icon);
    else uMark.current=L.marker(ll,{icon}).bindPopup(`<b>📍 Your Exact Location</b><br>${userPos.lat.toFixed(6)}°, ${userPos.lon.toFixed(6)}°<br>Accuracy: ±${Math.round(userPos.accuracy||0)}m`).addTo(lmap.current);
    lmap.current.setView(ll,15,{animate:true});
  },[userPos]);

  // Traveler markers
  useEffect(()=>{
    if (!lmap.current||!window.L||!travelers.length) return;
    const L=window.L;
    travelers.forEach(t=>{
      const ti=TRAVELER_TIERS[t.tier];
      const icon=L.divIcon({
        html:`<div style="width:38px;height:38px;border-radius:50%;background:${ti.color}22;border:2.5px solid ${ti.color};display:flex;align-items:center;justify-content:center;font-size:16px;box-shadow:0 2px 12px rgba(0,0,0,0.5);">${ti.icon}</div>`,
        iconSize:[38,38], iconAnchor:[19,19], className:""
      });
      if (tMarks.current[t.id]) tMarks.current[t.id].setLatLng([t.lat,t.lon]);
      else tMarks.current[t.id]=L.marker([t.lat,t.lon],{icon})
        .bindPopup(`<b>${t.name}</b><br>${t.from} → ${t.to}<br>★ ${t.rating} · ${t.seats} seat${t.seats>1?"s":""}`)
        .addTo(lmap.current);
    });
  },[travelers]);

  return (
    <div style={{position:"relative",borderRadius:16,overflow:"hidden",height,width:"100%"}}>
      <div ref={mapRef} style={{width:"100%",height:"100%"}}/>
      {/* GPS status overlay */}
      <div style={{position:"absolute",top:12,left:12,display:"flex",alignItems:"center",gap:6,
        background:"rgba(8,8,16,0.9)",backdropFilter:"blur(8px)",borderRadius:20,padding:"6px 12px",
        border:`1px solid ${isTracking?"rgba(76,175,130,0.4)":"rgba(255,255,255,0.1)"}`}}>
        <GPSStatusDot tracking={isTracking}/>
        <span style={{fontSize:11,fontWeight:700,color:isTracking?"#4CAF82":C.muted}}>{isTracking?"GPS EXACT":"GPS OFF"}</span>
        {userPos&&isTracking&&<span style={{fontSize:10,color:C.muted}}>±{Math.round(userPos.accuracy||0)}m</span>}
      </div>
      {/* Coord display */}
      {userPos&&(
        <div style={{position:"absolute",top:12,right:12,background:"rgba(8,8,16,0.9)",backdropFilter:"blur(8px)",
          borderRadius:12,padding:"6px 11px",border:"1px solid rgba(255,255,255,0.1)",textAlign:"right"}}>
          <div style={{fontSize:9,fontWeight:700,color:"#FF6B35",letterSpacing:1,marginBottom:2}}>ACCURACY</div>
          <div style={{fontSize:11,color:C.text,fontWeight:700}}>±{Math.round(userPos.accuracy||0)}m</div>
        </div>
      )}
      <div style={{position:"absolute",bottom:12,left:12,background:"rgba(8,8,16,0.9)",backdropFilter:"blur(8px)",
        borderRadius:20,padding:"6px 12px",border:"1px solid rgba(255,107,53,0.3)"}}>
        <span style={{fontSize:11,fontWeight:700,color:"#FF6B35"}}>🚗 {travelers.length} routes live</span>
      </div>
      {isDriver&&(
        <div style={{position:"absolute",bottom:12,right:12,background:"#FF6B35",borderRadius:20,padding:"6px 12px"}}>
          <span style={{fontSize:11,fontWeight:800,color:"#0A0A0F"}}>📡 BROADCASTING</span>
        </div>
      )}
      {!userPos&&(
        <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",
          background:"rgba(8,8,16,0.7)",backdropFilter:"blur(4px)"}}>
          <div style={{textAlign:"center"}}>
            <div style={{fontSize:32,marginBottom:10}}>📍</div>
            <div style={{fontSize:13,color:C.muted,marginBottom:6}}>Requesting exact GPS location…</div>
            <div style={{fontSize:11,color:C.muted}}>Please allow location access in your browser</div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── TRAVELER CARD ────────────────────────────────────────────────────────────
function TravelerCard({traveler,peak,onAsk}){
  const ti=TRAVELER_TIERS[traveler.tier], fare=calcFare(traveler.miles,peak);
  return (
    <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:16,padding:"14px 16px",marginBottom:10,transition:"border-color 0.2s"}}
      onMouseEnter={e=>e.currentTarget.style.borderColor="rgba(255,107,53,0.3)"}
      onMouseLeave={e=>e.currentTarget.style.borderColor=C.border}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
        <div style={{display:"flex",alignItems:"center",gap:11}}>
          <div style={{position:"relative",flexShrink:0}}>
            <div style={{width:42,height:42,borderRadius:"50%",background:ti.gradient,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,boxShadow:`0 2px 10px ${ti.color}44`}}>{ti.icon}</div>
            <div style={{position:"absolute",bottom:-2,right:-2,width:12,height:12,borderRadius:"50%",background:"#4CAF82",border:"2px solid #080810",animation:"gpsPulse 1.5s infinite"}}/>
          </div>
          <div>
            <div style={{display:"flex",alignItems:"center",gap:5,flexWrap:"wrap"}}>
              <span style={{fontSize:13,fontWeight:800}}>{traveler.name}</span>
              <TierBadge tier={traveler.tier} type="traveler"/>
              {traveler.tier==="elite"&&<span style={{fontSize:10,fontWeight:800,color:"#A78BFA",background:"rgba(167,139,250,0.12)",border:"1px solid rgba(167,139,250,0.3)",borderRadius:10,padding:"2px 7px"}}>⭐ Preferred</span>}
            </div>
            <div style={{fontSize:11,color:C.muted,marginTop:2}}>{traveler.from} → {traveler.to}</div>
            <div style={{display:"flex",gap:8,marginTop:3,alignItems:"center"}}>
              <span style={{fontSize:10,color:"#F7C948"}}>★ {traveler.rating}</span>
              <span style={{fontSize:10,color:C.muted}}>{traveler.trips} trips</span>
              <span style={{fontSize:10,color:"#4CAF82"}}>● {traveler.seats} seat{traveler.seats>1?"s":""}</span>
              <PeakBadge peak={peak}/>
            </div>
          </div>
        </div>
        <div style={{textAlign:"right",flexShrink:0,marginLeft:8}}>
          <div style={{fontSize:20,fontWeight:900,color:"#4CAF82"}}>${fare}</div>
          <div style={{fontSize:9,color:C.muted,marginTop:1}}>per seat · negotiable</div>
        </div>
      </div>
      <div style={{background:"rgba(76,175,130,0.06)",border:"1px solid rgba(76,175,130,0.15)",borderRadius:10,padding:"6px 10px",marginTop:10,marginBottom:10,display:"flex",flexWrap:"wrap",gap:8,alignItems:"center"}}>
        <span style={{fontSize:10,color:"#4CAF82",fontWeight:700}}>✓ Verified Driver</span>
        <span style={{fontSize:10,color:"rgba(240,237,232,0.4)"}}>·</span>
        <span style={{fontSize:10,color:"#60A5FA",fontWeight:700}}>📷 Cams Confirmed</span>
        <span style={{fontSize:10,color:"rgba(240,237,232,0.4)"}}>·</span>
        <span style={{fontSize:10,color:"#F7C948",fontWeight:700}}>⭐ {traveler.rating} / 5.0</span>
        {traveler.rating < 3.5 && <span style={{fontSize:10,color:"#FF6B35",fontWeight:800,background:"rgba(255,107,53,0.12)",border:"1px solid rgba(255,107,53,0.3)",borderRadius:8,padding:"1px 6px"}}>⚠️ Below min</span>}
      </div>
      <div style={{display:"flex",gap:8}}>
        <button onClick={onAsk} style={{flex:1,background:`${ti.color}10`,border:`1px solid ${ti.color}28`,borderRadius:10,color:ti.color,padding:"9px 12px",fontSize:12,fontWeight:800,cursor:"pointer",fontFamily:"'Syne',sans-serif"}}>💬 Message & Negotiate</button>
        <button onClick={onAsk} style={{background:"rgba(255,107,53,0.1)",border:"1px solid rgba(255,107,53,0.22)",borderRadius:10,color:"#FF6B35",padding:"9px 14px",fontSize:12,fontWeight:800,cursor:"pointer",fontFamily:"'Syne',sans-serif"}}>Ask →</button>
      </div>
    </div>
  );
}

// ─── WEATHER CARD ─────────────────────────────────────────────────────────────
function WeatherCard({weather,loading}){
  const cond=WX[weather?.condition]||WX.cloudy;
  return (
    <div style={{borderRadius:20,background:cond.grad,padding:"20px",marginBottom:18,position:"relative",overflow:"hidden",minHeight:130}}>
      <div style={{position:"absolute",inset:0,background:"radial-gradient(ellipse at top right,rgba(255,255,255,0.15),transparent 60%)",pointerEvents:"none"}}/>
      {loading ? <div style={{color:"rgba(255,255,255,0.7)",fontSize:13,paddingTop:8}}>📡 Fetching local weather…</div> : (
        <>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
            <div>
              <div style={{fontSize:11,fontWeight:700,letterSpacing:2,textTransform:"uppercase",color:"rgba(255,255,255,0.7)",marginBottom:5}}>📍 {weather?.city}</div>
              <div style={{fontSize:52,fontWeight:900,color:"#fff",letterSpacing:"-3px",lineHeight:1}}>{weather?.temp??"--"}°</div>
              <div style={{fontSize:13,color:"rgba(255,255,255,0.85)",marginTop:3}}>{cond.label}</div>
            </div>
            <div style={{fontSize:48,filter:"drop-shadow(0 4px 12px rgba(0,0,0,0.3))"}}>{cond.icon}</div>
          </div>
          <div style={{display:"flex",gap:20,marginTop:14}}>
            {[["Feels like",`${weather?.feels_like??"--"}°`],["Humidity",`${weather?.humidity??"--"}%`],["Wind",`${weather?.wind??"--"} km/h`]].map(([l,v])=>(
              <div key={l}><div style={{fontSize:10,color:"rgba(255,255,255,0.6)",letterSpacing:1,textTransform:"uppercase"}}>{l}</div><div style={{fontSize:13,fontWeight:700,color:"#fff"}}>{v}</div></div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─── NEWS CARD ────────────────────────────────────────────────────────────────
function NewsCard({item,liked,onLike}){
  return (
    <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:16,padding:"15px 15px 11px",marginBottom:10,transition:"border-color 0.2s"}}
      onMouseEnter={e=>e.currentTarget.style.borderColor="rgba(255,255,255,0.15)"}
      onMouseLeave={e=>e.currentTarget.style.borderColor=C.border}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
        <div style={{display:"inline-flex",alignItems:"center",gap:5,background:`${item.categoryColor}18`,border:`1px solid ${item.categoryColor}33`,borderRadius:20,padding:"3px 9px"}}>
          <span style={{fontSize:10}}>{item.icon}</span>
          <span style={{fontSize:10,fontWeight:700,color:item.categoryColor,textTransform:"uppercase"}}>{item.category}</span>
        </div>
        <div style={{display:"flex",gap:7,alignItems:"center"}}>
          {item.verified&&<span style={{fontSize:10,color:"#4CAF82",fontWeight:700}}>✓</span>}
          <span style={{fontSize:10,color:C.muted}}>{item.time}</span>
        </div>
      </div>
      <div style={{fontSize:14,fontWeight:800,lineHeight:1.3,marginBottom:7}}>{item.title}</div>
      <div style={{fontSize:12,color:C.muted,lineHeight:1.6,marginBottom:11}}>{item.body}</div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div style={{fontSize:11,color:C.muted}}>By <span style={{color:C.text,fontWeight:700}}>{item.author}</span></div>
        <div style={{display:"flex",gap:13}}>
          <button onClick={()=>onLike(item.id)} style={{background:"none",border:"none",cursor:"pointer",display:"flex",alignItems:"center",gap:4,color:liked?"#FF6B35":C.muted,fontSize:12,fontWeight:700,fontFamily:"'Syne',sans-serif"}}>{liked?"❤️":"🤍"} {item.likes+(liked?1:0)}</button>
          <div style={{display:"flex",alignItems:"center",gap:4,color:C.muted,fontSize:12}}>💬 {item.comments}</div>
        </div>
      </div>
    </div>
  );
}

// ─── TRAVELER TIER CARD ───────────────────────────────────────────────────────
function TravelerTierCard({tier,isActive,usedTrips}){
  const t=TRAVELER_TIERS[tier], keys=Object.keys(TRAVELER_TIERS), nextT=TRAVELER_TIERS[keys[keys.indexOf(tier)+1]];
  return (
    <div style={{background:isActive?`${t.color}10`:C.surface,border:`1.5px solid ${isActive?t.color:C.border}`,borderRadius:22,padding:"20px",marginBottom:14,position:"relative",overflow:"hidden",transition:"all 0.3s"}}>
      {isActive&&<div style={{position:"absolute",top:0,right:0,background:t.gradient,padding:"4px 14px",borderRadius:"0 22px 0 14px",fontSize:9,fontWeight:800,color:"#fff",letterSpacing:1,textTransform:"uppercase"}}>YOUR PLAN</div>}
      {tier==="elite"&&<div style={{position:"absolute",top:isActive?0:8,left:isActive?120:8,background:"rgba(167,139,250,0.15)",border:"1px solid rgba(167,139,250,0.35)",borderRadius:20,padding:"3px 10px",fontSize:9,fontWeight:800,color:"#A78BFA",letterSpacing:1,textTransform:"uppercase"}}>⭐ FIRST PREFERRED</div>}
      <div style={{position:"absolute",bottom:-16,right:-8,fontSize:72,opacity:0.05}}>{t.icon}</div>
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:14,marginTop:tier==="elite"?18:0}}>
        <div style={{width:52,height:52,borderRadius:14,background:t.gradient,display:"flex",alignItems:"center",justifyContent:"center",fontSize:24,boxShadow:`0 4px 16px ${t.color}44`,flexShrink:0}}>{t.icon}</div>
        <div style={{flex:1}}>
          <div style={{fontSize:18,fontWeight:900,color:isActive?t.color:C.text}}>{t.label} Traveler</div>
          <div style={{fontSize:11,color:C.muted,marginTop:1}}>{t.badge} · {t.visibility}</div>
        </div>
        <div style={{textAlign:"right"}}>
          <div style={{fontSize:22,fontWeight:900,color:t.color}}>${t.subPrice}</div>
          <div style={{fontSize:10,color:C.muted}}>{t.subPeriod}</div>
        </div>
      </div>

      {/* Trip allowance highlight */}
      <div style={{background:`${t.color}0D`,border:`1.5px solid ${t.color}33`,borderRadius:14,padding:"12px 14px",marginBottom:14}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div>
            <div style={{fontSize:11,fontWeight:800,color:t.color,marginBottom:2}}>🚗 Monthly Trip Allowance</div>
            <div style={{fontSize:11,color:C.muted}}>{t.unlimited?"No cap — ride as many times as you want":"Resets at the start of each billing cycle"}</div>
          </div>
          <div style={{fontSize:28,fontWeight:900,color:t.color,letterSpacing:"-1px"}}>{t.unlimited?"∞":t.tripLimit}</div>
        </div>
        {isActive&&!t.unlimited&&usedTrips!==undefined&&(
          <div style={{marginTop:10}}>
            <TripProgress label="Trips used this month" value={usedTrips} max={t.tripLimit} color={t.color} nextLabel={nextT?.label}/>
          </div>
        )}
      </div>

      <div style={{background:"rgba(255,255,255,0.03)",border:`1px solid ${t.color}22`,borderRadius:12,padding:"8px 12px",marginBottom:12}}>
        <div style={{fontSize:11,fontWeight:800,color:t.color,marginBottom:1}}>💳 Subscription model</div>
        <div style={{fontSize:11,color:C.muted,lineHeight:1.5}}>Pay <strong style={{color:C.text}}>${t.subPrice}/mo</strong> to stay active. Keep <strong style={{color:"#4CAF82"}}>100% of every contribution</strong> negotiated with passengers.</div>
      </div>

      {t.perks.map(p=><div key={p} style={{display:"flex",gap:7,paddingBottom:5}}><span style={{color:t.color,fontSize:12,flexShrink:0}}>✓</span><span style={{fontSize:12,color:isActive?C.text:"rgba(240,237,232,0.6)"}}>{p}</span></div>)}
      {t.restrictions?.length>0&&<div style={{marginTop:8}}>{t.restrictions.map(r=><div key={r} style={{display:"flex",gap:7,paddingBottom:4}}><span style={{color:"#F7C948",fontSize:11,flexShrink:0}}>·</span><span style={{fontSize:11,color:"rgba(240,237,232,0.38)"}}>{r}</span></div>)}</div>}

      <div style={{display:"flex",gap:8,marginTop:12}}>
        {[["Monthly Trips",t.unlimited?"Unlimited":`${t.tripLimit}`],["Platform Fee","$0 per ride"],["Placement",t.visibility]].map(([l,v])=>(
          <div key={l} style={{flex:1,background:`${t.color}0D`,border:`1px solid ${t.color}22`,borderRadius:10,padding:"7px 8px",textAlign:"center"}}>
            <div style={{fontSize:9,color:C.muted,letterSpacing:0.8,textTransform:"uppercase",marginBottom:2}}>{l}</div>
            <div style={{fontSize:10,fontWeight:800,color:t.color}}>{v}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── PASSENGER TIER CARD ──────────────────────────────────────────────────────
function PassengerTierCard({isActive}){
  const t=PASSENGER_TIERS.rider;
  return (
    <div style={{background:isActive?`${t.color}10`:C.surface,border:`1.5px solid ${isActive?t.color:C.border}`,borderRadius:22,padding:"20px",marginBottom:14,position:"relative",overflow:"hidden"}}>
      {isActive&&<div style={{position:"absolute",top:0,right:0,background:t.gradient,padding:"4px 14px",borderRadius:"0 22px 0 14px",fontSize:9,fontWeight:800,color:"#fff",letterSpacing:1,textTransform:"uppercase"}}>YOUR PLAN</div>}
      <div style={{position:"absolute",bottom:-16,right:-8,fontSize:72,opacity:0.05}}>{t.icon}</div>
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:14}}>
        <div style={{width:52,height:52,borderRadius:14,background:t.gradient,display:"flex",alignItems:"center",justifyContent:"center",boxShadow:`0 4px 16px ${t.color}44`,flexShrink:0,overflow:"hidden"}}>
          <AvatarPassenger size={46} color={t.color}/>
        </div>
        <div style={{flex:1}}>
          <div style={{fontSize:18,fontWeight:900,color:isActive?t.color:C.text}}>Passenger</div>
          <div style={{fontSize:11,color:C.muted,marginTop:1}}>{t.badge} · Full platform access</div>
        </div>
        <div style={{textAlign:"right"}}>
          <div style={{fontSize:22,fontWeight:900,color:t.color}}>${t.subPrice}</div>
          <div style={{fontSize:10,color:C.muted}}>{t.subPeriod}</div>
        </div>
      </div>
      <div style={{background:"rgba(76,175,130,0.08)",border:"1.5px solid rgba(76,175,130,0.28)",borderRadius:14,padding:"12px 14px",marginBottom:14}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div>
            <div style={{fontSize:11,fontWeight:800,color:"#4CAF82",marginBottom:2}}>🚀 Unlimited Ride Requests</div>
            <div style={{fontSize:11,color:C.muted}}>Request as many rides as you need</div>
          </div>
          <div style={{fontSize:28,fontWeight:900,color:"#4CAF82"}}>∞</div>
        </div>
      </div>
      <div style={{background:"rgba(255,255,255,0.03)",border:`1px solid ${t.color}22`,borderRadius:12,padding:"8px 12px",marginBottom:12}}>
        <div style={{fontSize:11,fontWeight:800,color:t.color,marginBottom:1}}>💳 Simple flat rate</div>
        <div style={{fontSize:11,color:C.muted,lineHeight:1.5}}><strong style={{color:C.text}}>$8/month</strong> for full platform access. <strong style={{color:"#4CAF82"}}>Contribution agreed directly with your traveler with your traveler — On My Way takes $0.</strong></div>
      </div>
      {t.perks.map(p=><div key={p} style={{display:"flex",gap:7,paddingBottom:5}}><span style={{color:t.color,fontSize:12,flexShrink:0}}>✓</span><span style={{fontSize:12,color:isActive?C.text:"rgba(240,237,232,0.6)"}}>{p}</span></div>)}
      <div style={{display:"flex",gap:8,marginTop:14}}>
        {[["Monthly Price","$8"],["Ride Requests","Unlimited"],["Platform Fee","$0"]].map(([l,v])=>(
          <div key={l} style={{flex:1,background:`${t.color}0D`,border:`1px solid ${t.color}22`,borderRadius:10,padding:"7px 8px",textAlign:"center"}}>
            <div style={{fontSize:9,color:C.muted,letterSpacing:0.8,textTransform:"uppercase",marginBottom:2}}>{l}</div>
            <div style={{fontSize:10,fontWeight:800,color:t.color}}>{v}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── MODALS ───────────────────────────────────────────────────────────────────
function Modal({onClose,children,maxW=480}){
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.9)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:20,overflowY:"auto"}} onClick={onClose}>
      <div style={{background:"#111118",borderRadius:24,padding:"28px 24px 36px",width:"100%",maxWidth:maxW,maxHeight:"92vh",overflowY:"auto"}} onClick={e=>e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

function PostRouteModal({userPos,travelerTier,peakWindows,locationLabel,onClose,onPost}){
  const [destination,setDestination]=useState(""),
        [seats,setSeats]=useState(2),
        [note,setNote]=useState(""),
        [posting,setPosting]=useState(false),
        [geocoding,setGeocoding]=useState(false),
        [destCoords,setDestCoords]=useState(null),
        [geocodeErr,setGeocodeErr]=useState(false),
        [manualMiles,setManualMiles]=useState(null);
  const timer=useRef(null);
  const peak=inPeak(peakWindows), rate=peak?RATE_PEAK:RATE_STD;
  const miles=destCoords&&userPos?haversine(userPos.lat,userPos.lon,destCoords.lat,destCoords.lon):manualMiles;
  const fare=miles?calcFare(miles,peak):null;
  const t=TRAVELER_TIERS[travelerTier];

  useEffect(()=>{
    if (!destination||destination.length<4){setDestCoords(null);setGeocodeErr(false);return;}
    clearTimeout(timer.current);
    timer.current=setTimeout(async()=>{
      setGeocoding(true);setGeocodeErr(false);
      const r=await geocode(destination); setGeocoding(false);
      if(r){setDestCoords(r);setManualMiles(null);}else{setDestCoords(null);setGeocodeErr(true);}
    },800);
    return()=>clearTimeout(timer.current);
  },[destination]);

  return (
    <Modal onClose={onClose}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
        <div style={{fontSize:20,fontWeight:900}}>📡 Broadcast My Route</div>
        <button onClick={onClose} style={{background:"none",border:"none",color:C.muted,fontSize:20,cursor:"pointer"}}>✕</button>
      </div>
      <div style={{background:`${t.color}0A`,border:`1px solid ${t.color}22`,borderRadius:12,padding:"8px 13px",marginBottom:14}}>
        <div style={{fontSize:11,fontWeight:800,color:t.color}}>{t.icon} {t.badge} · {t.visibility}</div>
      </div>
      {userPos?(
        <div style={{background:"rgba(76,175,130,0.07)",border:"1px solid rgba(76,175,130,0.2)",borderRadius:12,marginBottom:14,overflow:"hidden"}}>
          <div style={{padding:"10px 13px 8px"}}>
            <div style={{fontSize:10,fontWeight:800,color:"#4CAF82",marginBottom:4}}>📍 YOUR STARTING POINT</div>
            <div style={{fontSize:12,fontWeight:700,color:C.text}}>{locationLabel||"GPS location acquired"}</div>
            {userPos&&<div style={{fontSize:10,color:C.muted,marginTop:2}}>Accuracy: ±{Math.round(userPos.accuracy||0)}m</div>}
          </div>
          <LiveMap userPos={userPos} travelers={[]} isTracking={true} isDriver={false} height={140}/>
        </div>
      ):(
        <div style={{background:"rgba(247,201,72,0.07)",border:"1px solid rgba(247,201,72,0.22)",borderRadius:12,padding:"8px 13px",marginBottom:14}}>
          <div style={{fontSize:11,color:"#F7C948"}}>⚠️ Waiting for exact GPS — please allow location access</div>
        </div>
      )}

      <div style={{fontSize:11,fontWeight:700,letterSpacing:1,textTransform:"uppercase",color:C.muted,marginBottom:7}}>Destination</div>
      <div style={{position:"relative",marginBottom:8}}>
        <input value={destination} onChange={e=>setDestination(e.target.value)} placeholder="Enter any address, city or place…"
          style={{width:"100%",padding:"12px 40px 12px 15px",background:C.surface,border:`1.5px solid ${destCoords?"rgba(76,175,130,0.5)":geocodeErr?"rgba(247,201,72,0.4)":C.border}`,borderRadius:12,color:C.text,fontSize:14,fontFamily:"'Syne',sans-serif",outline:"none",boxSizing:"border-box"}}/>
        <div style={{position:"absolute",right:12,top:"50%",transform:"translateY(-50%)",fontSize:14}}>{geocoding?"⏳":destCoords?"✅":geocodeErr?"⚠️":""}</div>
      </div>
      {destCoords&&<div style={{fontSize:10,color:"#4CAF82",marginBottom:14}}>📍 {destCoords.display}</div>}
      {geocodeErr&&(
        <div style={{marginBottom:12}}>
          <div style={{fontSize:10,color:"#F7C948",marginBottom:6}}>⚠️ Can't locate — enter distance manually</div>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <button onClick={()=>setManualMiles(m=>Math.max(0.5,parseFloat(((m||5)-0.5).toFixed(1))))} style={{width:34,height:34,borderRadius:9,background:C.surface,border:`1px solid ${C.border}`,color:C.text,fontSize:16,cursor:"pointer",fontFamily:"'Syne',sans-serif"}}>−</button>
            <div style={{flex:1,textAlign:"center",fontSize:18,fontWeight:900}}>{manualMiles??5} mi</div>
            <button onClick={()=>setManualMiles(m=>parseFloat(((m||5)+0.5).toFixed(1)))} style={{width:34,height:34,borderRadius:9,background:C.surface,border:`1px solid ${C.border}`,color:C.text,fontSize:16,cursor:"pointer",fontFamily:"'Syne',sans-serif"}}>+</button>
          </div>
        </div>
      )}
      {miles&&userPos&&destCoords&&(
        <div style={{background:"rgba(255,107,53,0.07)",border:"1px solid rgba(255,107,53,0.2)",borderRadius:12,padding:"9px 13px",marginBottom:14,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div><div style={{fontSize:10,fontWeight:700,color:"#FF6B35",marginBottom:2}}>📐 GPS-calculated distance</div><div style={{fontSize:11,color:C.muted}}>Exact coordinates used</div></div>
          <div style={{fontSize:22,fontWeight:900,color:"#FF6B35"}}>{miles}<span style={{fontSize:12,fontWeight:400,color:C.muted}}> mi</span></div>
        </div>
      )}
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:14}}>
        <PeakBadge peak={peak}/>
        <span style={{fontSize:10,color:C.muted}}>${rate.toFixed(2)}/mi · auto-detected</span>
      </div>
      {fare?(
        <div style={{background:"linear-gradient(135deg,rgba(76,175,130,0.1),rgba(76,175,130,0.04))",border:"1.5px solid rgba(76,175,130,0.3)",borderRadius:16,padding:"16px",marginBottom:14,textAlign:"center"}}>
          <div style={{fontSize:11,fontWeight:700,letterSpacing:1,textTransform:"uppercase",color:"#4CAF82",marginBottom:8}}>💰 Suggested Contribution per Passenger</div>
          <div style={{fontSize:44,fontWeight:900,color:"#4CAF82",letterSpacing:"-2px"}}>${fare}</div>
          <div style={{fontSize:11,color:C.muted,marginTop:4}}>Passengers can counter-offer · you keep 100%</div>
        </div>
      ):(
        <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:14,padding:"16px",textAlign:"center",marginBottom:14}}>
          <div style={{fontSize:28,marginBottom:6}}>📍</div>
          <div style={{fontSize:12,color:C.muted}}>Enter a destination to estimate contribution</div>
        </div>
      )}
      <div style={{fontSize:11,fontWeight:700,letterSpacing:1,textTransform:"uppercase",color:C.muted,marginBottom:7}}>Seats available</div>
      <div style={{display:"flex",gap:7,marginBottom:14}}>
        {[1,2,3,4].map(n=><button key={n} onClick={()=>setSeats(n)} style={{flex:1,padding:"10px 0",borderRadius:10,border:`1.5px solid ${seats===n?"#FF6B35":C.border}`,background:seats===n?"rgba(255,107,53,0.12)":C.surface,color:seats===n?"#FF6B35":C.muted,fontWeight:800,fontSize:14,cursor:"pointer",fontFamily:"'Syne',sans-serif"}}>{n}</button>)}
      </div>
      <input value={note} onChange={e=>setNote(e.target.value)} placeholder="Note for passengers (optional)"
        style={{width:"100%",padding:"12px 15px",background:C.surface,border:`1.5px solid ${C.border}`,borderRadius:12,color:C.text,fontSize:13,fontFamily:"'Syne',sans-serif",marginBottom:18,outline:"none",boxSizing:"border-box"}}/>
      <button onClick={()=>{if(!destination||!miles)return;setPosting(true);setTimeout(()=>{onPost({destination:destCoords?.display||destination,seats,suggestedContribution:fare,miles,peak,note});onClose();},1200);}}
        disabled={posting||!fare}
        style={{width:"100%",padding:"16px",background:!fare||posting?"#1a1a2a":"#FF6B35",border:"none",borderRadius:14,color:!fare||posting?C.muted:"#0A0A0F",fontSize:15,fontWeight:800,cursor:!fare||posting?"default":"pointer",fontFamily:"'Syne',sans-serif"}}>
        {posting?"📡 Going live…":fare?`🚗 Broadcast — $${fare}/passenger →`:"Enter destination first"}
      </button>
    </Modal>
  );
}

function FareModal({traveler,peak,onClose}){
  const [offer,setOffer]=useState(calcFare(traveler.miles,peak));
  const [msg,setMsg]=useState(""); const [sent,setSent]=useState(false);
  const ti=TRAVELER_TIERS[traveler.tier], calc=calcFare(traveler.miles,peak);
  return (
    <Modal onClose={onClose}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
        <div style={{fontSize:20,fontWeight:900}}>Request a Ride</div>
        <button onClick={onClose} style={{background:"none",border:"none",color:C.muted,fontSize:20,cursor:"pointer"}}>✕</button>
      </div>
      {sent?(
        <div style={{textAlign:"center",padding:"20px 0"}}>
          <div style={{fontSize:44,marginBottom:12}}>✅</div>
          <div style={{fontSize:18,fontWeight:900,marginBottom:6}}>Request sent!</div>
          <div style={{fontSize:13,color:C.muted}}>Waiting for {traveler.name} to respond…</div>
        </div>
      ):(
        <>
          <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:18}}>
            <div style={{width:44,height:44,borderRadius:"50%",background:ti.gradient,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>{ti.icon}</div>
            <div>
              <div style={{fontSize:15,fontWeight:800}}>{traveler.name} <TierBadge tier={traveler.tier} type="traveler"/></div>
              <div style={{fontSize:11,color:C.muted,marginTop:2}}>{traveler.from} → {traveler.to} · ★ {traveler.rating}</div>
              <div style={{marginTop:4}}><PeakBadge peak={peak}/></div>
            </div>
          </div>
          <div style={{background:"rgba(76,175,130,0.09)",border:"1.5px solid rgba(76,175,130,0.28)",borderRadius:16,padding:"16px",marginBottom:16,textAlign:"center"}}>
            <div style={{fontSize:11,fontWeight:700,letterSpacing:1,textTransform:"uppercase",color:"#4CAF82",marginBottom:8}}>💰 Contribution for this ride</div>
            <div style={{fontSize:44,fontWeight:900,color:"#4CAF82",letterSpacing:"-2px"}}>${calc}</div>
            <div style={{fontSize:11,color:C.muted,marginTop:4}}>On My Way takes $0 — agreed directly with {traveler.name.split(" ")[0]}</div>
          </div>
          <div style={{fontSize:11,fontWeight:700,letterSpacing:1,textTransform:"uppercase",color:C.muted,marginBottom:8}}>Your offer</div>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:6}}>
            <button onClick={()=>setOffer(o=>Math.max(1,parseFloat((o-0.5).toFixed(2))))} style={{width:44,height:44,borderRadius:12,background:C.surface,border:`1px solid ${C.border}`,color:C.text,fontSize:22,cursor:"pointer",fontFamily:"'Syne',sans-serif",flexShrink:0}}>−</button>
            <div style={{flex:1,textAlign:"center"}}>
              <div style={{fontSize:40,fontWeight:900,color:offer>=calc?"#4CAF82":"#F7C948",letterSpacing:"-2px"}}>${offer.toFixed(2)}</div>
              <div style={{fontSize:10,color:C.muted}}>{offer===calc?"Matches contribution":offer>calc?`$${(offer-calc).toFixed(2)} above`:`$${(calc-offer).toFixed(2)} below`}</div>
            </div>
            <button onClick={()=>setOffer(o=>parseFloat((o+0.5).toFixed(2)))} style={{width:44,height:44,borderRadius:12,background:C.surface,border:`1px solid ${C.border}`,color:C.text,fontSize:22,cursor:"pointer",fontFamily:"'Syne',sans-serif",flexShrink:0}}>+</button>
          </div>
          <div style={{display:"flex",gap:7,marginBottom:16}}>
            {[[`Accept $${calc}`,calc],[`−$2`,parseFloat((calc-2).toFixed(2))],[`+$2`,parseFloat((calc+2).toFixed(2))]].map(([l,v])=>(
              <button key={l} onClick={()=>setOffer(Math.max(1,v))} style={{flex:1,padding:"8px 4px",borderRadius:10,border:`1px solid ${offer===v?"rgba(76,175,130,0.4)":C.border}`,background:offer===v?"rgba(76,175,130,0.12)":C.surface,color:offer===v?"#4CAF82":C.muted,fontSize:10,fontWeight:700,cursor:"pointer",fontFamily:"'Syne',sans-serif"}}>{l}</button>
            ))}
          </div>
          <textarea value={msg} onChange={e=>setMsg(e.target.value)} placeholder={`Hi ${traveler.name.split(" ")[0]}, I'd like to join your route to ${traveler.to}…`} rows={2}
            style={{width:"100%",padding:"11px 14px",background:C.surface,border:`1.5px solid ${C.border}`,borderRadius:12,color:C.text,fontSize:13,fontFamily:"'Syne',sans-serif",marginBottom:18,outline:"none",resize:"none",boxSizing:"border-box"}}/>
          <button onClick={()=>{setSent(true);setTimeout(onClose,1800);}} style={{width:"100%",padding:"16px",background:"#FF6B35",border:"none",borderRadius:14,color:"#0A0A0F",fontSize:15,fontWeight:800,cursor:"pointer",fontFamily:"'Syne',sans-serif"}}>Send ${offer.toFixed(2)} Offer →</button>
        </>
      )}
    </Modal>
  );
}

function PeakModal({windows,onSave,onClose}){
  const [local,setLocal]=useState(windows.map(w=>({...w})));
  const DAYS=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"], hrs=Array.from({length:24},(_,i)=>i);
  const upd=(i,k,v)=>setLocal(p=>p.map((w,j)=>j===i?{...w,[k]:v}:w));
  const tog=(i,day)=>setLocal(p=>p.map((w,j)=>{if(j!==i)return w;const days=w.days.includes(day)?w.days.filter(d=>d!==day):[...w.days,day].sort();return{...w,days};}));
  return (
    <Modal onClose={onClose}>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
        <div style={{fontSize:20,fontWeight:900}}>🔴 Peak Hour Windows</div>
        <button onClick={onClose} style={{background:"none",border:"none",color:C.muted,fontSize:20,cursor:"pointer"}}>✕</button>
      </div>
      <div style={{fontSize:13,color:C.muted,marginBottom:20}}>Define when the $2.50/mi peak rate applies</div>
      {local.map((w,i)=>(
        <div key={i} style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:16,padding:"14px",marginBottom:12}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:10}}>
            <input value={w.label} onChange={e=>upd(i,"label",e.target.value)} style={{background:"none",border:"none",color:"#F7C948",fontSize:13,fontWeight:800,fontFamily:"'Syne',sans-serif",outline:"none",flex:1}}/>
            <button onClick={()=>setLocal(p=>p.filter((_,j)=>j!==i))} style={{background:"none",border:"none",color:C.muted,fontSize:14,cursor:"pointer"}}>✕</button>
          </div>
          <div style={{display:"flex",gap:5,marginBottom:12}}>
            {DAYS.map((d,idx)=><button key={d} onClick={()=>tog(i,idx)} style={{flex:1,padding:"5px 2px",borderRadius:8,border:`1.5px solid ${w.days.includes(idx)?"#F7C948":C.border}`,background:w.days.includes(idx)?"rgba(247,201,72,0.12)":C.surface,color:w.days.includes(idx)?"#F7C948":C.muted,fontSize:9,fontWeight:800,cursor:"pointer",fontFamily:"'Syne',sans-serif"}}>{d}</button>)}
          </div>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <select value={w.startH} onChange={e=>upd(i,"startH",+e.target.value)} style={{flex:1,padding:"8px",background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,color:C.text,fontSize:13,fontFamily:"'Syne',sans-serif",outline:"none"}}>{hrs.map(h=><option key={h} value={h}>{fmt12(h,0)}</option>)}</select>
            <span style={{color:C.muted,fontSize:12}}>to</span>
            <select value={w.endH} onChange={e=>upd(i,"endH",+e.target.value)} style={{flex:1,padding:"8px",background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,color:C.text,fontSize:13,fontFamily:"'Syne',sans-serif",outline:"none"}}>{hrs.map(h=><option key={h} value={h}>{fmt12(h,0)}</option>)}</select>
          </div>
        </div>
      ))}
      <button onClick={()=>setLocal(p=>[...p,{label:"New Window",days:[1,2,3,4,5],startH:8,startM:0,endH:9,endM:0}])}
        style={{width:"100%",padding:"12px",background:"rgba(247,201,72,0.08)",border:"1.5px dashed rgba(247,201,72,0.3)",borderRadius:14,color:"#F7C948",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"'Syne',sans-serif",marginBottom:14}}>+ Add Peak Window</button>
      <button onClick={()=>onSave(local)} style={{width:"100%",padding:"16px",background:"#FF6B35",border:"none",borderRadius:14,color:"#0A0A0F",fontSize:15,fontWeight:800,cursor:"pointer",fontFamily:"'Syne',sans-serif"}}>Save Peak Hours →</button>
    </Modal>
  );
}

function ReportModal({onClose,onSubmit}){
  const [form,setForm]=useState({category:"Traffic",title:"",body:""});
  const cats=["Traffic","Safety","Community","Events","Lost & Found","Other"];
  const meta={Traffic:["#FF6B35","🚧"],Safety:["#F7C948","⚠️"],Community:["#4CAF82","🌳"],Events:["#C084FC","🎉"],"Lost & Found":["#60A5FA","🐾"],Other:["#9CA3AF","📢"]};
  return (
    <Modal onClose={onClose}>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
        <div style={{fontSize:20,fontWeight:900}}>Report to Community</div>
        <button onClick={onClose} style={{background:"none",border:"none",color:C.muted,fontSize:20,cursor:"pointer"}}>✕</button>
      </div>
      <div style={{fontSize:13,color:C.muted,marginBottom:16}}>Share something your neighbors should know</div>
      <div style={{display:"flex",flexWrap:"wrap",gap:7,marginBottom:14}}>
        {cats.map(c=><button key={c} onClick={()=>setForm({...form,category:c})} style={{padding:"6px 12px",borderRadius:20,border:`1.5px solid ${form.category===c?meta[c][0]:C.border}`,background:form.category===c?`${meta[c][0]}18`:"transparent",color:form.category===c?meta[c][0]:C.muted,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"'Syne',sans-serif"}}>{meta[c][1]} {c}</button>)}
      </div>
      <input value={form.title} onChange={e=>setForm({...form,title:e.target.value})} placeholder="What's happening?"
        style={{width:"100%",padding:"12px 15px",background:C.surface,border:`1.5px solid ${C.border}`,borderRadius:12,color:C.text,fontSize:14,fontFamily:"'Syne',sans-serif",marginBottom:10,outline:"none",boxSizing:"border-box"}}/>
      <textarea value={form.body} onChange={e=>setForm({...form,body:e.target.value})} placeholder="Give neighbors the full picture…" rows={3}
        style={{width:"100%",padding:"12px 15px",background:C.surface,border:`1.5px solid ${C.border}`,borderRadius:12,color:C.text,fontSize:14,fontFamily:"'Syne',sans-serif",marginBottom:18,outline:"none",resize:"none",boxSizing:"border-box"}}/>
      <button onClick={()=>{if(form.title&&form.body){onSubmit(form);onClose();}}} style={{width:"100%",padding:"16px",background:"#FF6B35",border:"none",borderRadius:14,color:"#0A0A0F",fontSize:15,fontWeight:800,cursor:"pointer",fontFamily:"'Syne',sans-serif"}}>Post to Community →</button>
    </Modal>
  );
}

// ─── GROCERY COURIER CARD ─────────────────────────────────────────────────────
function GroceryCourierCard({courier,peak,onAsk}){
  const ti=TRAVELER_TIERS[courier.tier];
  const contribution=calcFare(courier.miles,peak);
  return (
    <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:16,padding:"14px 16px",marginBottom:10,transition:"border-color 0.2s"}}
      onMouseEnter={e=>e.currentTarget.style.borderColor="rgba(76,175,130,0.35)"}
      onMouseLeave={e=>e.currentTarget.style.borderColor=C.border}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
        <div style={{display:"flex",alignItems:"center",gap:11}}>
          <div style={{position:"relative",flexShrink:0}}>
            <div style={{width:42,height:42,borderRadius:"50%",background:ti.gradient,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,boxShadow:`0 2px 10px ${ti.color}44`,overflow:"hidden"}}>
              <AvatarTraveler size={42} color={ti.color}/>
            </div>
            <div style={{position:"absolute",bottom:-2,right:-2,width:12,height:12,borderRadius:"50%",background:"#4CAF82",border:"2px solid #080810",animation:"gpsPulse 1.5s infinite"}}/>
          </div>
          <div>
            <div style={{display:"flex",alignItems:"center",gap:5,flexWrap:"wrap"}}>
              <span style={{fontSize:13,fontWeight:800}}>{courier.name}</span>
              <TierBadge tier={courier.tier} type="traveler"/>
              {courier.tier==="elite"&&<span style={{fontSize:10,fontWeight:800,color:"#A78BFA",background:"rgba(167,139,250,0.12)",border:"1px solid rgba(167,139,250,0.3)",borderRadius:10,padding:"2px 7px"}}>⭐ Preferred</span>}
            </div>
            <div style={{fontSize:11,color:"#4CAF82",fontWeight:700,marginTop:2}}>🛒 Shops at: {courier.store}</div>
            <div style={{display:"flex",gap:8,marginTop:3,alignItems:"center"}}>
              <span style={{fontSize:10,color:"#F7C948"}}>★ {courier.rating}</span>
              <span style={{fontSize:10,color:C.muted}}>{courier.deliveries} deliveries</span>
              <span style={{fontSize:10,color:"#4CAF82"}}>📍 Within {courier.radius}</span>
              <span style={{fontSize:10,color:C.muted}}>⏱ {courier.eta}</span>
            </div>
          </div>
        </div>
        <div style={{textAlign:"right",flexShrink:0,marginLeft:8}}>
          <div style={{fontSize:20,fontWeight:900,color:"#4CAF82"}}>${contribution}</div>
          <div style={{fontSize:9,color:C.muted,marginTop:1}}>suggested · negotiable</div>
          <PeakBadge peak={peak}/>
        </div>
      </div>
      <div style={{background:"rgba(76,175,130,0.06)",border:"1px solid rgba(76,175,130,0.15)",borderRadius:10,padding:"6px 10px",marginTop:10,marginBottom:10,display:"flex",flexWrap:"wrap",gap:8,alignItems:"center"}}>
        <span style={{fontSize:10,color:"#4CAF82",fontWeight:700}}>✓ Verified Driver</span>
        <span style={{fontSize:10,color:"rgba(240,237,232,0.4)"}}>·</span>
        <span style={{fontSize:10,color:"#60A5FA",fontWeight:700}}>📷 Interior & Exterior Cams</span>
        <span style={{fontSize:10,color:"rgba(240,237,232,0.4)"}}>·</span>
        <span style={{fontSize:10,color:"#F7C948",fontWeight:700}}>⭐ {courier.rating} / 5.0</span>
        {courier.rating < 3.5 && <span style={{fontSize:10,color:"#FF6B35",fontWeight:800,background:"rgba(255,107,53,0.12)",border:"1px solid rgba(255,107,53,0.3)",borderRadius:8,padding:"1px 6px"}}>⚠️ Below minimum</span>}
      </div>
      <div style={{display:"flex",gap:8}}>
        <button onClick={onAsk} style={{flex:1,background:`${ti.color}10`,border:`1px solid ${ti.color}28`,borderRadius:10,color:ti.color,padding:"9px 12px",fontSize:12,fontWeight:800,cursor:"pointer",fontFamily:"'Syne',sans-serif"}}>💬 Message & Negotiate</button>
        <button onClick={onAsk} style={{background:"rgba(76,175,130,0.1)",border:"1px solid rgba(76,175,130,0.22)",borderRadius:10,color:"#4CAF82",padding:"9px 14px",fontSize:12,fontWeight:800,cursor:"pointer",fontFamily:"'Syne',sans-serif"}}>Request →</button>
      </div>
    </div>
  );
}

// ─── POST DELIVERY MODAL ──────────────────────────────────────────────────────
function PostDeliveryModal({userPos,travelerTier,peakWindows,locationLabel,onClose,onPost}){
  const [store,setStore]=useState("");
  const [deliveryArea,setDeliveryArea]=useState("");
  const [maxRadius,setMaxRadius]=useState(5);
  const [note,setNote]=useState("");
  const [posting,setPosting]=useState(false);
  const peak=inPeak(peakWindows);
  const t=TRAVELER_TIERS[travelerTier];
  const baseContrib=calcFare(maxRadius,peak);

  return (
    <Modal onClose={onClose}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
        <div style={{fontSize:20,fontWeight:900}}>🛒 Offer Grocery Delivery</div>
        <button onClick={onClose} style={{background:"none",border:"none",color:C.muted,fontSize:20,cursor:"pointer"}}>✕</button>
      </div>

      {/* Tier badge */}
      <div style={{background:`${t.color}0A`,border:`1px solid ${t.color}22`,borderRadius:12,padding:"8px 13px",marginBottom:14}}>
        <div style={{fontSize:11,fontWeight:800,color:t.color}}>{t.icon} {t.badge} · Same driver requirements as Ride Share</div>
      </div>

      {/* Requirements reminder */}
      <div style={{background:"rgba(76,175,130,0.06)",border:"1px solid rgba(76,175,130,0.18)",borderRadius:12,padding:"10px 13px",marginBottom:14}}>
        <div style={{fontSize:11,fontWeight:800,color:"#4CAF82",marginBottom:6}}>✓ Delivery driver requirements</div>
        {["Valid driver's licence · clean abstract (≤30 days)","No violent felonies · no DUI or drug-related driving offences","Interior-facing camera installed and operational","Exterior dashcam installed and operational","Minimum 3.5-star driver rating (applies to all services)"].map(r=>(
          <div key={r} style={{display:"flex",gap:7,marginBottom:3}}>
            <span style={{color:"#4CAF82",fontSize:11,flexShrink:0}}>✓</span>
            <span style={{fontSize:11,color:C.muted}}>{r}</span>
          </div>
        ))}
        <div style={{fontSize:10,color:"rgba(240,237,232,0.35)",marginTop:6}}>Your existing traveler verification covers grocery delivery — no re-verification needed.</div>
      </div>

      {/* Starting location */}
      {userPos ? (
        <div style={{background:"rgba(76,175,130,0.07)",border:"1px solid rgba(76,175,130,0.2)",borderRadius:12,marginBottom:14,overflow:"hidden"}}>
          <div style={{padding:"10px 13px 8px"}}>
            <div style={{fontSize:10,fontWeight:800,color:"#4CAF82",marginBottom:4}}>📍 YOUR CURRENT LOCATION</div>
            <div style={{fontSize:12,fontWeight:700,color:C.text}}>{locationLabel||"GPS location acquired"}</div>
            {userPos&&<div style={{fontSize:10,color:C.muted,marginTop:2}}>Accuracy: ±{Math.round(userPos.accuracy||0)}m</div>}
          </div>
          <LiveMap userPos={userPos} travelers={[]} isTracking={true} isDriver={false} height={130}/>
        </div>
      ):(
        <div style={{background:"rgba(247,201,72,0.07)",border:"1px solid rgba(247,201,72,0.22)",borderRadius:12,padding:"8px 13px",marginBottom:14}}>
          <div style={{fontSize:11,color:"#F7C948"}}>⚠️ Waiting for GPS — please allow location access</div>
        </div>
      )}

      {/* Grocery store */}
      <div style={{fontSize:11,fontWeight:700,letterSpacing:1,textTransform:"uppercase",color:C.muted,marginBottom:7}}>Which grocery store will you shop at?</div>
      <input value={store} onChange={e=>setStore(e.target.value)} placeholder="e.g. FreshMart, Costco, Whole Foods…"
        style={{width:"100%",padding:"12px 15px",background:C.surface,border:`1.5px solid ${store?C.border:C.border}`,borderRadius:12,color:C.text,fontSize:14,fontFamily:"'Syne',sans-serif",outline:"none",boxSizing:"border-box",marginBottom:14}}/>

      {/* Delivery area */}
      <div style={{fontSize:11,fontWeight:700,letterSpacing:1,textTransform:"uppercase",color:C.muted,marginBottom:7}}>Delivery neighbourhood / area</div>
      <input value={deliveryArea} onChange={e=>setDeliveryArea(e.target.value)} placeholder="e.g. Coquitlam Centre, Port Moody…"
        style={{width:"100%",padding:"12px 15px",background:C.surface,border:`1.5px solid ${C.border}`,borderRadius:12,color:C.text,fontSize:14,fontFamily:"'Syne',sans-serif",outline:"none",boxSizing:"border-box",marginBottom:14}}/>

      {/* Max radius */}
      <div style={{fontSize:11,fontWeight:700,letterSpacing:1,textTransform:"uppercase",color:C.muted,marginBottom:7}}>Max delivery radius</div>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:14}}>
        <button onClick={()=>setMaxRadius(r=>Math.max(1,r-1))} style={{width:36,height:36,borderRadius:10,background:C.surface,border:`1px solid ${C.border}`,color:C.text,fontSize:18,cursor:"pointer",fontFamily:"'Syne',sans-serif"}}>−</button>
        <div style={{flex:1,textAlign:"center",fontSize:20,fontWeight:900}}>{maxRadius} mi</div>
        <button onClick={()=>setMaxRadius(r=>Math.min(20,r+1))} style={{width:36,height:36,borderRadius:10,background:C.surface,border:`1px solid ${C.border}`,color:C.text,fontSize:18,cursor:"pointer",fontFamily:"'Syne',sans-serif"}}>+</button>
      </div>

      {/* Contribution preview */}
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
        <PeakBadge peak={peak}/>
        <span style={{fontSize:10,color:C.muted}}>${(peak?RATE_PEAK:RATE_STD).toFixed(2)}/mi · same rates as Ride Share</span>
      </div>
      <div style={{background:"linear-gradient(135deg,rgba(76,175,130,0.1),rgba(76,175,130,0.04))",border:"1.5px solid rgba(76,175,130,0.3)",borderRadius:16,padding:"16px",marginBottom:14,textAlign:"center"}}>
        <div style={{fontSize:11,fontWeight:700,letterSpacing:1,textTransform:"uppercase",color:"#4CAF82",marginBottom:8}}>💰 Suggested Contribution (up to {maxRadius} mi)</div>
        <div style={{fontSize:44,fontWeight:900,color:"#4CAF82",letterSpacing:"-2px"}}>${baseContrib}</div>
        <div style={{fontSize:11,color:C.muted,marginTop:4}}>Customers can counter-offer · you keep 100%</div>
      </div>

      <textarea value={note} onChange={e=>setNote(e.target.value)} placeholder="Notes for customers (accepted items, timing, special instructions…)" rows={2}
        style={{width:"100%",padding:"12px 15px",background:C.surface,border:`1.5px solid ${C.border}`,borderRadius:12,color:C.text,fontSize:13,fontFamily:"'Syne',sans-serif",marginBottom:18,outline:"none",resize:"none",boxSizing:"border-box"}}/>

      <button
        onClick={()=>{if(!store||!deliveryArea)return;setPosting(true);setTimeout(()=>{onPost({store,deliveryArea,maxRadius,suggestedContribution:baseContrib,peak,note});onClose();},1200);}}
        disabled={posting||!store||!deliveryArea}
        style={{width:"100%",padding:"16px",background:!store||!deliveryArea||posting?"#1a1a2a":"#4CAF82",border:"none",borderRadius:14,color:!store||!deliveryArea||posting?C.muted:"#0A0A0F",fontSize:15,fontWeight:800,cursor:!store||!deliveryArea||posting?"default":"pointer",fontFamily:"'Syne',sans-serif"}}>
        {posting?"📡 Going live…":store&&deliveryArea?`🛒 Broadcast Delivery — $${baseContrib} suggested →`:"Enter store & delivery area first"}
      </button>
    </Modal>
  );
}

// ─── GROCERY CONTRIBUTION MODAL ───────────────────────────────────────────────
function GroceryContributionModal({courier,peak,onClose}){
  const [offer,setOffer]=useState(calcFare(courier.miles,peak));
  const [msg,setMsg]=useState("");
  const [sent,setSent]=useState(false);
  const [items,setItems]=useState("");
  const ti=TRAVELER_TIERS[courier.tier];
  const calc=calcFare(courier.miles,peak);

  return (
    <Modal onClose={onClose}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
        <div style={{fontSize:20,fontWeight:900}}>🛒 Request Grocery Delivery</div>
        <button onClick={onClose} style={{background:"none",border:"none",color:C.muted,fontSize:20,cursor:"pointer"}}>✕</button>
      </div>
      {sent?(
        <div style={{textAlign:"center",padding:"20px 0"}}>
          <div style={{fontSize:44,marginBottom:12}}>✅</div>
          <div style={{fontSize:18,fontWeight:900,marginBottom:6}}>Request sent!</div>
          <div style={{fontSize:13,color:C.muted}}>Waiting for {courier.name} to confirm your order…</div>
        </div>
      ):(
        <>
          {/* Courier info */}
          <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:16}}>
            <div style={{width:44,height:44,borderRadius:"50%",background:ti.gradient,overflow:"hidden",flexShrink:0,boxShadow:`0 2px 10px ${ti.color}44`}}>
              <AvatarTraveler size={44} color={ti.color}/>
            </div>
            <div>
              <div style={{fontSize:15,fontWeight:800}}>{courier.name} <TierBadge tier={courier.tier} type="traveler"/></div>
              <div style={{fontSize:11,color:"#4CAF82",marginTop:2}}>🛒 Shops at {courier.store} · ⏱ {courier.eta}</div>
              <div style={{fontSize:10,color:C.muted,marginTop:2}}>★ {courier.rating} · {courier.deliveries} deliveries · within {courier.radius}</div>
            </div>
          </div>

          {/* Verification badge */}
          <div style={{background:"rgba(76,175,130,0.07)",border:"1px solid rgba(76,175,130,0.2)",borderRadius:10,padding:"7px 12px",marginBottom:14,display:"flex",flexWrap:"wrap",gap:8,alignItems:"center"}}>
            <span style={{fontSize:11,color:"#4CAF82",fontWeight:700}}>✓ Verified Driver</span>
            <span style={{fontSize:10,color:"rgba(240,237,232,0.4)"}}>·</span>
            <span style={{fontSize:11,color:"#60A5FA",fontWeight:700}}>📷 Cams confirmed</span>
            <span style={{fontSize:10,color:"rgba(240,237,232,0.4)"}}>·</span>
            <span style={{fontSize:11,color:"#F7C948",fontWeight:700}}>⭐ {courier.rating} rated</span>
          </div>

          {/* Suggested contribution */}
          <div style={{background:"rgba(76,175,130,0.09)",border:"1.5px solid rgba(76,175,130,0.28)",borderRadius:16,padding:"16px",marginBottom:14,textAlign:"center"}}>
            <div style={{fontSize:11,fontWeight:700,letterSpacing:1,textTransform:"uppercase",color:"#4CAF82",marginBottom:8}}>💰 Suggested Delivery Contribution</div>
            <div style={{fontSize:44,fontWeight:900,color:"#4CAF82",letterSpacing:"-2px"}}>${calc}</div>
            <div style={{fontSize:11,color:C.muted,marginTop:4}}>On My Way takes $0 — agreed directly with {courier.name.split(" ")[0]}</div>
          </div>

          {/* Offer adjuster */}
          <div style={{fontSize:11,fontWeight:700,letterSpacing:1,textTransform:"uppercase",color:C.muted,marginBottom:8}}>Your offer</div>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:6}}>
            <button onClick={()=>setOffer(o=>Math.max(1,parseFloat((o-0.5).toFixed(2))))} style={{width:44,height:44,borderRadius:12,background:C.surface,border:`1px solid ${C.border}`,color:C.text,fontSize:22,cursor:"pointer",fontFamily:"'Syne',sans-serif",flexShrink:0}}>−</button>
            <div style={{flex:1,textAlign:"center"}}>
              <div style={{fontSize:40,fontWeight:900,color:offer>=calc?"#4CAF82":"#F7C948",letterSpacing:"-2px"}}>${offer.toFixed(2)}</div>
              <div style={{fontSize:10,color:C.muted}}>{offer===calc?"Matches suggestion":offer>calc?`$${(offer-calc).toFixed(2)} above`:`$${(calc-offer).toFixed(2)} below`}</div>
            </div>
            <button onClick={()=>setOffer(o=>parseFloat((o+0.5).toFixed(2)))} style={{width:44,height:44,borderRadius:12,background:C.surface,border:`1px solid ${C.border}`,color:C.text,fontSize:22,cursor:"pointer",fontFamily:"'Syne',sans-serif",flexShrink:0}}>+</button>
          </div>
          <div style={{display:"flex",gap:7,marginBottom:14}}>
            {[[`Accept $${calc}`,calc],[`−$2`,parseFloat((calc-2).toFixed(2))],[`+$2`,parseFloat((calc+2).toFixed(2))]].map(([l,v])=>(
              <button key={l} onClick={()=>setOffer(Math.max(1,v))} style={{flex:1,padding:"8px 4px",borderRadius:10,border:`1px solid ${offer===v?"rgba(76,175,130,0.4)":C.border}`,background:offer===v?"rgba(76,175,130,0.12)":C.surface,color:offer===v?"#4CAF82":C.muted,fontSize:10,fontWeight:700,cursor:"pointer",fontFamily:"'Syne',sans-serif"}}>{l}</button>
            ))}
          </div>

          {/* Items list */}
          <div style={{fontSize:11,fontWeight:700,letterSpacing:1,textTransform:"uppercase",color:C.muted,marginBottom:7}}>Grocery list / special instructions</div>
          <textarea value={items} onChange={e=>setItems(e.target.value)} placeholder={"e.g.\n• 2x organic milk\n• sourdough bread\n• no substitutions on dairy"} rows={3}
            style={{width:"100%",padding:"11px 14px",background:C.surface,border:`1.5px solid ${C.border}`,borderRadius:12,color:C.text,fontSize:13,fontFamily:"'Syne',sans-serif",marginBottom:10,outline:"none",resize:"none",boxSizing:"border-box"}}/>
          <textarea value={msg} onChange={e=>setMsg(e.target.value)} placeholder={`Hi ${courier.name.split(" ")[0]}, I'd like a delivery from ${courier.store}…`} rows={2}
            style={{width:"100%",padding:"11px 14px",background:C.surface,border:`1.5px solid ${C.border}`,borderRadius:12,color:C.text,fontSize:13,fontFamily:"'Syne',sans-serif",marginBottom:18,outline:"none",resize:"none",boxSizing:"border-box"}}/>

          <button onClick={()=>{setSent(true);setTimeout(onClose,1800);}} style={{width:"100%",padding:"16px",background:"#4CAF82",border:"none",borderRadius:14,color:"#0A0A0F",fontSize:15,fontWeight:800,cursor:"pointer",fontFamily:"'Syne',sans-serif"}}>
            Send ${offer.toFixed(2)} Delivery Offer →
          </button>
        </>
      )}
    </Modal>
  );
}

// ─── SIDEBAR NAV ──────────────────────────────────────────────────────────────
function SideNav({tab,setTab,isDesktop,accountType,travelerTier,isPeak,onPeak,onReport,locationLabel,isTracking}){
  const ITEMS=[{id:"home",icon:"🏠",label:"Home"},{id:"map",icon:"🗺️",label:"Map"},{id:"news",icon:"📰",label:"News"},{id:"services",icon:"⚡",label:"Services"},{id:"tiers",icon:"🏆",label:"Tiers"}];
  const tierKey=travelerTier;
  const t=TRAVELER_TIERS[tierKey]||PASSENGER_TIERS.rider;
  return (
    <div style={{width:isDesktop?224:68,flexShrink:0,background:"rgba(255,255,255,0.025)",borderRight:`1px solid ${C.border}`,display:"flex",flexDirection:"column",height:"100vh",position:"sticky",top:0,overflowY:"auto"}}>
      <div style={{padding:isDesktop?"22px 20px 18px":"20px 0 18px",textAlign:isDesktop?"left":"center",borderBottom:`1px solid ${C.border}`}}>
        <div style={{fontSize:isDesktop?20:15,fontWeight:900,letterSpacing:"-1px"}}>{isDesktop?<>on<span style={{color:"#FF6B35"}}>my</span>way</>:<span style={{color:"#FF6B35"}}>omw</span>}</div>
        {isDesktop&&(
          <div style={{marginTop:8}}>
            <div style={{display:"flex",alignItems:"center",gap:5,marginBottom:2}}>
              <GPSStatusDot tracking={isTracking}/>
              <span style={{fontSize:10,fontWeight:700,color:isTracking?"#4CAF82":C.muted}}>{isTracking?"Exact GPS":"GPS Off"}</span>
            </div>
            {locationLabel&&<div style={{fontSize:10,color:C.muted,lineHeight:1.4}}>📍 {locationLabel}</div>}
          </div>
        )}
      </div>
      <div style={{flex:1,padding:"12px 8px"}}>
        {ITEMS.map(item=>{
          const active=tab===item.id;
          return (
            <button key={item.id} onClick={()=>setTab(item.id)}
              style={{width:"100%",display:"flex",alignItems:"center",gap:isDesktop?12:0,justifyContent:isDesktop?"flex-start":"center",padding:isDesktop?"11px 14px":"12px 0",borderRadius:12,border:"none",background:active?"rgba(255,107,53,0.12)":"transparent",color:active?"#FF6B35":C.muted,fontWeight:700,fontSize:isDesktop?13:18,cursor:"pointer",fontFamily:"'Syne',sans-serif",marginBottom:4,transition:"background 0.15s",position:"relative"}}
              onMouseEnter={e=>{if(!active)e.currentTarget.style.background="rgba(255,255,255,0.05)";}}
              onMouseLeave={e=>{if(!active)e.currentTarget.style.background="transparent";}}>
              <span>{item.icon}</span>
              {isDesktop&&<span>{item.label}</span>}
              {active&&!isDesktop&&<div style={{position:"absolute",right:0,top:"50%",transform:"translateY(-50%)",width:3,height:20,background:"#FF6B35",borderRadius:"3px 0 0 3px"}}/>}
            </button>
          );
        })}
      </div>
      <div style={{padding:"12px 8px",borderTop:`1px solid ${C.border}`}}>
        <button onClick={onPeak} style={{width:"100%",display:"flex",alignItems:"center",gap:isDesktop?8:0,justifyContent:isDesktop?"flex-start":"center",padding:isDesktop?"9px 14px":"10px 0",borderRadius:12,border:"none",background:isPeak?"rgba(247,201,72,0.1)":"rgba(76,175,130,0.08)",cursor:"pointer",fontFamily:"'Syne',sans-serif",marginBottom:6}}>
          <span style={{fontSize:isDesktop?12:16}}>{isPeak?"🔴":"🟢"}</span>
          {isDesktop&&<span style={{fontSize:11,fontWeight:800,color:isPeak?"#F7C948":"#4CAF82"}}>{isPeak?"PEAK":"STD"} · ${isPeak?"2.50":"1.64"}/mi</span>}
        </button>
        <button onClick={onReport} style={{width:"100%",display:"flex",alignItems:"center",gap:isDesktop?8:0,justifyContent:isDesktop?"flex-start":"center",padding:isDesktop?"9px 14px":"10px 0",borderRadius:12,border:"none",background:"rgba(255,107,53,0.1)",cursor:"pointer",fontFamily:"'Syne',sans-serif",marginBottom:isDesktop?8:0}}>
          <span style={{fontSize:isDesktop?12:16}}>📢</span>
          {isDesktop&&<span style={{fontSize:11,fontWeight:800,color:"#FF6B35"}}>+ Report</span>}
        </button>
        {isDesktop&&(
          <div style={{padding:"10px 14px",background:`${t.color}0D`,border:`1px solid ${t.color}22`,borderRadius:12}}>
            {accountType==="traveler"?<TierBadge tier={tierKey} type="traveler"/>:<TierBadge tier="rider" type="passenger"/>}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── VERIFICATION STEP ───────────────────────────────────────────────────────
function VerificationStep({ accountType, travelerTier, onComplete }) {
  const [form, setForm] = useState({ address:"", city:"", province:"", postal:"", dob:"", idType:"drivers_license", specialRate:"none", abstractUploaded:false, idUploaded:false, abstractDate:"", selfie:false, interiorCam:false, exteriorCam:false, specialRateDoc:false });
  const [section, setSection] = useState("identity"); // identity | documents | background | privacy
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const isTraveler = accountType === "traveler";
  const t = isTraveler ? TRAVELER_TIERS[travelerTier] : PASSENGER_TIERS.rider;

  const sections = isTraveler
    ? ["identity","documents","background","privacy"]
    : ["identity","documents","privacy"];
  const idx = sections.indexOf(section);

  const inputStyle = { width:"100%", padding:"12px 14px", background:"rgba(255,255,255,0.05)", border:"1.5px solid rgba(255,255,255,0.09)", borderRadius:12, color:"#F0EDE8", fontSize:14, fontFamily:"'Syne',sans-serif", outline:"none", boxSizing:"border-box" };
  const labelStyle = { fontSize:10, fontWeight:700, letterSpacing:1.2, textTransform:"uppercase", color:"rgba(240,237,232,0.45)", marginBottom:6, display:"block" };

  const next = () => {
    const ni = sections[idx + 1];
    if (ni) setSection(ni); else { setSubmitting(true); setTimeout(onComplete, 1000); }
  };

  const sectionReady = () => {
    if (section === "identity") return form.address && form.city && form.dob;
    if (section === "documents") return form.idUploaded && (isTraveler ? (form.abstractUploaded && form.interiorCam && form.exteriorCam) : true);
    if (section === "background") return true;
    if (section === "privacy") return agreed;
    return false;
  };

  const SECTION_LABELS = { identity:"Personal Info", documents:"Documents", background:"Background Check", privacy:"Privacy & Consent" };

  return (
    <div className="fadeUp" style={{ maxHeight:"78vh", overflowY:"auto", paddingRight:4 }}>
      {/* Header */}
      <div style={{ marginBottom:20 }}>
        <div style={{ fontSize:22, fontWeight:900, letterSpacing:"-1px", marginBottom:4 }}>🔒 Identity Verification</div>
        <div style={{ fontSize:12, color:"rgba(240,237,232,0.45)", marginBottom:14, lineHeight:1.6 }}>
          Your information is private and never shared publicly. Required by On My Way for platform safety.
        </div>
        {/* Step pills */}
        <div style={{ display:"flex", gap:6 }}>
          {sections.map((s, i) => (
            <div key={s} style={{ flex:1, height:4, borderRadius:3, background: i <= idx ? t.color : "rgba(255,255,255,0.1)", transition:"background 0.3s" }}/>
          ))}
        </div>
        <div style={{ fontSize:10, fontWeight:700, color:t.color, marginTop:7, letterSpacing:1, textTransform:"uppercase" }}>
          Step {idx+1} of {sections.length} · {SECTION_LABELS[section]}
        </div>
      </div>

      {/* IDENTITY SECTION */}
      {section === "identity" && (
        <div>
          <div style={{ background:"rgba(255,107,53,0.06)", border:"1px solid rgba(255,107,53,0.18)", borderRadius:14, padding:"12px 14px", marginBottom:18 }}>
            <div style={{ fontSize:11, fontWeight:800, color:"#FF6B35", marginBottom:3 }}>🔐 Confidential Information</div>
            <div style={{ fontSize:11, color:"rgba(240,237,232,0.5)", lineHeight:1.6 }}>This form collects legally required identity data. It is stored encrypted and <strong style={{color:"#F0EDE8"}}>never displayed publicly</strong>. Accessible only to On My Way administrators and, under strict legal limitations, to law enforcement.</div>
          </div>

          {[["Full Legal Name","name","As shown on government ID","text"],["Date of Birth","dob","YYYY-MM-DD","date"],["Street Address","address","123 Main St","text"],["City","city","Your city","text"],["Province / State","province","e.g. BC, ON, CA","text"],["Postal / ZIP Code","postal","e.g. V3B 1A1","text"]].map(([l,k,ph,type]) => (
            <div key={k} style={{ marginBottom:13 }}>
              <label style={labelStyle}>{l}</label>
              <input type={type} placeholder={ph} value={form[k]||""} onChange={e=>setForm({...form,[k]:e.target.value})} style={inputStyle}/>
            </div>
          ))}

          {/* Special rate eligibility — passengers only */}
          {!isTraveler && (
          <div style={{ marginBottom:18 }}>
            <label style={labelStyle}>Special Rate Eligibility</label>
            <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
              {[{id:"none",label:"None — standard rate",icon:null,col:"rgba(255,255,255,0.3)"},...SPECIAL_RATES.map(r=>({id:r.id,label:`${r.label} — ${r.discount}`,icon:r.icon,col:r.color}))].map(opt => (
                <div key={opt.id} onClick={()=>setForm({...form,specialRate:opt.id})}
                  style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 13px", borderRadius:12, border:`1.5px solid ${form.specialRate===opt.id ? opt.col : "rgba(255,255,255,0.09)"}`, background:form.specialRate===opt.id ? `${opt.col}12` : "rgba(255,255,255,0.03)", cursor:"pointer", transition:"all 0.2s" }}>
                  <div style={{ width:18, height:18, borderRadius:"50%", border:`2px solid ${opt.col}`, background:form.specialRate===opt.id ? opt.col : "transparent", flexShrink:0, transition:"background 0.2s" }}/>
                  {opt.icon && <RateIcon icon={opt.icon} size={24} color={opt.col}/>}
                  <span style={{ fontSize:12, fontWeight:700, color:form.specialRate===opt.id ? opt.col : "rgba(240,237,232,0.5)" }}>{opt.label}</span>
                </div>
              ))}
            </div>
            {form.specialRate !== "none" && <div style={{ fontSize:10, color:"rgba(240,237,232,0.4)", marginTop:7, lineHeight:1.5 }}>⚠️ Supporting documentation (e.g. VAB card, senior ID) will be required on the next step to confirm eligibility.</div>}
          </div>
          )}
        </div>
      )}

      {/* DOCUMENTS SECTION */}
      {section === "documents" && (
        <div>
          <div style={{ background:"rgba(255,107,53,0.06)", border:"1px solid rgba(255,107,53,0.18)", borderRadius:14, padding:"12px 14px", marginBottom:18 }}>
            <div style={{ fontSize:11, fontWeight:800, color:"#FF6B35", marginBottom:3 }}>📄 Document Upload</div>
            <div style={{ fontSize:11, color:"rgba(240,237,232,0.5)", lineHeight:1.6 }}>All uploads are encrypted at rest and in transit. Documents are used <strong style={{color:"#F0EDE8"}}>solely for identity verification</strong> and are never shared or sold.</div>
          </div>

          {/* Government ID */}
          <div style={{ marginBottom:16 }}>
            <label style={labelStyle}>Government-Issued Photo ID</label>
            <div style={{ display:"flex", gap:8, marginBottom:10 }}>
              {[["drivers_license","🪪 Driver's Licence"],["passport","📘 Passport"],["state_id","🪪 State / Provincial ID"]].map(([v,l])=>(
                <button key={v} onClick={()=>setForm({...form,idType:v})} style={{ flex:1, padding:"8px 4px", borderRadius:10, border:`1.5px solid ${form.idType===v ? "#FF6B35" : "rgba(255,255,255,0.09)"}`, background:form.idType===v ? "rgba(255,107,53,0.1)" : "rgba(255,255,255,0.03)", color:form.idType===v ? "#FF6B35" : "rgba(240,237,232,0.4)", fontSize:9, fontWeight:800, cursor:"pointer", fontFamily:"'Syne',sans-serif", textAlign:"center" }}>{l}</button>
              ))}
            </div>
            <div onClick={()=>setForm({...form,idUploaded:true})}
              style={{ border:`2px dashed ${form.idUploaded ? "rgba(76,175,130,0.5)" : "rgba(255,255,255,0.12)"}`, borderRadius:14, padding:"22px 16px", textAlign:"center", cursor:"pointer", background:form.idUploaded ? "rgba(76,175,130,0.07)" : "rgba(255,255,255,0.02)", transition:"all 0.25s" }}>
              {form.idUploaded ? (
                <><div style={{fontSize:28,marginBottom:6}}>✅</div><div style={{fontSize:12,fontWeight:800,color:"#4CAF82"}}>ID uploaded successfully</div><div style={{fontSize:10,color:"rgba(240,237,232,0.4)",marginTop:3}}>Tap to replace</div></>
              ) : (
                <><div style={{fontSize:28,marginBottom:6}}>📷</div><div style={{fontSize:12,fontWeight:700,color:"rgba(240,237,232,0.5)"}}>Tap to upload front + back of ID</div><div style={{fontSize:10,color:"rgba(240,237,232,0.3)",marginTop:3}}>JPG, PNG or PDF · Max 10MB</div></>
              )}
            </div>
          </div>

          {/* Selfie */}
          <div style={{ marginBottom:16 }}>
            <label style={labelStyle}>Live Selfie — Identity Match</label>
            <div onClick={()=>setForm({...form,selfie:true})}
              style={{ border:`2px dashed ${form.selfie ? "rgba(76,175,130,0.5)" : "rgba(255,255,255,0.12)"}`, borderRadius:14, padding:"18px 16px", textAlign:"center", cursor:"pointer", background:form.selfie ? "rgba(76,175,130,0.07)" : "rgba(255,255,255,0.02)", transition:"all 0.25s" }}>
              {form.selfie ? (
                <><div style={{fontSize:24,marginBottom:4}}>✅</div><div style={{fontSize:12,fontWeight:800,color:"#4CAF82"}}>Selfie captured</div></>
              ) : (
                <><div style={{fontSize:24,marginBottom:4}}>🤳</div><div style={{fontSize:12,fontWeight:700,color:"rgba(240,237,232,0.5)"}}>Take a selfie to confirm identity</div></>
              )}
            </div>
          </div>

          {/* Interior + Exterior Camera */}
          <div style={{ marginBottom:16 }}>
            <label style={labelStyle}>Interior & Exterior Dashcam — Required for All Drivers</label>
            <div style={{ background:"rgba(96,165,250,0.07)", border:"1px solid rgba(96,165,250,0.25)", borderRadius:12, padding:"10px 13px", marginBottom:10 }}>
              <div style={{ fontSize:11, fontWeight:800, color:"#60A5FA", marginBottom:3 }}>📷 Camera requirement</div>
              <div style={{ fontSize:11, color:"rgba(240,237,232,0.5)", lineHeight:1.7 }}>
                All drivers must have <strong style={{color:"#F0EDE8"}}>both an interior-facing and an exterior-facing (dashcam) camera</strong> installed and operational in their vehicle at all times while on the platform. This protects all parties in any dispute.
              </div>
            </div>
            <div style={{ display:"flex", gap:8 }}>
              {[{key:"interiorCam",label:"Interior Camera",icon:"📷"},{key:"exteriorCam",label:"Exterior Dashcam",icon:"🎥"}].map(cam=>(
                <div key={cam.key} onClick={()=>setForm({...form,[cam.key]:true})}
                  style={{ flex:1, border:`2px dashed ${form[cam.key] ? "rgba(96,165,250,0.5)" : "rgba(255,255,255,0.12)"}`, borderRadius:14, padding:"16px 10px", textAlign:"center", cursor:"pointer", background:form[cam.key] ? "rgba(96,165,250,0.07)" : "rgba(255,255,255,0.02)", transition:"all 0.25s" }}>
                  {form[cam.key] ? (
                    <><div style={{fontSize:22,marginBottom:4}}>✅</div><div style={{fontSize:11,fontWeight:800,color:"#60A5FA"}}>{cam.label}<br/>confirmed</div></>
                  ) : (
                    <><div style={{fontSize:22,marginBottom:4}}>{cam.icon}</div><div style={{fontSize:11,fontWeight:700,color:"rgba(240,237,232,0.5)"}}>Confirm {cam.label}</div><div style={{fontSize:9,color:"rgba(240,237,232,0.3)",marginTop:3}}>Tap to confirm installed</div></>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Traveler-only: Driver's Abstract */}
          {isTraveler && (
            <div style={{ marginBottom:16 }}>
              <label style={labelStyle}>Driver's Abstract — Required for Travelers</label>
              <div style={{ background:"rgba(247,201,72,0.07)", border:"1px solid rgba(247,201,72,0.25)", borderRadius:12, padding:"10px 13px", marginBottom:10 }}>
                <div style={{ fontSize:11, fontWeight:800, color:"#F7C948", marginBottom:3 }}>⚠️ Traveler Requirements</div>
                <div style={{ fontSize:11, color:"rgba(240,237,232,0.5)", lineHeight:1.7 }}>
                  Abstract must be <strong style={{color:"#F0EDE8"}}>dated within the last 30 days</strong>.<br/>
                  The following will result in <strong style={{color:"#FF6B35"}}>automatic decline</strong>:
                </div>
                <div style={{ marginTop:8 }}>
                  {["Violent felony convictions","Drug-related traffic offences or violations","Alcohol-related traffic violations (DUI, DWI, impaired driving)","Any combination of the above within the past 7 years"].map(r=>(
                    <div key={r} style={{ display:"flex", gap:7, marginBottom:4 }}><span style={{color:"#FF6B35",fontSize:11,flexShrink:0}}>✗</span><span style={{fontSize:11,color:"rgba(240,237,232,0.5)"}}>{r}</span></div>
                  ))}
                </div>
                <div style={{ marginTop:10, paddingTop:10, borderTop:"1px solid rgba(255,255,255,0.07)" }}>
                  <div style={{ fontSize:11, color:"rgba(240,237,232,0.5)", lineHeight:1.7 }}>
                    Also required for <strong style={{color:"#F0EDE8"}}>all services</strong> (Ride Share, Grocery & Food):
                  </div>
                  <div style={{ marginTop:6 }}>
                    {[
                      { icon:"📷", text:"Interior-facing camera installed & operational at all times" },
                      { icon:"🎥", text:"Exterior dashcam installed & operational at all times" },
                      { icon:"⭐", text:"Minimum 3.5-star driver rating — falls below = account review & suspension" },
                    ].map(r=>(
                      <div key={r.text} style={{ display:"flex", gap:7, marginBottom:4 }}>
                        <span style={{fontSize:11,flexShrink:0}}>{r.icon}</span>
                        <span style={{fontSize:11,color:"rgba(240,237,232,0.5)"}}>{r.text}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div style={{ marginBottom:10 }}>
                <label style={labelStyle}>Abstract Issue Date</label>
                <input type="date" value={form.abstractDate} onChange={e=>setForm({...form,abstractDate:e.target.value})} style={inputStyle}/>
              </div>
              <div onClick={()=>setForm({...form,abstractUploaded:true})}
                style={{ border:`2px dashed ${form.abstractUploaded ? "rgba(76,175,130,0.5)" : "rgba(255,255,255,0.12)"}`, borderRadius:14, padding:"20px 16px", textAlign:"center", cursor:"pointer", background:form.abstractUploaded ? "rgba(76,175,130,0.07)" : "rgba(255,255,255,0.02)", transition:"all 0.25s" }}>
                {form.abstractUploaded ? (
                  <><div style={{fontSize:26,marginBottom:6}}>✅</div><div style={{fontSize:12,fontWeight:800,color:"#4CAF82"}}>Driver's Abstract uploaded</div><div style={{fontSize:10,color:"rgba(240,237,232,0.4)",marginTop:3}}>Tap to replace</div></>
                ) : (
                  <><div style={{fontSize:26,marginBottom:6}}>📋</div><div style={{fontSize:12,fontWeight:700,color:"rgba(240,237,232,0.5)"}}>Upload official Driver's Abstract</div><div style={{fontSize:10,color:"rgba(240,237,232,0.3)",marginTop:3}}>From your provincial / state licensing authority · Max 10MB</div></>
                )}
              </div>
            </div>
          )}

          {/* Special rate docs */}
          {form.specialRate !== "none" && (
            <div style={{ marginBottom:16 }}>
              <label style={labelStyle}>{form.specialRate==="vet"?"Veterans Disability Documentation":"Senior Eligibility Document (65+)"}</label>
              <div onClick={()=>setForm({...form,specialRateDoc:true})}
                style={{ border:`2px dashed ${form.specialRateDoc ? "rgba(96,165,250,0.5)" : "rgba(255,255,255,0.12)"}`, borderRadius:14, padding:"18px 16px", textAlign:"center", cursor:"pointer", background:form.specialRateDoc ? "rgba(96,165,250,0.07)" : "rgba(255,255,255,0.02)", transition:"all 0.25s" }}>
                {form.specialRateDoc ? (
                  <><div style={{fontSize:24,marginBottom:4}}>✅</div><div style={{fontSize:12,fontWeight:800,color:"#60A5FA"}}>Document uploaded</div></>
                ) : (
                  <><div style={{marginBottom:8,display:"flex",justifyContent:"center"}}><RateIcon icon={form.specialRate} size={44} color={form.specialRate==="vet"?"#A78BFA":"#60A5FA"}/></div><div style={{fontSize:12,fontWeight:700,color:"rgba(240,237,232,0.5)"}}>{form.specialRate==="vet"?"Upload VA / VAB Card or Disability Certificate":"Upload government-issued senior ID or birth certificate"}</div></>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* BACKGROUND CHECK SECTION — travelers only */}
      {section === "background" && isTraveler && (
        <div>
          <div style={{ background:"rgba(255,107,53,0.06)", border:"1px solid rgba(255,107,53,0.18)", borderRadius:14, padding:"14px", marginBottom:18 }}>
            <div style={{ fontSize:13, fontWeight:900, color:"#FF6B35", marginBottom:6 }}>🔎 Background Eligibility Declaration</div>
            <div style={{ fontSize:12, color:"rgba(240,237,232,0.5)", lineHeight:1.7 }}>To protect the safety of all passengers, On My Way conducts background screening. By continuing you confirm the following are true to the best of your knowledge:</div>
          </div>
          {[
            { icon:"⚖️", title:"No violent felony convictions", desc:"I have no convictions for violent felonies at any time in any jurisdiction." },
            { icon:"🍺", title:"No alcohol-related traffic offences", desc:"I have no DUI, DWI, impaired driving, or related convictions on my driving record." },
            { icon:"💊", title:"No drug-related traffic offences", desc:"I have no drug-impaired driving or related convictions on my driving record." },
            { icon:"🚗", title:"Valid driver's licence in good standing", desc:"My licence is current, valid, and not suspended or revoked." },
            { icon:"📋", title:"Abstract is accurate and recent", desc:"The driver's abstract I uploaded is genuine, unaltered, and issued within the past 30 days." },
            { icon:"📷", title:"Interior & exterior cameras installed", desc:"My vehicle has a functioning interior-facing camera and an exterior dashcam, both operational whenever I am active on the platform." },
            { icon:"⭐", title:"I understand the minimum 3.5-star rating requirement", desc:"I acknowledge that my account will be suspended if my driver rating falls below 3.5 stars and remains there after a review period." },
          ].map((item, i) => (
            <div key={i} style={{ display:"flex", gap:12, padding:"14px", border:"1px solid rgba(255,255,255,0.07)", borderRadius:14, marginBottom:10, background:"rgba(255,255,255,0.02)" }}>
              <div style={{ fontSize:22, flexShrink:0 }}>{item.icon}</div>
              <div>
                <div style={{ fontSize:13, fontWeight:800, marginBottom:3 }}>{item.title}</div>
                <div style={{ fontSize:11, color:"rgba(240,237,232,0.45)", lineHeight:1.6 }}>{item.desc}</div>
              </div>
              <div style={{ marginLeft:"auto", flexShrink:0 }}>
                <div style={{ width:20, height:20, borderRadius:"50%", background:"rgba(76,175,130,0.15)", border:"2px solid rgba(76,175,130,0.4)", display:"flex", alignItems:"center", justifyContent:"center" }}>
                  <span style={{fontSize:10,color:"#4CAF82",fontWeight:900}}>✓</span>
                </div>
              </div>
            </div>
          ))}
          <div style={{ background:"rgba(247,201,72,0.07)", border:"1px solid rgba(247,201,72,0.22)", borderRadius:12, padding:"11px 13px", marginTop:6 }}>
            <div style={{ fontSize:11, color:"rgba(240,237,232,0.5)", lineHeight:1.6 }}>⚠️ Providing false declarations is grounds for <strong style={{color:"#F0EDE8"}}>immediate account termination</strong> and may result in legal action. On My Way reserves the right to conduct third-party background checks at any time.</div>
          </div>
        </div>
      )}

      {/* PRIVACY & CONSENT SECTION */}
      {section === "privacy" && (
        <div>
          <div style={{ background:"rgba(255,107,53,0.06)", border:"1px solid rgba(255,107,53,0.2)", borderRadius:16, padding:"18px", marginBottom:18 }}>
            <div style={{ fontSize:15, fontWeight:900, color:"#FF6B35", marginBottom:12 }}>🔒 Privacy & Data Use Policy</div>

            <div style={{ marginBottom:14 }}>
              <div style={{ fontSize:12, fontWeight:800, color:"#F0EDE8", marginBottom:6 }}>What we collect</div>
              <div style={{ fontSize:11, color:"rgba(240,237,232,0.55)", lineHeight:1.7 }}>Legal name, date of birth, address, phone number, government ID, and (for travelers) driver's abstract. This information is stored in encrypted form on secure servers and is <strong style={{color:"#F0EDE8"}}>never made visible on your public profile</strong>.</div>
            </div>

            <div style={{ marginBottom:14 }}>
              <div style={{ fontSize:12, fontWeight:800, color:"#F0EDE8", marginBottom:6 }}>Who can access your private data</div>
              {[
                { icon:"🏢", who:"On My Way administrators", when:"For account management, verification, and safety purposes only.", col:"#FF6B35" },
                { icon:"⚖️", who:"Law enforcement — by warrant only", when:"We require a valid court order or warrant before disclosing any personal data to law enforcement, except in the circumstances listed below.", col:"#F7C948" },
                { icon:"🆘", who:"Emergency exceptions (no warrant required)", when:"We may disclose the minimum necessary information without a warrant ONLY in cases of: (1) immediate life endangerment, (2) child endangerment, or (3) active sex trafficking investigations where delay would cause irreversible harm.", col:"#60A5FA" },
                { icon:"👤", who:"You — on request", when:"You may request a full export of your personal data or deletion of your account at any time through the app settings.", col:"#4CAF82" },
              ].map(item => (
                <div key={item.who} style={{ display:"flex", gap:10, padding:"10px 12px", borderRadius:12, marginBottom:8, background:"rgba(255,255,255,0.03)", border:`1px solid ${item.col}1A` }}>
                  <span style={{fontSize:16, flexShrink:0}}>{item.icon}</span>
                  <div>
                    <div style={{ fontSize:11, fontWeight:800, color:item.col, marginBottom:2 }}>{item.who}</div>
                    <div style={{ fontSize:11, color:"rgba(240,237,232,0.45)", lineHeight:1.6 }}>{item.when}</div>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ marginBottom:14 }}>
              <div style={{ fontSize:12, fontWeight:800, color:"#F0EDE8", marginBottom:6 }}>We will never</div>
              {["Sell your personal data to any third party","Share your information with advertisers","Display your private info (address, ID, DOB) publicly","Use your location data beyond active GPS features"].map(n=>(
                <div key={n} style={{ display:"flex", gap:7, marginBottom:4 }}>
                  <span style={{color:"#FF6B35",fontSize:11,flexShrink:0}}>✗</span>
                  <span style={{fontSize:11,color:"rgba(240,237,232,0.5)"}}>{n}</span>
                </div>
              ))}
            </div>

            <div style={{ background:"rgba(76,175,130,0.08)", border:"1px solid rgba(76,175,130,0.2)", borderRadius:12, padding:"10px 12px" }}>
              <div style={{ fontSize:11, color:"rgba(240,237,232,0.5)", lineHeight:1.6 }}>By creating an account you agree to this data policy. You may withdraw consent and delete your account at any time — deletion requests are processed within 30 days.</div>
            </div>
          </div>

          <div onClick={()=>setAgreed(!agreed)}
            style={{ display:"flex", alignItems:"flex-start", gap:12, padding:"14px 14px", border:`1.5px solid ${agreed ? "rgba(76,175,130,0.5)" : "rgba(255,255,255,0.12)"}`, borderRadius:14, cursor:"pointer", background:agreed ? "rgba(76,175,130,0.07)" : "rgba(255,255,255,0.02)", transition:"all 0.2s", marginBottom:8 }}>
            <div style={{ width:22, height:22, borderRadius:6, border:`2px solid ${agreed ? "#4CAF82" : "rgba(255,255,255,0.25)"}`, background:agreed ? "#4CAF82" : "transparent", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, transition:"all 0.2s" }}>
              {agreed && <span style={{fontSize:13,color:"#0A0A0F",fontWeight:900}}>✓</span>}
            </div>
            <div style={{ fontSize:12, color:"rgba(240,237,232,0.7)", lineHeight:1.6 }}>I have read and agree to the On My Way Privacy & Data Use Policy. I understand how my personal information is collected, stored, and may be disclosed.</div>
          </div>
        </div>
      )}

      {/* Navigation */}
      <div style={{ display:"flex", gap:10, marginTop:16, paddingBottom:8 }}>
        {idx > 0 && (
          <button onClick={()=>setSection(sections[idx-1])} style={{ padding:"13px 20px", background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:12, color:"rgba(240,237,232,0.6)", fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:"'Syne',sans-serif" }}>← Back</button>
        )}
        <button onClick={next} disabled={!sectionReady()||submitting}
          style={{ flex:1, padding:"14px", background:sectionReady()&&!submitting?"#FF6B35":"rgba(255,255,255,0.06)", border:"none", borderRadius:12, color:sectionReady()&&!submitting?"#0A0A0F":"rgba(240,237,232,0.3)", fontSize:14, fontWeight:800, cursor:sectionReady()&&!submitting?"pointer":"default", fontFamily:"'Syne',sans-serif", transition:"all 0.2s" }}>
          {submitting ? "Submitting…" : idx < sections.length - 1 ? `Continue →` : "Submit & Create Account →"}
        </button>
      </div>
    </div>
  );
}

// ─── DYNAMIC LANDING PAGE ────────────────────────────────────────────────────
function useScrollReveal() {
  const [visible, setVisible] = useState({});
  useEffect(() => {
    const obs = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) setVisible(p => ({ ...p, [e.target.dataset.reveal]: true })); });
    }, { threshold: 0.15 });
    document.querySelectorAll("[data-reveal]").forEach(el => obs.observe(el));
    return () => obs.disconnect();
  }, []);
  return visible;
}

function ParticleCanvas() {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let W = canvas.width = canvas.offsetWidth;
    let H = canvas.height = canvas.offsetHeight;
    const resize = () => { W = canvas.width = canvas.offsetWidth; H = canvas.height = canvas.offsetHeight; };
    window.addEventListener("resize", resize);
    const N = 55;
    const pts = Array.from({ length: N }, () => ({
      x: Math.random() * W, y: Math.random() * H,
      vx: (Math.random() - 0.5) * 0.35, vy: (Math.random() - 0.5) * 0.35,
      r: Math.random() * 2 + 1, pulse: Math.random() * Math.PI * 2,
    }));
    // A few "cars" that move faster
    const cars = Array.from({ length: 4 }, () => ({
      x: Math.random() * W, y: Math.random() * H,
      vx: (Math.random() - 0.5) * 1.2, vy: (Math.random() - 0.5) * 1.2,
      trail: [],
    }));
    let frame = 0;
    let raf;
    const draw = () => {
      ctx.clearRect(0, 0, W, H);
      frame++;
      // connections
      for (let i = 0; i < N; i++) {
        for (let j = i + 1; j < N; j++) {
          const dx = pts[i].x - pts[j].x, dy = pts[i].y - pts[j].y;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < 110) {
            ctx.beginPath();
            ctx.strokeStyle = `rgba(255,107,53,${(1 - d / 110) * 0.12})`;
            ctx.lineWidth = 0.8;
            ctx.moveTo(pts[i].x, pts[i].y);
            ctx.lineTo(pts[j].x, pts[j].y);
            ctx.stroke();
          }
        }
      }
      // car trails
      cars.forEach(car => {
        car.trail.push({ x: car.x, y: car.y });
        if (car.trail.length > 18) car.trail.shift();
        car.trail.forEach((p, i) => {
          ctx.beginPath();
          ctx.arc(p.x, p.y, 1.5, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(255,107,53,${(i / car.trail.length) * 0.35})`;
          ctx.fill();
        });
        ctx.beginPath();
        ctx.arc(car.x, car.y, 4, 0, Math.PI * 2);
        ctx.fillStyle = "#FF6B35";
        ctx.shadowBlur = 10;
        ctx.shadowColor = "#FF6B35";
        ctx.fill();
        ctx.shadowBlur = 0;
        car.x += car.vx; car.y += car.vy;
        if (car.x < 0 || car.x > W) car.vx *= -1;
        if (car.y < 0 || car.y > H) car.vy *= -1;
      });
      // dots
      pts.forEach(p => {
        p.pulse += 0.02;
        const alpha = 0.25 + Math.sin(p.pulse) * 0.15;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${alpha})`;
        ctx.fill();
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0 || p.x > W) p.vx *= -1;
        if (p.y < 0 || p.y > H) p.vy *= -1;
      });
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); };
  }, []);
  return <canvas ref={canvasRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0.7 }} />;
}

function AnimatedCounter({ target, suffix = "", duration = 1800 }) {
  const [val, setVal] = useState(0);
  const ref = useRef(null);
  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      obs.disconnect();
      const start = performance.now();
      const tick = now => {
        const t = Math.min((now - start) / duration, 1);
        const ease = 1 - Math.pow(1 - t, 3);
        setVal(Math.round(ease * target));
        if (t < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }, { threshold: 0.5 });
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, [target, duration]);
  return <span ref={ref}>{val.toLocaleString()}{suffix}</span>;
}

function FareCalculator({ isMobile }) {
  const [miles, setMiles] = useState(8);
  const [peak, setPeak] = useState(false);
  const fare = calcFare(miles, peak);
  return (
    <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 20, padding: isMobile ? "20px" : "24px", backdropFilter: "blur(12px)" }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", color: "rgba(240,237,232,0.45)", marginBottom: 14 }}>⚡ Live Contribution Estimator</div>
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
          <span style={{ fontSize: 13, color: "rgba(240,237,232,0.6)" }}>Distance</span>
          <span style={{ fontSize: 13, fontWeight: 800, color: "#FF6B35" }}>{miles} miles</span>
        </div>
        <input type="range" min={1} max={40} value={miles} onChange={e => setMiles(+e.target.value)}
          style={{ width: "100%", accentColor: "#FF6B35", height: 4, cursor: "pointer" }} />
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
          <span style={{ fontSize: 10, color: "rgba(240,237,232,0.3)" }}>1 mi</span>
          <span style={{ fontSize: 10, color: "rgba(240,237,232,0.3)" }}>40 mi</span>
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
        {[false, true].map(p => (
          <button key={String(p)} onClick={() => setPeak(p)} style={{ flex: 1, padding: "9px 0", borderRadius: 12, border: `1.5px solid ${peak === p ? (p ? "rgba(247,201,72,0.6)" : "rgba(76,175,130,0.6)") : "rgba(255,255,255,0.1)"}`, background: peak === p ? (p ? "rgba(247,201,72,0.12)" : "rgba(76,175,130,0.12)") : "transparent", color: peak === p ? (p ? "#F7C948" : "#4CAF82") : "rgba(240,237,232,0.4)", fontSize: 11, fontWeight: 800, cursor: "pointer", fontFamily: "'Syne',sans-serif", transition: "all 0.2s" }}>
            {p ? "🔴 Peak hours" : "🟢 Standard"}
          </button>
        ))}
      </div>
      <div style={{ background: "linear-gradient(135deg,rgba(76,175,130,0.12),rgba(76,175,130,0.04))", border: "1.5px solid rgba(76,175,130,0.3)", borderRadius: 16, padding: "18px", textAlign: "center" }}>
        <div style={{ fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: "#4CAF82", marginBottom: 6 }}>Suggested contribution per passenger</div>
        <div style={{ fontSize: isMobile ? 44 : 52, fontWeight: 900, color: "#4CAF82", letterSpacing: "-3px", transition: "all 0.3s" }}>${fare}</div>
        <div style={{ fontSize: 11, color: "rgba(240,237,232,0.4)", marginTop: 4 }}>At ${peak ? "2.50" : "1.64"}/mi · negotiable · On My Way takes $0</div>
      </div>
    </div>
  );
}

function LandingPage({ bp, onSignup, onSignin }) {
  const [mouseX, setMouseX] = useState(0);
  const [mouseY, setMouseY] = useState(0);
  const [typeIdx, setTypeIdx] = useState(0);
  const [typeChar, setTypeChar] = useState(0);
  const [typing, setTyping] = useState(true);
  const [activeRole, setActiveRole] = useState("passenger");
  const [navScrolled, setNavScrolled] = useState(false);
  const visible = useScrollReveal();
  const PHRASES = ["Bring someone.", "Split the cost.", "Make it easy.", "Go together."];

  // Typewriter
  useEffect(() => {
    const phrase = PHRASES[typeIdx];
    if (typing) {
      if (typeChar < phrase.length) {
        const t = setTimeout(() => setTypeChar(c => c + 1), 60);
        return () => clearTimeout(t);
      } else {
        const t = setTimeout(() => setTyping(false), 1800);
        return () => clearTimeout(t);
      }
    } else {
      if (typeChar > 0) {
        const t = setTimeout(() => setTypeChar(c => c - 1), 35);
        return () => clearTimeout(t);
      } else {
        setTypeIdx(i => (i + 1) % PHRASES.length);
        setTyping(true);
      }
    }
  }, [typeChar, typing, typeIdx]);

  // Mouse parallax
  useEffect(() => {
    const h = e => { setMouseX((e.clientX / window.innerWidth - 0.5) * 30); setMouseY((e.clientY / window.innerHeight - 0.5) * 20); };
    window.addEventListener("mousemove", h);
    return () => window.removeEventListener("mousemove", h);
  }, []);

  // Scroll nav
  useEffect(() => {
    const h = () => setNavScrolled(window.scrollY > 40);
    window.addEventListener("scroll", h);
    return () => window.removeEventListener("scroll", h);
  }, []);

  const revealStyle = (key, delay = 0) => ({
    opacity: visible[key] ? 1 : 0,
    transform: visible[key] ? "translateY(0)" : "translateY(32px)",
    transition: `opacity 0.7s ${delay}s cubic-bezier(0.16,1,0.3,1), transform 0.7s ${delay}s cubic-bezier(0.16,1,0.3,1)`,
  });

  const STEPS = [
    { n: "01", icon: "🙋", title: "Sign up", desc: "Choose passenger or traveler. Pick your plan. Takes 60 seconds." },
    { n: "02", icon: "📡", title: "Connect", desc: "Travelers broadcast live GPS routes. Passengers browse what's nearby." },
    { n: "03", icon: "💬", title: "Negotiate", desc: "Message directly. Counter-offer the contribution. No middleman involved." },
    { n: "04", icon: "🚗", title: "Ride & earn", desc: "Traveler keeps 100% of the agreed contribution. On My Way keeps $0." },
  ];

  const FEATURES = [
    { icon: "📍", title: "Exact GPS", desc: "Pinpoint real-time location — no approximations, no delays.", color: "#FF6B35" },
    { icon: "💰", title: "Zero platform fees", desc: "Contributions go directly from passenger to traveler. We take nothing.", color: "#4CAF82" },
    { icon: "🔒", title: "Verified profiles", desc: "Tier badges and ratings build trust on every single ride.", color: "#F7C948" },
    { icon: "🌍", title: "Works globally", desc: "GPS-based, location-agnostic. Works anywhere in the world.", color: "#A78BFA" },
    { icon: "⚡", title: "Auto contribution calc", desc: "Distance × rate = instant suggestion. No manual guessing.", color: "#60A5FA" },
    { icon: "🛒", title: "Beyond rides", desc: "Grocery pickup and food delivery built right in.", color: "#F472B6" },
  ];

  const LS = `
    *{margin:0;padding:0;box-sizing:border-box}
    @keyframes gpsPulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:0.4;transform:scale(0.85)}}
    @keyframes float{0%,100%{transform:translateY(0px)}50%{transform:translateY(-10px)}}
    @keyframes shimmer{0%{background-position:-200% center}100%{background-position:200% center}}
    @keyframes borderPulse{0%,100%{border-color:rgba(255,107,53,0.3)}50%{border-color:rgba(255,107,53,0.7)}}
    @keyframes slideInLeft{from{opacity:0;transform:translateX(-40px)}to{opacity:1;transform:translateX(0)}}
    @keyframes slideInRight{from{opacity:0;transform:translateX(40px)}to{opacity:1;transform:translateX(0)}}
    @keyframes heroFadeUp{from{opacity:0;transform:translateY(30px)}to{opacity:1;transform:translateY(0)}}
    .hero-badge{animation:heroFadeUp 0.7s 0.1s both cubic-bezier(0.16,1,0.3,1)}
    .hero-h1{animation:heroFadeUp 0.9s 0.25s both cubic-bezier(0.16,1,0.3,1)}
    .hero-sub{animation:heroFadeUp 0.9s 0.45s both cubic-bezier(0.16,1,0.3,1)}
    .hero-ctas{animation:heroFadeUp 0.9s 0.6s both cubic-bezier(0.16,1,0.3,1)}
    .hero-stats{animation:heroFadeUp 0.9s 0.75s both cubic-bezier(0.16,1,0.3,1)}
    .hero-right{animation:slideInRight 1s 0.4s both cubic-bezier(0.16,1,0.3,1)}
    .feature-card{transition:transform 0.3s cubic-bezier(0.16,1,0.3,1),border-color 0.3s,box-shadow 0.3s}
    .feature-card:hover{transform:translateY(-6px) scale(1.02)!important;box-shadow:0 20px 60px rgba(0,0,0,0.4)!important}
    .step-card{transition:transform 0.3s,border-color 0.3s,background 0.3s}
    .step-card:hover{transform:translateY(-4px);border-color:rgba(255,107,53,0.4)!important;background:rgba(255,107,53,0.05)!important}
    .cta-primary{transition:transform 0.2s,box-shadow 0.2s,background 0.2s}
    .cta-primary:hover{transform:translateY(-2px) scale(1.02);box-shadow:0 12px 40px rgba(255,107,53,0.45)!important}
    .cta-secondary{transition:transform 0.2s,border-color 0.2s,color 0.2s}
    .cta-secondary:hover{transform:translateY(-2px);border-color:rgba(255,255,255,0.3)!important;color:#F0EDE8!important}
    .nav-link{transition:color 0.15s}
    .nav-link:hover{color:#F0EDE8!important}
    .role-pill{transition:all 0.25s cubic-bezier(0.16,1,0.3,1)}
    input[type=range]{-webkit-appearance:none;appearance:none;background:rgba(255,255,255,0.1);border-radius:4px;outline:none}
    input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:18px;height:18px;border-radius:50%;background:#FF6B35;cursor:pointer;box-shadow:0 0 10px rgba(255,107,53,0.5)}
    ::-webkit-scrollbar{width:4px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.1);border-radius:4px}
  `;

  return (
    <>
      <link href="https://fonts.googleapis.com/css2?family=Syne:wght@400;700;800;900&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet"/>
      <style>{LS}</style>
      <div style={{ fontFamily: "'Syne',sans-serif", background: "#080810", color: "#F0EDE8", overflowX: "hidden" }}>

        {/* ── STICKY NAV ── */}
        <nav style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 100, padding: "0 clamp(20px,5vw,60px)", height: 64, display: "flex", alignItems: "center", justifyContent: "space-between", background: navScrolled ? "rgba(8,8,16,0.92)" : "transparent", backdropFilter: navScrolled ? "blur(20px)" : "none", borderBottom: navScrolled ? "1px solid rgba(255,255,255,0.07)" : "1px solid transparent", transition: "all 0.4s" }}>
          <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: "-1px" }}>on<span style={{ color: "#FF6B35" }}>my</span>way</div>
          <div style={{ display: "flex", alignItems: "center", gap: 32 }}>
            {!bp.isMobile && ["How it Works", "Pricing", "For Travelers"].map(l => (
              <span key={l} className="nav-link" style={{ fontSize: 13, color: "rgba(240,237,232,0.5)", cursor: "pointer", fontWeight: 600 }}>{l}</span>
            ))}
            <div style={{ display: "flex", gap: 10 }}>
              <button className="cta-secondary" onClick={onSignin} style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 20, color: "rgba(240,237,232,0.6)", padding: "8px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "'Syne',sans-serif" }}>Sign In</button>
              <button className="cta-primary" onClick={onSignup} style={{ background: "#FF6B35", border: "none", borderRadius: 20, color: "#0A0A0F", padding: "8px 20px", fontSize: 13, fontWeight: 800, cursor: "pointer", fontFamily: "'Syne',sans-serif" }}>Get Started</button>
            </div>
          </div>
        </nav>

        {/* ── HERO ── */}
        <section style={{ position: "relative", minHeight: "100vh", display: "flex", alignItems: "center", overflow: "hidden", paddingTop: 64 }}>
          {/* Canvas background */}
          <div style={{ position: "absolute", inset: 0 }}><ParticleCanvas /></div>
          {/* Gradient orbs */}
          <div style={{ position: "absolute", width: 600, height: 600, borderRadius: "50%", background: "radial-gradient(circle,rgba(255,107,53,0.13),transparent 65%)", top: -100, right: -100, pointerEvents: "none", transform: `translate(${mouseX * 0.5}px,${mouseY * 0.4}px)`, transition: "transform 0.1s" }} />
          <div style={{ position: "absolute", width: 400, height: 400, borderRadius: "50%", background: "radial-gradient(circle,rgba(76,175,130,0.08),transparent 65%)", bottom: 50, left: -80, pointerEvents: "none", transform: `translate(${-mouseX * 0.3}px,${-mouseY * 0.2}px)`, transition: "transform 0.1s" }} />
          <div style={{ position: "absolute", width: 300, height: 300, borderRadius: "50%", background: "radial-gradient(circle,rgba(167,139,250,0.07),transparent 65%)", top: "30%", left: "30%", pointerEvents: "none", transform: `translate(${mouseX * 0.2}px,${mouseY * 0.15}px)`, transition: "transform 0.1s" }} />

          <div style={{ position: "relative", zIndex: 2, width: "100%", maxWidth: 1200, margin: "0 auto", padding: "60px clamp(20px,5vw,60px) 80px", display: bp.isDesktop ? "grid" : "block", gridTemplateColumns: "1fr 1fr", gap: 80, alignItems: "center" }}>
            {/* Left */}
            <div>
              <div className="hero-badge" style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(255,107,53,0.1)", border: "1px solid rgba(255,107,53,0.3)", borderRadius: 30, padding: "6px 14px", marginBottom: 28, animation: "borderPulse 2.5s infinite" }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#4CAF82", animation: "gpsPulse 1.5s infinite" }} />
                <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", color: "#FF6B35" }}>Live · Peer-to-Peer · $0 Platform Fee</span>
              </div>
              <h1 className="hero-h1" style={{ fontSize: bp.isMobile ? 42 : bp.isTablet ? 50 : 66, fontWeight: 900, lineHeight: 1.0, letterSpacing: "-3px", marginBottom: 24 }}>
                Going somewhere?<br />
                <span style={{ color: "#FF6B35", display: "inline-block", minWidth: bp.isMobile ? 220 : 380 }}>
                  {PHRASES[typeIdx].slice(0, typeChar)}
                  <span style={{ display: "inline-block", width: 3, height: bp.isMobile ? "0.85em" : "1em", background: "#FF6B35", marginLeft: 2, animation: "gpsPulse 0.8s infinite", verticalAlign: "text-bottom" }} />
                </span>
              </h1>
              <p className="hero-sub" style={{ fontSize: bp.isMobile ? 15 : 17, color: "rgba(240,237,232,0.55)", lineHeight: 1.8, marginBottom: 32, maxWidth: 480 }}>
                Passengers pay $8/mo. Travelers pay their own tier subscription and keep 100% of every contribution — <strong style={{ color: "#F0EDE8" }}>On My Way takes $0.</strong>
              </p>

              {/* Role toggle */}
              <div className="hero-sub" style={{ marginBottom: 28 }}>
                <div style={{ display: "flex", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 14, padding: 4, marginBottom: 16, maxWidth: 340 }}>
                  {[["passenger", "I need a ride", "#4CAF82"], ["traveler", "🚗 I'm a traveler", "#FF6B35"]].map(([r, l, col]) => (
                    <button key={r} className="role-pill" onClick={() => setActiveRole(r)} style={{ flex: 1, padding: "10px 8px", borderRadius: 11, border: "none", background: activeRole === r ? col : "transparent", color: activeRole === r ? "#0A0A0F" : "rgba(240,237,232,0.5)", fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: "'Syne',sans-serif" }}>{l}</button>
                  ))}
                </div>
                <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 14, padding: "14px 16px", maxWidth: 340, transition: "all 0.3s" }}>
                  {activeRole === "passenger" ? (
                    <div style={{ animation: "heroFadeUp 0.4s both" }}>
                      <div style={{ fontSize: 13, fontWeight: 800, color: "#4CAF82", marginBottom: 6 }}>Passenger plan — $8/mo</div>
                      <div style={{ fontSize: 12, color: "rgba(240,237,232,0.5)", lineHeight: 1.6 }}>Unlimited ride requests · Direct contribution negotiation · Live GPS tracking</div>
                    </div>
                  ) : (
                    <div style={{ animation: "heroFadeUp 0.4s both" }}>
                      <div style={{ fontSize: 13, fontWeight: 800, color: "#FF6B35", marginBottom: 6 }}>🚗 Traveler plans — $50 / $100 / $200/mo</div>
                      <div style={{ fontSize: 12, color: "rgba(240,237,232,0.5)", lineHeight: 1.6 }}>50 · 100 · Unlimited trips · 100% of contribution is yours</div>
                    </div>
                  )}
                </div>
              </div>

              <div className="hero-ctas" style={{ display: "flex", gap: 12, marginBottom: 40, flexWrap: "wrap" }}>
                <button className="cta-primary" onClick={onSignup} style={{ padding: "16px 32px", background: "#FF6B35", border: "none", borderRadius: 14, color: "#0A0A0F", fontSize: 15, fontWeight: 800, cursor: "pointer", fontFamily: "'Syne',sans-serif", boxShadow: "0 8px 32px rgba(255,107,53,0.3)" }}>
                  Get Started Free →
                </button>
                <button className="cta-secondary" onClick={onSignin} style={{ padding: "16px 28px", background: "transparent", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 14, color: "rgba(240,237,232,0.6)", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "'Syne',sans-serif" }}>
                  Sign In
                </button>
              </div>

              <div className="hero-stats" style={{ display: "flex", gap: 0, borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 24 }}>
                {[["12", "K+", "Members"], ["0", "", "Platform fee"], ["4.9", "★", "Avg rating"]].map(([n, s, l], i) => (
                  <div key={l} style={{ flex: 1, paddingRight: 24, borderRight: i < 2 ? "1px solid rgba(255,255,255,0.08)" : "none", paddingLeft: i > 0 ? 24 : 0 }}>
                    <div style={{ fontSize: bp.isMobile ? 20 : 26, fontWeight: 900, color: "#FF6B35", lineHeight: 1 }}>
                      {i === 0 ? <><AnimatedCounter target={12} />{s}</> : i === 1 ? <>${n}</> : <><AnimatedCounter target={4.9} duration={2000} />{s}</>}
                    </div>
                    <div style={{ fontSize: 11, color: "rgba(240,237,232,0.4)", marginTop: 4 }}>{l}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Right — fare calculator + GPS card */}
            {bp.isDesktop && (
              <div className="hero-right" style={{ transform: `translate(${mouseX * 0.08}px,${mouseY * 0.06}px)`, transition: "transform 0.1s" }}>
                <FareCalculator isMobile={false} />
                <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div style={{ background: "rgba(76,175,130,0.07)", border: "1px solid rgba(76,175,130,0.2)", borderRadius: 14, padding: "14px", textAlign: "center" }}>
                    <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", color: "#4CAF82", marginBottom: 6 }}>🟢 Standard rate</div>
                    <div style={{ fontSize: 26, fontWeight: 900, color: "#4CAF82" }}>$1.64<span style={{ fontSize: 11, fontWeight: 400, color: "rgba(240,237,232,0.4)" }}>/mi</span></div>
                  </div>
                  <div style={{ background: "rgba(247,201,72,0.07)", border: "1px solid rgba(247,201,72,0.2)", borderRadius: 14, padding: "14px", textAlign: "center" }}>
                    <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", color: "#F7C948", marginBottom: 6 }}>🔴 Peak rate</div>
                    <div style={{ fontSize: 26, fontWeight: 900, color: "#F7C948" }}>$2.50<span style={{ fontSize: 11, fontWeight: 400, color: "rgba(240,237,232,0.4)" }}>/mi</span></div>
                  </div>
                </div>
                {/* Live GPS tracker mockup */}
                <div style={{ marginTop: 14, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 14, padding: "14px 16px", display: "flex", alignItems: "center", gap: 12, animation: "float 4s ease-in-out infinite" }}>
                  <div style={{ width: 36, height: 36, borderRadius: "50%", background: "rgba(76,175,130,0.15)", border: "2px solid rgba(76,175,130,0.4)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#4CAF82", animation: "gpsPulse 1.5s infinite" }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: "#4CAF82" }}>Exact GPS Active</div>
                    <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 10, color: "rgba(240,237,232,0.4)", marginTop: 2 }}>Paris, Île-de-France · ±3m</div>
                  </div>
                  <div style={{ fontSize: 9, fontWeight: 700, background: "rgba(76,175,130,0.15)", border: "1px solid rgba(76,175,130,0.3)", borderRadius: 8, padding: "3px 8px", color: "#4CAF82" }}>LIVE</div>
                </div>
              </div>
            )}

            {/* Mobile fare calc */}
            {!bp.isDesktop && (
              <div style={{ marginTop: 32 }}>
                <FareCalculator isMobile={true} />
              </div>
            )}
          </div>

          {/* Scroll hint */}
          <div style={{ position: "absolute", bottom: 28, left: "50%", transform: "translateX(-50%)", display: "flex", flexDirection: "column", alignItems: "center", gap: 6, opacity: 0.4 }}>
            <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: 2, textTransform: "uppercase" }}>Scroll</span>
            <div style={{ width: 1, height: 32, background: "linear-gradient(to bottom, rgba(255,255,255,0.5), transparent)" }} />
          </div>
        </section>

        {/* ── HOW IT WORKS ── */}
        <section style={{ padding: "100px clamp(20px,5vw,60px)", maxWidth: 1200, margin: "0 auto" }}>
          <div data-reveal="how-title" style={{ textAlign: "center", marginBottom: 60, ...revealStyle("how-title") }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 3, textTransform: "uppercase", color: "#FF6B35", marginBottom: 12 }}>How it works</div>
            <div style={{ fontSize: bp.isMobile ? 32 : 44, fontWeight: 900, letterSpacing: "-2px", lineHeight: 1.1 }}>Ride sharing, <span style={{ color: "#FF6B35" }}>redefined.</span></div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: bp.isMobile ? "1fr" : bp.isTablet ? "1fr 1fr" : "1fr 1fr 1fr 1fr", gap: 16 }}>
            {STEPS.map((s, i) => (
              <div key={s.n} className="step-card" data-reveal={`step-${i}`}
                style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 20, padding: "24px 20px", position: "relative", overflow: "hidden", ...revealStyle(`step-${i}`, i * 0.12) }}>
                <div style={{ position: "absolute", top: -10, right: -6, fontSize: 72, opacity: 0.04, fontWeight: 900, fontFamily: "'DM Mono',monospace" }}>{s.n}</div>
                <div style={{ fontSize: 32, marginBottom: 14 }}>{s.icon}</div>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", color: "#FF6B35", marginBottom: 6 }}>Step {s.n}</div>
                <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 8 }}>{s.title}</div>
                <div style={{ fontSize: 13, color: "rgba(240,237,232,0.5)", lineHeight: 1.7 }}>{s.desc}</div>
                {i < STEPS.length - 1 && !bp.isMobile && (
                  <div style={{ position: "absolute", right: -8, top: "50%", transform: "translateY(-50%)", color: "rgba(255,107,53,0.3)", fontSize: 20, fontWeight: 900 }}>→</div>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* ── FEATURES ── */}
        <section style={{ padding: "60px clamp(20px,5vw,60px) 100px", maxWidth: 1200, margin: "0 auto" }}>
          <div data-reveal="feat-title" style={{ textAlign: "center", marginBottom: 56, ...revealStyle("feat-title") }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 3, textTransform: "uppercase", color: "#FF6B35", marginBottom: 12 }}>Everything included</div>
            <div style={{ fontSize: bp.isMobile ? 30 : 42, fontWeight: 900, letterSpacing: "-2px", lineHeight: 1.1 }}>Built different,<br /><span style={{ color: "#FF6B35" }}>for the better.</span></div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: bp.isMobile ? "1fr 1fr" : "repeat(3,1fr)", gap: 14 }}>
            {FEATURES.map((f, i) => (
              <div key={f.title} className="feature-card" data-reveal={`feat-${i}`}
                style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${f.color}22`, borderRadius: 20, padding: "22px 18px", ...revealStyle(`feat-${i}`, i * 0.1) }}>
                <div style={{ width: 44, height: 44, borderRadius: 12, background: `${f.color}14`, border: `1px solid ${f.color}30`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, marginBottom: 14 }}>{f.icon}</div>
                <div style={{ fontSize: 14, fontWeight: 800, color: f.color, marginBottom: 6 }}>{f.title}</div>
                <div style={{ fontSize: 12, color: "rgba(240,237,232,0.5)", lineHeight: 1.7 }}>{f.desc}</div>
              </div>
            ))}
          </div>
        </section>

        {/* ── PRICING STRIP ── */}
        <section style={{ padding: "0 clamp(20px,5vw,60px) 100px", maxWidth: 1200, margin: "0 auto" }}>
          <div data-reveal="pricing" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 28, padding: bp.isMobile ? "32px 24px" : "48px 52px", display: bp.isDesktop ? "grid" : "block", gridTemplateColumns: "1fr 1fr", gap: 60, alignItems: "center", ...revealStyle("pricing") }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 3, textTransform: "uppercase", color: "#FF6B35", marginBottom: 14 }}>Simple pricing</div>
              <div style={{ fontSize: bp.isMobile ? 28 : 38, fontWeight: 900, letterSpacing: "-2px", lineHeight: 1.1, marginBottom: 16 }}>One subscription.<br /><span style={{ color: "#4CAF82" }}>Zero hidden fees.</span></div>
              <div style={{ fontSize: 14, color: "rgba(240,237,232,0.5)", lineHeight: 1.8, marginBottom: bp.isDesktop ? 0 : 28 }}>Passengers ride for $8/mo. Travelers choose a trip allowance that fits their schedule. All contributions flow 100% between people — On My Way never touches your earnings.</div>
            </div>
            <div>
              <div style={{ background: "rgba(76,175,130,0.07)", border: "1.5px solid rgba(76,175,130,0.25)", borderRadius: 16, padding: "18px 20px", marginBottom: 12, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#4CAF82", marginBottom: 3 }}>🙋 Passenger</div>
                  <div style={{ fontSize: 12, color: "rgba(240,237,232,0.5)" }}>Unlimited ride requests</div>
                </div>
                <div style={{ fontSize: 28, fontWeight: 900, color: "#4CAF82" }}>$8<span style={{ fontSize: 12, fontWeight: 400, color: "rgba(240,237,232,0.4)" }}>/mo</span></div>
              </div>
              {[["🚗 Starter Traveler", "50 trips/mo", 50, "#FF6B35"], ["🔑 Pro Traveler", "100 trips/mo", 100, "#F7C948"], ["👑 Elite Traveler", "Unlimited · First Preferred", 200, "#A78BFA"]].map(([n, d, p, col]) => (
                <div key={n} style={{ background: `${col}08`, border: `1px solid ${col}22`, borderRadius: 14, padding: "14px 18px", marginBottom: 8, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: col, marginBottom: 2 }}>{n}</div>
                    <div style={{ fontSize: 11, color: "rgba(240,237,232,0.4)" }}>{d}</div>
                  </div>
                  <div style={{ fontSize: 20, fontWeight: 900, color: col }}>${p}<span style={{ fontSize: 10, fontWeight: 400, color: "rgba(240,237,232,0.35)" }}>/mo</span></div>
                </div>
              ))}
              {/* Special rates */}
              <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 12, marginTop: 6 }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", color: "rgba(240,237,232,0.35)", marginBottom: 10 }}>⭐ Special Rates — Passengers Only</div>
                <div style={{ display: "flex", gap: 8 }}>
                  {SPECIAL_RATES.map(r => (
                    <div key={r.id} style={{ flex: 1, background: `${r.color}0A`, border: `1px solid ${r.color}25`, borderRadius: 12, padding: "10px 12px", textAlign: "center" }}>
                      <div style={{ marginBottom: 4, display: "flex", justifyContent: "center" }}><RateIcon icon={r.icon} size={44} color={r.color}/></div>
                      <div style={{ fontSize: 10, fontWeight: 800, color: r.color, marginBottom: 2 }}>{r.label}</div>
                      <div style={{ fontSize: 13, fontWeight: 900, color: r.color }}>{r.discount}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── FINAL CTA ── */}
        <section data-reveal="cta" style={{ padding: "0 clamp(20px,5vw,60px) 120px", maxWidth: 800, margin: "0 auto", textAlign: "center", ...revealStyle("cta") }}>
          <div style={{ fontSize: bp.isMobile ? 34 : 52, fontWeight: 900, letterSpacing: "-2px", lineHeight: 1.1, marginBottom: 20 }}>
            Your next ride is<br /><span style={{ color: "#FF6B35" }}>already out there.</span>
          </div>
          <div style={{ fontSize: 15, color: "rgba(240,237,232,0.5)", marginBottom: 36, maxWidth: 460, margin: "0 auto 36px" }}>Join thousands of travelers and passengers connecting directly — no platform taking a cut.</div>
          <button className="cta-primary" onClick={onSignup} style={{ padding: "18px 48px", background: "#FF6B35", border: "none", borderRadius: 16, color: "#0A0A0F", fontSize: 16, fontWeight: 800, cursor: "pointer", fontFamily: "'Syne',sans-serif", boxShadow: "0 12px 48px rgba(255,107,53,0.4)" }}>
            Get Started — It's Free →
          </button>
          <div style={{ marginTop: 16, fontSize: 12, color: "rgba(240,237,232,0.3)" }}>No credit card required to browse</div>
        </section>

        {/* ── FOOTER ── */}
        <footer style={{ borderTop: "1px solid rgba(255,255,255,0.07)", padding: "28px clamp(20px,5vw,60px)", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <div style={{ fontSize: 18, fontWeight: 900, letterSpacing: "-1px" }}>on<span style={{ color: "#FF6B35" }}>my</span>way</div>
          <div style={{ fontSize: 12, color: "rgba(240,237,232,0.3)" }}>© 2025 OnMyWay · Peer-to-peer · $0 platform fee</div>
          <div style={{ display: "flex", gap: 20 }}>
            {["Privacy", "Terms", "Support"].map(l => <span key={l} className="nav-link" style={{ fontSize: 12, color: "rgba(240,237,232,0.3)", cursor: "pointer" }}>{l}</span>)}
          </div>
        </footer>
      </div>
    </>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function OnMyWay() {
  const bp=useBreakpoint();
  const [screen,setScreen]=useState("landing");

  // ── Auth0 bootstrap ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!startAuthenticated || !auth0User) return;

    // Pre-fill form data from Auth0 profile
    setFormData(fd => ({
      ...fd,
      name:  fd.name  || auth0User.name  || auth0User.nickname || "",
      email: fd.email || auth0User.email || "",
    }));

    if (savedProfile?.accountType) {
      // ── Returning user: restore their saved account and go straight to dashboard
      if (savedProfile.accountType === "traveler" && savedProfile.travelerTier) {
        setTravelerTier(savedProfile.travelerTier);
      }
      setAccountType(savedProfile.accountType);
      setScreen("dashboard");
    } else {
      // ── New user: go to account-type selection (still need to verify)
      setScreen("signup");
      setSignupStep("type");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startAuthenticated, auth0User?.sub, savedProfile?.accountType]);
  // ─────────────────────────────────────────────────────────────────────────
  const [tab,setTab]=useState("home");
  const [signupStep,setSignupStep]=useState("type");
  const [tiersView,setTiersView]=useState("traveler");
  const [accountType,setAccountType]=useState("passenger");
  const [travelerTier,setTravelerTier]=useState("starter");
  const [formData,setFormData]=useState({name:"",email:"",phone:""});
  const [usedTrips]=useState(23);
  const [peakWindows,setPeakWindows]=useState(DEFAULT_PEAK);
  const [showPeakSettings,setShowPeakSettings]=useState(false);
  const [userPos,setUserPos]=useState(null);
  const [isTracking,setIsTracking]=useState(false);
  const [gpsError,setGpsError]=useState(null);
  const [locationLabel,setLocationLabel]=useState("");
  const watchId=useRef(null);
  const [isTraveling,setIsTraveling]=useState(false);
  const [activeRoute,setActiveRoute]=useState(null);
  const [travelers,setTravelers]=useState([]);
  const [showPostRoute,setShowPostRoute]=useState(false);
  const [fareTraveler,setFareTraveler]=useState(null);
  // Grocery delivery state
  const [isDelivering,setIsDelivering]=useState(false);
  const [activeDelivery,setActiveDelivery]=useState(null);
  const [groceryCouriers,setGroceryCouriers]=useState([]);
  const [showPostDelivery,setShowPostDelivery]=useState(false);
  const [groceryCourierTarget,setGroceryCourierTarget]=useState(null);
  const [weather,setWeather]=useState(null);
  const [weatherLoading,setWeatherLoading]=useState(false);
  const [news,setNews]=useState(DEFAULT_NEWS);
  const [likedPosts,setLikedPosts]=useState(new Set());
  const [newsFilter,setNewsFilter]=useState("All");
  const [showReport,setShowReport]=useState(false);
  const [animate,setAnimate]=useState(false);
  const [dotPos,setDotPos]=useState(0);

  const isPeak=inPeak(peakWindows);
  const activeTier=accountType==="traveler"?TRAVELER_TIERS[travelerTier]:PASSENGER_TIERS.rider;

  // ── EXACT GPS ───────────────────────────────────────────────────────────────
  const startGPS=useCallback(()=>{
    if (!navigator.geolocation||watchId.current) return;
    watchId.current=navigator.geolocation.watchPosition(
      pos=>{
        setUserPos({
          lat:pos.coords.latitude,
          lon:pos.coords.longitude,
          accuracy:pos.coords.accuracy,
          altitude:pos.coords.altitude,
          speed:pos.coords.speed||0,
          heading:pos.coords.heading,
          timestamp:pos.timestamp,
          exact:true,
        });
        setIsTracking(true);
        setGpsError(null);
      },
      err=>{
        setIsTracking(false);
        setGpsError(err.message||"GPS unavailable — please allow location access");
      },
      { enableHighAccuracy:true, timeout:15000, maximumAge:0 }  // maximumAge:0 forces fresh fix
    );
  },[]);
  const stopGPS=useCallback(()=>{
    if(watchId.current!=null){navigator.geolocation.clearWatch(watchId.current);watchId.current=null;}
    setIsTracking(false);
  },[]);
  useEffect(()=>{ if(screen==="dashboard") startGPS(); },[screen,startGPS]);
  useEffect(()=>()=>stopGPS(),[stopGPS]);

  // Reverse geocode for city label (display only, GPS is authoritative)
  const labelTimer=useRef(null);
  useEffect(()=>{
    if (!userPos) return;
    clearTimeout(labelTimer.current);
    labelTimer.current=setTimeout(async()=>{ setLocationLabel(await reverseGeocode(userPos.lat,userPos.lon)); },1200);
    return()=>clearTimeout(labelTimer.current);
  },[userPos?.lat,userPos?.lon]);

  useEffect(()=>{ if(userPos){ setTravelers(makeTravelers(userPos.lat,userPos.lon)); setGroceryCouriers(makeGroceryCouriers(userPos.lat,userPos.lon)); } },[userPos?.lat,userPos?.lon]);
  useEffect(()=>{ const iv=setInterval(()=>setTravelers(p=>p.map(t=>({...t,lat:t.lat+(Math.random()-0.5)*0.0003,lon:t.lon+(Math.random()-0.5)*0.0003}))),3000); return()=>clearInterval(iv); },[]);
  useEffect(()=>{ setAnimate(true); const iv=setInterval(()=>setDotPos(p=>(p+1)%100),50); return()=>clearInterval(iv); },[]);

  // Weather from exact GPS
  useEffect(()=>{
    if (screen!=="dashboard"||!userPos) return;
    setWeatherLoading(true);
    (async()=>{
      try {
        const r=await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${userPos.lat}&longitude=${userPos.lon}&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code`);
        const d=await r.json(), cv=d.current;
        let condition="clear";
        if(cv.weather_code>=95)condition="storm"; else if(cv.weather_code>=71)condition="snow"; else if(cv.weather_code>=51)condition="rain"; else if(cv.weather_code>=2)condition="cloudy";
        setWeather({city:locationLabel||`${userPos.lat.toFixed(4)}°, ${userPos.lon.toFixed(4)}°`,temp:Math.round(cv.temperature_2m),feels_like:Math.round(cv.apparent_temperature),humidity:cv.relative_humidity_2m,wind:Math.round(cv.wind_speed_10m),condition});
      } catch {
        setWeather({city:locationLabel||"Your Location",temp:"--",feels_like:"--",humidity:"--",wind:"--",condition:"cloudy"});
      } finally { setWeatherLoading(false); }
    })();
  },[screen,userPos?.lat,userPos?.lon,locationLabel]);

  const handleLike=id=>setLikedPosts(p=>{const n=new Set(p);n.has(id)?n.delete(id):n.add(id);return n;});
  const handleReport=form=>{
    const meta={Traffic:["#FF6B35","🚧"],Safety:["#F7C948","⚠️"],Community:["#4CAF82","🌳"],Events:["#C084FC","🎉"],"Lost & Found":["#60A5FA","🐾"],Other:["#9CA3AF","📢"]};
    const [col,icon]=meta[form.category]||["#9CA3AF","📢"];
    setNews(p=>[{id:Date.now(),category:form.category,categoryColor:col,icon,title:form.title,body:form.body,author:formData.name||"You",time:"Just now",likes:0,comments:0,verified:false},...p]);
    setTab("news");
  };
  const filteredNews=newsFilter==="All"?news:news.filter(n=>n.category===newsFilter);

  const STYLES=`
    *{margin:0;padding:0;box-sizing:border-box}
    @keyframes gpsPulse{0%,100%{opacity:1}50%{opacity:0.3}}
    @keyframes fadeUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
    .fadeUp{animation:fadeUp 0.35s cubic-bezier(0.16,1,0.3,1) both}
    button:active{transform:scale(0.97)!important}
    ::-webkit-scrollbar{width:4px;height:4px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.1);border-radius:4px}
    input::placeholder,textarea::placeholder{color:rgba(240,237,232,0.3)}
    select option{background:#111118}
    .leaflet-container{background:#0A0A14!important}
    .leaflet-popup-content-wrapper{background:#111118!important;border:1px solid rgba(255,255,255,0.1)!important;color:#F0EDE8!important;border-radius:12px!important;box-shadow:0 8px 32px rgba(0,0,0,0.5)!important}
    .leaflet-popup-tip{background:#111118!important}
    .leaflet-control-zoom a{background:#111118!important;color:#F0EDE8!important;border-color:rgba(255,255,255,0.1)!important}
  `;

  const TABS=[{id:"home",icon:"🏠",label:"Home"},{id:"map",icon:"🗺️",label:"Map"},{id:"news",icon:"📰",label:"News"},{id:"services",icon:"⚡",label:"Services"},{id:"tiers",icon:"🏆",label:"Tiers"}];
  const mainPad=bp.isMobile?"14px 16px 90px":"24px 28px 32px";

  // ── LANDING ────────────────────────────────────────────────────────────────
  if(screen==="landing"&&!startAuthenticated) return <LandingPage bp={bp} onSignup={()=>{setSignupStep("type");setScreen("signup");}} onSignin={()=>setScreen("dashboard")}/>;

  // ── SIGNUP ─────────────────────────────────────────────────────────────────
  if(screen==="signup") return (
    <>
      <link href="https://fonts.googleapis.com/css2?family=Syne:wght@400;700;800;900&display=swap" rel="stylesheet"/>
      <style>{STYLES}</style>
      <div style={{fontFamily:"'Syne',sans-serif",minHeight:"100vh",background:C.bg,color:C.text,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
        <div style={{width:"100%",maxWidth:480,background:bp.isDesktop?C.surface:"transparent",border:bp.isDesktop?`1px solid ${C.border}`:"none",borderRadius:bp.isDesktop?28:0,padding:bp.isDesktop?40:0}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:28}}>
            <div style={{fontSize:20,fontWeight:900,letterSpacing:"-1px"}}>on<span style={{color:"#FF6B35"}}>my</span>way</div>
            <button style={{background:"none",border:"none",color:C.muted,fontSize:13,cursor:"pointer",fontFamily:"'Syne',sans-serif"}} onClick={()=>signupStep==="type"?setScreen("landing"):signupStep==="verify"?setSignupStep("form"):setSignupStep("type")}>← Back</button>
          </div>

          {signupStep==="type"&&(
            <div className="fadeUp">
              <div style={{fontSize:26,fontWeight:900,letterSpacing:"-1px",marginBottom:4}}>Join as…</div>
              <div style={{fontSize:13,color:C.muted,marginBottom:22}}>Travelers pay their own tier subscription and keep 100% of every contribution. Passengers pay a flat $8/mo.</div>
              <div style={{display:"flex",gap:12,marginBottom:28}}>
                {[{type:"passenger",title:"Passenger",sub:"Find & negotiate rides",price:"$8/mo",avatar:<AvatarPassenger size={72} color="#4CAF82"/>},{type:"traveler",title:"Traveler",sub:"Broadcast routes & earn",price:"From $50/mo",avatar:<AvatarTraveler size={72} color="#FF6B35"/>}].map(o=>(
                  <div key={o.type} onClick={()=>setAccountType(o.type)} style={{flex:1,background:accountType===o.type?"rgba(255,107,53,0.1)":C.surface,border:`2px solid ${accountType===o.type?"#FF6B35":C.border}`,borderRadius:20,padding:"22px 14px",textAlign:"center",cursor:"pointer",transition:"all 0.2s"}}>
                    <div style={{marginBottom:10,display:"flex",justifyContent:"center"}}>{o.avatar}</div>
                    <div style={{fontSize:15,fontWeight:800,color:accountType===o.type?"#FF6B35":C.text,marginBottom:4}}>{o.title}</div>
                    <div style={{fontSize:11,color:C.muted,marginBottom:8}}>{o.sub}</div>
                    <div style={{fontSize:13,fontWeight:900,color:"#4CAF82"}}>{o.price}</div>
                  </div>
                ))}
              </div>
              <button style={{width:"100%",padding:"16px",background:"#FF6B35",border:"none",borderRadius:14,color:"#0A0A0F",fontSize:15,fontWeight:800,cursor:"pointer",fontFamily:"'Syne',sans-serif"}} onClick={()=>setSignupStep(accountType==="passenger"?"form":"plan")}>
                {accountType==="passenger"?"Continue →":"Choose my plan →"}
              </button>
            </div>
          )}

          {signupStep==="plan"&&accountType==="traveler"&&(
            <div className="fadeUp" style={{maxHeight:"72vh",overflowY:"auto"}}>
              <div style={{fontSize:26,fontWeight:900,letterSpacing:"-1px",marginBottom:4}}>Choose your plan</div>
              <div style={{fontSize:13,color:C.muted,marginBottom:20}}>Pick the tier that matches how often you travel. All contributions go 100% to you.</div>
              {Object.values(TRAVELER_TIERS).map(t=>{
                const sel=travelerTier===t.id;
                return (
                  <div key={t.id} onClick={()=>setTravelerTier(t.id)} style={{background:sel?`${t.color}10`:C.surface,border:`1.5px solid ${sel?t.color:C.border}`,borderRadius:16,padding:"16px",marginBottom:10,cursor:"pointer",transition:"all 0.2s"}}>
                    <div style={{display:"flex",alignItems:"center",gap:12}}>
                      <div style={{width:46,height:46,borderRadius:13,background:t.gradient,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20}}>{t.icon}</div>
                      <div style={{flex:1}}>
                        <div style={{fontSize:15,fontWeight:800,color:sel?t.color:C.text}}>{t.label} Traveler</div>
                        <div style={{fontSize:11,color:C.muted}}>{t.unlimited?"Unlimited trips":"Up to "+t.tripLimit+" trips/mo"} · {t.visibility}</div>
                      </div>
                      <div style={{textAlign:"right"}}>
                        <div style={{fontSize:20,fontWeight:900,color:t.color}}>${t.subPrice}</div>
                        <div style={{fontSize:10,color:C.muted}}>{t.subPeriod}</div>
                      </div>
                    </div>
                    {t.id==="elite"&&<div style={{marginTop:10,background:"rgba(167,139,250,0.1)",border:"1px solid rgba(167,139,250,0.25)",borderRadius:10,padding:"6px 10px",display:"flex",alignItems:"center",gap:6}}><span style={{fontSize:12}}>⭐</span><span style={{fontSize:11,color:"#A78BFA",fontWeight:700}}>First Preferred Status — always shown first to passengers</span></div>}
                    <div style={{fontSize:11,color:C.muted,marginTop:8}}>{t.perks[0]}, {t.perks[1]}</div>
                  </div>
                );
              })}
              <button style={{width:"100%",padding:"16px",background:"#FF6B35",border:"none",borderRadius:14,color:"#0A0A0F",fontSize:15,fontWeight:800,cursor:"pointer",fontFamily:"'Syne',sans-serif",marginTop:8}} onClick={()=>setSignupStep("form")}>Continue →</button>
            </div>
          )}

          {signupStep==="form"&&(
            <div className="fadeUp">
              <div style={{fontSize:26,fontWeight:900,letterSpacing:"-1px",marginBottom:4}}>Create account</div>
              <div style={{fontSize:13,color:C.muted,marginBottom:18}}>
                {accountType==="traveler"
                  ?<>Joining as <span style={{color:TRAVELER_TIERS[travelerTier].color,fontWeight:700}}>{TRAVELER_TIERS[travelerTier].icon} {TRAVELER_TIERS[travelerTier].label} Traveler — ${TRAVELER_TIERS[travelerTier].subPrice}/mo</span></>
                  :<span style={{color:"#4CAF82",fontWeight:700}}>Passenger — $8/mo · Unlimited requests</span>
                }
              </div>
              {[["Full Name","name","Your name","text"],["Email","email","your@email.com","email"],["Phone","phone","+1 (555) 000-0000","tel"]].map(([l,k,ph,type])=>(
                <div key={k} style={{marginBottom:14}}>
                  <div style={{fontSize:11,fontWeight:700,letterSpacing:1,textTransform:"uppercase",color:C.muted,marginBottom:6}}>{l}</div>
                  <input type={type} placeholder={ph} value={formData[k]} onChange={e=>setFormData({...formData,[k]:e.target.value})} style={{width:"100%",padding:"13px 15px",background:C.surface,border:`1.5px solid ${C.border}`,borderRadius:12,color:C.text,fontSize:15,fontFamily:"'Syne',sans-serif",outline:"none"}}/>
                </div>
              ))}
              {/* Special rates — passengers only */}
              {accountType==="passenger"&&(
              <div style={{marginBottom:16}}>
                <div style={{fontSize:11,fontWeight:700,letterSpacing:1,textTransform:"uppercase",color:C.muted,marginBottom:9}}>Special Rates Available</div>
                <div style={{display:"flex",gap:8}}>
                  {SPECIAL_RATES.map(r=>(
                    <div key={r.id} style={{flex:1,background:`${r.color}0C`,border:`1px solid ${r.color}33`,borderRadius:12,padding:"10px 10px 8px",textAlign:"center"}}>
                      <div style={{marginBottom:4,display:"flex",justifyContent:"center"}}><RateIcon icon={r.icon} size={40} color={r.color}/></div>
                      <div style={{fontSize:10,fontWeight:800,color:r.color}}>{r.label}</div>
                      <div style={{fontSize:11,fontWeight:900,color:r.color,marginTop:2}}>{r.discount}</div>
                    </div>
                  ))}
                </div>
                <div style={{fontSize:10,color:C.muted,marginTop:7,lineHeight:1.5}}>Eligible? You'll verify on the next step with government-issued documentation.</div>
              </div>
              )}
              <button style={{width:"100%",padding:"16px",background:"#FF6B35",border:"none",borderRadius:14,color:"#0A0A0F",fontSize:15,fontWeight:800,cursor:"pointer",fontFamily:"'Syne',sans-serif",marginTop:4}} onClick={()=>setSignupStep("verify")}>Continue to Verification →</button>
            </div>
          )}

          {signupStep==="verify"&&(
            <VerificationStep accountType={accountType} travelerTier={travelerTier} onComplete={()=>setSignupStep("success")}/>
          )}

          {signupStep==="success"&&(
            <div className="fadeUp" style={{textAlign:"center"}}>
              <div style={{marginBottom:14,display:"flex",justifyContent:"center"}}>
                {accountType==="traveler"?<AvatarTraveler size={96} color={TRAVELER_TIERS[travelerTier].color}/>:<AvatarPassenger size={96} color="#4CAF82"/>}
              </div>
              <div style={{fontSize:22,fontWeight:900,letterSpacing:"-1px",marginBottom:8}}>You're on the way!</div>
              {accountType==="traveler"?<TierBadge tier={travelerTier} type="traveler" size="lg"/>:<TierBadge tier="rider" type="passenger" size="lg"/>}
              <div style={{background:"rgba(76,175,130,0.08)",border:"1px solid rgba(76,175,130,0.2)",borderRadius:12,padding:"10px 14px",margin:"14px 0 20px",textAlign:"left"}}>
                <div style={{fontSize:11,fontWeight:800,color:"#4CAF82",marginBottom:3}}>🔒 Verification submitted</div>
                <div style={{fontSize:11,color:C.muted,lineHeight:1.6}}>Your identity and documents are under review. Your private information is never shared publicly and is only disclosed to law enforcement under warrant, or in cases of life endangerment, child endangerment, or sex trafficking.</div>
              </div>
              <div style={{fontSize:13,color:C.muted,lineHeight:1.7,marginBottom:24}}>
                {accountType==="traveler"
                  ?`Your ${activeTier.label} plan includes ${activeTier.unlimited?"unlimited":activeTier.tripLimit+" monthly"} trips. Every contribution you earn is 100% yours.`
                  :"Your $8/mo subscription gives you unlimited ride requests. Contribution agreed directly with your traveler."}
              </div>
              <button style={{width:"100%",padding:"16px",background:"#FF6B35",border:"none",borderRadius:14,color:"#0A0A0F",fontSize:15,fontWeight:800,cursor:"pointer",fontFamily:"'Syne',sans-serif"}} onClick={async ()=>{
                if(onProfileSave){
                  await onProfileSave({ accountType, travelerTier }).catch(()=>{});
                }
                setScreen("dashboard");
              }}>Open App →</button>
            </div>
          )}
        </div>
      </div>
    </>
  );

  // ── DASHBOARD ──────────────────────────────────────────────────────────────
  // Tab content components
  const HomeTab = () => (
    <div className="fadeUp">
      <div style={{fontSize:11,letterSpacing:2,textTransform:"uppercase",color:C.muted,marginBottom:3}}>Good to see you 👋</div>
      <div style={{fontSize:bp.isDesktop?24:20,fontWeight:900,letterSpacing:"-1px",marginBottom:4}}>{formData.name?`Hey, ${formData.name.split(" ")[0]}`:"Welcome back"}</div>
      {locationLabel&&<div style={{fontSize:12,color:C.muted,marginBottom:16}}>📍 {locationLabel}</div>}
      <div style={{display:bp.isDesktop?"grid":"block",gridTemplateColumns:"1fr 1fr",gap:18}}>
        <div>
          {/* Subscription card */}
          <div style={{background:`${activeTier.color}09`,border:`1.5px solid ${activeTier.color}33`,borderRadius:20,padding:"16px 18px",marginBottom:16,position:"relative",overflow:"hidden"}}>
            <div style={{position:"absolute",top:-8,right:-8,opacity:0.06,pointerEvents:"none"}}>
              {accountType==="traveler"?<AvatarTraveler size={80} color={activeTier.color}/>:<AvatarPassenger size={80} color={activeTier.color}/>}
            </div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
              <div>
                <div style={{fontSize:11,fontWeight:700,letterSpacing:1,textTransform:"uppercase",color:C.muted,marginBottom:6}}>Your subscription</div>
                {accountType==="traveler"?<TierBadge tier={travelerTier} type="traveler" size="lg"/>:<TierBadge tier="rider" type="passenger" size="lg"/>}
              </div>
              <div style={{textAlign:"right"}}>
                <div style={{fontSize:20,fontWeight:900,color:activeTier.color}}>${activeTier.subPrice}<span style={{fontSize:11,fontWeight:400,color:C.muted}}>{activeTier.subPeriod}</span></div>
                <div style={{fontSize:10,color:C.muted,marginTop:2}}>renews monthly</div>
              </div>
            </div>
            {accountType==="traveler"&&!TRAVELER_TIERS[travelerTier].unlimited&&(
              <div style={{marginBottom:10}}>
                <TripProgress label="Trips used this month" value={usedTrips} max={TRAVELER_TIERS[travelerTier].tripLimit} color={activeTier.color}/>
              </div>
            )}
            {accountType==="traveler"&&TRAVELER_TIERS[travelerTier].unlimited&&(
              <div style={{background:"rgba(167,139,250,0.08)",border:"1px solid rgba(167,139,250,0.2)",borderRadius:10,padding:"7px 11px",marginBottom:10}}>
                <span style={{fontSize:11,color:"#A78BFA",fontWeight:700}}>⭐ First Preferred Status · Unlimited Trips · Always shown first</span>
              </div>
            )}
            <div style={{background:"rgba(76,175,130,0.07)",border:"1px solid rgba(76,175,130,0.15)",borderRadius:10,padding:"7px 11px",marginBottom:10}}>
              <span style={{fontSize:11,color:"#4CAF82",fontWeight:700}}>{accountType==="traveler"?"✓ You keep 100% of every contribution":"✓ Contribution agreed directly with traveler — On My Way takes $0"}</span>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <PeakBadge peak={isPeak}/>
              <span style={{fontSize:11,color:C.muted}}>${isPeak?"2.50":"1.64"}/mi now</span>
              <button onClick={()=>setShowPeakSettings(true)} style={{marginLeft:"auto",background:"none",border:"none",color:C.muted,fontSize:11,cursor:"pointer",fontFamily:"'Syne',sans-serif"}}>Edit →</button>
            </div>
          </div>
          {/* GPS map card */}
          <div style={{background:isTracking?"rgba(76,175,130,0.06)":C.surface,border:`1px solid ${isTracking?"rgba(76,175,130,0.2)":C.border}`,borderRadius:16,overflow:"hidden",marginBottom:16}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 14px"}}>
              <div style={{display:"flex",alignItems:"center",gap:7}}>
                <GPSStatusDot tracking={isTracking}/>
                <span style={{fontSize:12,fontWeight:800,color:isTracking?"#4CAF82":C.muted}}>{isTracking?"Your Location":"GPS Inactive"}</span>
                {isTracking&&userPos&&<span style={{fontSize:10,background:"rgba(76,175,130,0.1)",border:"1px solid rgba(76,175,130,0.2)",borderRadius:10,padding:"2px 7px",color:"#4CAF82",fontWeight:700}}>±{Math.round(userPos.accuracy||0)}m</span>}
              </div>
              <button onClick={isTracking?stopGPS:startGPS} style={{background:"rgba(255,255,255,0.05)",border:`1px solid ${C.border}`,borderRadius:9,color:C.muted,padding:"5px 12px",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"'Syne',sans-serif"}}>{isTracking?"Pause":"Enable GPS"}</button>
            </div>
            {locationLabel&&isTracking&&(
              <div style={{padding:"0 14px 10px",fontSize:12,color:"#4CAF82",fontWeight:600}}>📍 {locationLabel}</div>
            )}
            <LiveMap userPos={userPos} travelers={[]} isTracking={isTracking} isDriver={false} height={200}/>
            {gpsError&&<div style={{padding:"10px 14px",fontSize:11,color:"#F7C948"}}>⚠️ {gpsError} <button onClick={startGPS} style={{background:"none",border:"none",color:"#FF6B35",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"'Syne',sans-serif"}}>Retry</button></div>}
          </div>
          {/* Quick actions */}
          <div style={{fontSize:11,fontWeight:700,letterSpacing:1.5,textTransform:"uppercase",color:C.muted,marginBottom:10}}>Quick Actions</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:bp.isDesktop?0:18}}>
            {[{icon:"🚗",l:"Ride Share",c:"#FF6B35"},{icon:"🛒",l:"Grocery",c:"#4CAF82"},{icon:"🍔",l:"Food",c:"#F7C948"}].map(s=>(
              <button key={s.l} onClick={()=>setTab("services")} style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:14,padding:"14px 8px",textAlign:"center",cursor:"pointer",fontFamily:"'Syne',sans-serif",transition:"border-color 0.2s"}}
                onMouseEnter={e=>e.currentTarget.style.borderColor="rgba(255,255,255,0.18)"}
                onMouseLeave={e=>e.currentTarget.style.borderColor=C.border}>
                <div style={{fontSize:22,marginBottom:5}}>{s.icon}</div>
                <div style={{fontSize:10,fontWeight:700,color:s.c}}>{s.l}</div>
              </button>
            ))}
          </div>
        </div>
        <div style={{marginTop:bp.isDesktop?0:18}}>
          <div style={{fontSize:11,fontWeight:700,letterSpacing:1.5,textTransform:"uppercase",color:C.muted,marginBottom:9}}>Local Weather</div>
          {(userPos||weatherLoading)?<WeatherCard weather={weather} loading={weatherLoading}/>:<div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:18,padding:"16px",textAlign:"center",marginBottom:18,color:C.muted,fontSize:13}}>📍 Waiting for GPS…</div>}
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <div style={{fontSize:11,fontWeight:700,letterSpacing:1.5,textTransform:"uppercase",color:C.muted}}>Community News</div>
            <button onClick={()=>setTab("news")} style={{background:"none",border:"none",color:"#FF6B35",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"'Syne',sans-serif"}}>See all →</button>
          </div>
          {news.slice(0,bp.isDesktop?3:2).map(item=><NewsCard key={item.id} item={item} liked={likedPosts.has(item.id)} onLike={handleLike}/>)}
        </div>
      </div>
    </div>
  );

  const MapTab = () => (
    <div className="fadeUp">
      <div style={{fontSize:22,fontWeight:900,letterSpacing:"-1px",marginBottom:4}}>Live Map</div>
      <div style={{fontSize:13,color:C.muted,marginBottom:14}}>
        {isTracking?<span style={{color:"#4CAF82"}}>● GPS active{locationLabel?` · ${locationLabel}`:""}{userPos&&` · ±${Math.round(userPos.accuracy||0)}m`}</span>:<span style={{color:"#F7C948"}}>● Enable GPS to see your position on the map</span>}
      </div>
      <div style={{display:bp.isDesktop?"grid":"block",gridTemplateColumns:"1fr 380px",gap:18,alignItems:"start"}}>
        <LiveMap userPos={userPos} travelers={travelers} isTracking={isTracking} isDriver={isTraveling} height={bp.isDesktop?520:300}/>
        <div style={{marginTop:bp.isDesktop?0:16}}>
          {travelers.length>0?(
            <>
              <div style={{fontSize:11,fontWeight:700,letterSpacing:1.5,textTransform:"uppercase",color:C.muted,marginBottom:10}}>Routes near you · sorted by tier</div>
              {travelers.sort((a,b)=>Object.keys(TRAVELER_TIERS).indexOf(b.tier)-Object.keys(TRAVELER_TIERS).indexOf(a.tier)).map(t=><TravelerCard key={t.id} traveler={t} peak={isPeak} onAsk={()=>setFareTraveler(t)}/>)}
            </>
          ):(
            <div style={{textAlign:"center",padding:"30px 0",color:C.muted}}>
              <div style={{fontSize:32,marginBottom:10}}>📡</div>
              <div style={{fontSize:13}}>Enable GPS to see nearby routes</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  const NewsTab = () => (
    <div className="fadeUp">
      <div style={{fontSize:22,fontWeight:900,letterSpacing:"-1px",marginBottom:4}}>Community</div>
      <div style={{fontSize:13,color:C.muted,marginBottom:16}}>What's happening near you</div>
      <div style={{display:"flex",gap:7,overflowX:"auto",paddingBottom:7,marginBottom:15}}>
        {["All","Traffic","Safety","Community","Events","Lost & Found"].map(f=>(
          <button key={f} onClick={()=>setNewsFilter(f)} style={{flexShrink:0,padding:"6px 14px",borderRadius:20,border:`1.5px solid ${newsFilter===f?"#FF6B35":C.border}`,background:newsFilter===f?"rgba(255,107,53,0.1)":C.surface,color:newsFilter===f?"#FF6B35":C.muted,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"'Syne',sans-serif"}}>{f}</button>
        ))}
      </div>
      <div style={{display:bp.isDesktop?"grid":"block",gridTemplateColumns:"1fr 1fr",gap:12}}>
        {filteredNews.length===0
          ?<div style={{textAlign:"center",padding:"50px 0",color:C.muted,gridColumn:"1/-1"}}><div style={{fontSize:36,marginBottom:10}}>📭</div><div>No posts in this category.</div></div>
          :filteredNews.map(item=><NewsCard key={item.id} item={item} liked={likedPosts.has(item.id)} onLike={handleLike}/>)}
      </div>
    </div>
  );

  const ServicesTab = () => (
    <div className="fadeUp">
      <div style={{fontSize:22,fontWeight:900,letterSpacing:"-1px",marginBottom:4}}>Services</div>
      <div style={{fontSize:13,color:C.muted,marginBottom:20}}>Ride share · Grocery delivery · Food — all peer-to-peer, zero platform fees.</div>

      {/* ── RIDE SHARE ── */}
      <div style={{background:"rgba(255,107,53,0.06)",border:"1.5px solid rgba(255,107,53,0.22)",borderRadius:22,padding:"18px",marginBottom:16}}>
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:14}}>
          <div style={{width:48,height:48,borderRadius:14,background:"rgba(255,107,53,0.14)",border:"1.5px solid rgba(255,107,53,0.28)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22}}>🚗</div>
          <div style={{flex:1}}>
            <div style={{fontSize:16,fontWeight:800}}>Ride Share</div>
            <div style={{fontSize:12,color:C.muted}}>GPS contribution auto-calculated · 0% platform fee</div>
          </div>
          {isTraveling&&<div style={{background:"#FF6B35",borderRadius:14,padding:"3px 10px"}}><span style={{fontSize:10,fontWeight:800,color:"#0A0A0F"}}>📡 LIVE</span></div>}
        </div>
        <div style={{background:"rgba(76,175,130,0.07)",border:"1px solid rgba(76,175,130,0.18)",borderRadius:12,padding:"9px 13px",marginBottom:12}}>
          <div style={{fontSize:11,color:"#4CAF82",fontWeight:700,marginBottom:2}}>💡 How it works</div>
          <div style={{fontSize:11,color:C.muted,lineHeight:1.6}}>Traveler's exact GPS + destination = automatic contribution calculation. Passengers can negotiate. <strong style={{color:C.text}}>On My Way takes $0.</strong></div>
        </div>
        <div style={{background:"rgba(96,165,250,0.06)",border:"1px solid rgba(96,165,250,0.18)",borderRadius:12,padding:"8px 13px",marginBottom:12}}>
          <div style={{fontSize:10,fontWeight:800,color:"#60A5FA",marginBottom:4}}>📷 Safety — all drivers must have interior + exterior cameras · ⭐ Min 3.5-star rating required</div>
          <div style={{fontSize:10,color:C.muted}}>Cameras protect everyone. Ratings below 3.5 result in account review and suspension.</div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8,background:"rgba(255,255,255,0.03)",border:`1px solid ${C.border}`,borderRadius:12,padding:"9px 13px",marginBottom:12}}>
          <PeakBadge peak={isPeak}/><span style={{fontSize:12,color:C.muted}}>Now: <strong style={{color:C.text}}>${isPeak?"2.50":"1.64"}/mi</strong></span>
          <button onClick={()=>setShowPeakSettings(true)} style={{marginLeft:"auto",background:"none",border:"none",color:C.muted,fontSize:11,cursor:"pointer",fontFamily:"'Syne',sans-serif"}}>Edit →</button>
        </div>
        <div style={{display:"flex",gap:10,marginBottom:14}}>
          {accountType==="traveler"&&(
            <button onClick={()=>setShowPostRoute(true)} style={{flex:1,padding:"12px 8px",background:isTraveling?"#4CAF82":"#FF6B35",border:"none",borderRadius:13,color:"#0A0A0F",fontSize:13,fontWeight:800,cursor:"pointer",fontFamily:"'Syne',sans-serif"}}>{isTraveling?"📡 Broadcasting":"🚗 Post My Route"}</button>
          )}
          <button onClick={()=>setTab("map")} style={{flex:1,padding:"12px 8px",background:"rgba(255,107,53,0.08)",border:"1.5px solid rgba(255,107,53,0.25)",borderRadius:13,color:"#FF6B35",fontSize:13,fontWeight:800,cursor:"pointer",fontFamily:"'Syne',sans-serif"}}>🗺️ Find a Ride</button>
        </div>
        <div style={{fontSize:11,fontWeight:700,letterSpacing:1.5,textTransform:"uppercase",color:C.muted,marginBottom:10}}>Travelers near you · sorted by tier</div>
        {travelers.length>0
          ?travelers.sort((a,b)=>Object.keys(TRAVELER_TIERS).indexOf(b.tier)-Object.keys(TRAVELER_TIERS).indexOf(a.tier)).map(t=><TravelerCard key={t.id} traveler={t} peak={isPeak} onAsk={()=>setFareTraveler(t)}/>)
          :<div style={{textAlign:"center",padding:"16px 0",color:C.muted,fontSize:12}}>📡 Enable GPS to find nearby travelers…</div>}
      </div>

      {/* ── GROCERY DELIVERY ── */}
      <div style={{background:"rgba(76,175,130,0.06)",border:"1.5px solid rgba(76,175,130,0.22)",borderRadius:22,padding:"18px",marginBottom:16}}>
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:14}}>
          <div style={{width:48,height:48,borderRadius:14,background:"rgba(76,175,130,0.14)",border:"1.5px solid rgba(76,175,130,0.28)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22}}>🛒</div>
          <div style={{flex:1}}>
            <div style={{fontSize:16,fontWeight:800}}>Grocery Delivery</div>
            <div style={{fontSize:12,color:C.muted}}>Verified drivers shop & deliver · same standards as Ride Share</div>
          </div>
          {isDelivering&&<div style={{background:"#4CAF82",borderRadius:14,padding:"3px 10px"}}><span style={{fontSize:10,fontWeight:800,color:"#0A0A0F"}}>📡 LIVE</span></div>}
        </div>

        {/* How it works */}
        <div style={{background:"rgba(76,175,130,0.07)",border:"1px solid rgba(76,175,130,0.18)",borderRadius:12,padding:"9px 13px",marginBottom:12}}>
          <div style={{fontSize:11,color:"#4CAF82",fontWeight:700,marginBottom:2}}>💡 How it works</div>
          <div style={{fontSize:11,color:C.muted,lineHeight:1.6}}>Verified drivers with a clean abstract shop your list at the store of your choice and deliver to your door. Contribution agreed directly — <strong style={{color:C.text}}>On My Way takes $0.</strong></div>
        </div>

        {/* Driver requirements notice */}
        <div style={{background:"rgba(247,201,72,0.06)",border:"1px solid rgba(247,201,72,0.2)",borderRadius:12,padding:"9px 13px",marginBottom:12}}>
          <div style={{fontSize:11,fontWeight:800,color:"#F7C948",marginBottom:5}}>⚠️ All Driver Requirements — Ride Share, Grocery &amp; Food</div>
          <div style={{display:"flex",flexDirection:"column",gap:3}}>
            {["Valid driver's licence · abstract ≤30 days old","No violent felonies · no DUI or drug-related offences","Interior-facing camera installed &amp; operational at all times","Exterior dashcam installed &amp; operational at all times","Minimum 3.5-star rating — account suspended if rating falls below"].map(r=>(
              <div key={r} style={{display:"flex",gap:7}}>
                <span style={{color:"#F7C948",fontSize:10,flexShrink:0}}>✓</span>
                <span style={{fontSize:10,color:C.muted}}>{r}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Rate bar */}
        <div style={{display:"flex",alignItems:"center",gap:8,background:"rgba(255,255,255,0.03)",border:`1px solid ${C.border}`,borderRadius:12,padding:"9px 13px",marginBottom:12}}>
          <PeakBadge peak={isPeak}/><span style={{fontSize:12,color:C.muted}}>Now: <strong style={{color:C.text}}>${isPeak?"2.50":"1.64"}/mi</strong> · same rate as Ride Share</span>
        </div>

        {/* CTA buttons */}
        <div style={{display:"flex",gap:10,marginBottom:14}}>
          {accountType==="traveler"&&(
            <button onClick={()=>isDelivering?null:setShowPostDelivery(true)}
              style={{flex:1,padding:"12px 8px",background:isDelivering?"#4CAF82":"rgba(76,175,130,0.85)",border:"none",borderRadius:13,color:"#0A0A0F",fontSize:13,fontWeight:800,cursor:isDelivering?"default":"pointer",fontFamily:"'Syne',sans-serif"}}>
              {isDelivering?"🛒 Delivery Active":" 🛒 Offer Grocery Delivery"}
            </button>
          )}
          {isDelivering&&accountType==="traveler"&&(
            <button onClick={()=>{setIsDelivering(false);setActiveDelivery(null);}}
              style={{padding:"12px 16px",background:"rgba(255,107,53,0.1)",border:"1px solid rgba(255,107,53,0.3)",borderRadius:13,color:"#FF6B35",fontSize:13,fontWeight:800,cursor:"pointer",fontFamily:"'Syne',sans-serif"}}>Stop</button>
          )}
          <button onClick={()=>setTab("map")} style={{flex:1,padding:"12px 8px",background:"rgba(76,175,130,0.08)",border:"1.5px solid rgba(76,175,130,0.25)",borderRadius:13,color:"#4CAF82",fontSize:13,fontWeight:800,cursor:"pointer",fontFamily:"'Syne',sans-serif"}}>🗺️ Find Courier</button>
        </div>

        {/* Active delivery info */}
        {isDelivering&&activeDelivery&&(
          <div style={{background:"rgba(76,175,130,0.08)",border:"1px solid rgba(76,175,130,0.25)",borderRadius:14,padding:"12px 14px",marginBottom:14}}>
            <div style={{fontSize:11,fontWeight:800,color:"#4CAF82",marginBottom:6}}>📡 Delivery Broadcast Active</div>
            <div style={{fontSize:12,color:C.muted}}>🛒 Shopping at: <strong style={{color:C.text}}>{activeDelivery.store}</strong></div>
            <div style={{fontSize:12,color:C.muted,marginTop:3}}>📍 Delivering to: <strong style={{color:C.text}}>{activeDelivery.deliveryArea}</strong></div>
            <div style={{fontSize:12,color:C.muted,marginTop:3}}>💰 Suggested: <strong style={{color:"#4CAF82"}}>${activeDelivery.suggestedContribution}</strong></div>
          </div>
        )}

        {/* Couriers list */}
        <div style={{fontSize:11,fontWeight:700,letterSpacing:1.5,textTransform:"uppercase",color:C.muted,marginBottom:10}}>
          {accountType==="traveler"?"Passenger delivery requests near you":"Grocery couriers near you · sorted by tier"}
        </div>
        {groceryCouriers.length>0
          ?groceryCouriers.sort((a,b)=>Object.keys(TRAVELER_TIERS).indexOf(b.tier)-Object.keys(TRAVELER_TIERS).indexOf(a.tier)).map(c=><GroceryCourierCard key={c.id} courier={c} peak={isPeak} onAsk={()=>setGroceryCourierTarget(c)}/>)
          :<div style={{textAlign:"center",padding:"16px 0",color:C.muted,fontSize:12}}>📡 Enable GPS to find nearby grocery couriers…</div>}
      </div>

      {/* ── FOOD DELIVERY ── */}
      <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:22,padding:"18px"}}>
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:14}}>
          <div style={{width:48,height:48,borderRadius:14,background:"rgba(247,201,72,0.12)",border:"1.5px solid rgba(247,201,72,0.25)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22}}>🍔</div>
          <div style={{flex:1}}>
            <div style={{fontSize:16,fontWeight:800}}>Food Delivery</div>
            <div style={{fontSize:12,color:C.muted}}>Local eats delivered peer-to-peer · coming soon</div>
          </div>
          <div style={{background:"rgba(247,201,72,0.1)",border:"1px solid rgba(247,201,72,0.25)",borderRadius:10,padding:"3px 10px"}}>
            <span style={{fontSize:10,fontWeight:800,color:"#F7C948"}}>SOON</span>
          </div>
        </div>
        <div style={{background:"rgba(247,201,72,0.05)",border:"1px solid rgba(247,201,72,0.15)",borderRadius:12,padding:"10px 14px",marginBottom:12}}>
          <div style={{fontSize:11,color:"rgba(240,237,232,0.5)",lineHeight:1.6,marginBottom:8}}>Food delivery will follow the same peer-to-peer model — verified drivers, direct contribution, 0% platform fee.</div>
          <div style={{fontSize:10,fontWeight:800,color:"#F7C948",marginBottom:5}}>Food delivery driver requirements</div>
          <div style={{display:"flex",flexDirection:"column",gap:3}}>
            {["Valid driver's licence · abstract ≤30 days","No violent felonies · no DUI or drug offences","Interior-facing camera installed & operational","Exterior dashcam installed & operational","Minimum 3.5-star rating maintained"].map(r=>(
              <div key={r} style={{display:"flex",gap:7}}>
                <span style={{color:"#F7C948",fontSize:10,flexShrink:0}}>✓</span>
                <span style={{fontSize:10,color:"rgba(240,237,232,0.4)"}}>{r}</span>
              </div>
            ))}
          </div>
        </div>
        <div style={{display:"flex",gap:7}}>
          {["Get notified","Learn more"].map(a=>(
            <div key={a} style={{padding:"8px 14px",background:"rgba(247,201,72,0.08)",border:"1px solid rgba(247,201,72,0.18)",borderRadius:10,fontSize:11,fontWeight:700,color:"#F7C948",cursor:"pointer"}}>{a}</div>
          ))}
        </div>
      </div>
    </div>
  );

  const TiersTab = () => (
    <div className="fadeUp">
      <div style={{fontSize:22,fontWeight:900,letterSpacing:"-1px",marginBottom:4}}>Subscription Plans 🏆</div>
      <div style={{fontSize:13,color:C.muted,marginBottom:18}}>Simple pricing. Contributions always 100% between traveler and passenger.</div>

      {/* Special rates banner — passengers only */}
      {accountType==="passenger"&&(
      <div style={{background:"linear-gradient(135deg,rgba(96,165,250,0.08),rgba(167,139,250,0.08))",border:"1.5px solid rgba(96,165,250,0.25)",borderRadius:20,padding:"18px 20px",marginBottom:18}}>
        <div style={{fontSize:12,fontWeight:800,color:"#60A5FA",marginBottom:12,letterSpacing:0.5}}>⭐ Special Rates for Our Community — Passengers Only</div>
        <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
          {SPECIAL_RATES.map(r=>(
            <div key={r.id} style={{flex:1,minWidth:160,background:`${r.color}0D`,border:`1.5px solid ${r.color}33`,borderRadius:14,padding:"14px 16px"}}>
              <div style={{marginBottom:6,display:"flex",justifyContent:"center"}}><RateIcon icon={r.icon} size={52} color={r.color}/></div>
              <div style={{fontSize:13,fontWeight:900,color:r.color,marginBottom:3}}>{r.label}</div>
              <div style={{fontSize:18,fontWeight:900,color:r.color,marginBottom:5}}>{r.discount}</div>
              <div style={{fontSize:11,color:"rgba(240,237,232,0.5)",lineHeight:1.6}}>{r.desc}</div>
              <div style={{marginTop:8,fontSize:10,fontWeight:700,color:r.color,background:`${r.color}15`,borderRadius:8,padding:"3px 8px",display:"inline-block"}}>Verify on signup →</div>
            </div>
          ))}
        </div>
        <div style={{fontSize:10,color:"rgba(240,237,232,0.35)",marginTop:12,lineHeight:1.5}}>Eligibility verified during account creation with government-issued documentation. Special rates are applied automatically once verified.</div>
      </div>
      )}
      {/* Rate cards */}
      <div style={{background:"rgba(255,255,255,0.03)",border:`1px solid ${C.border}`,borderRadius:18,padding:"16px",marginBottom:16}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
          <div style={{fontSize:12,fontWeight:700,letterSpacing:1,textTransform:"uppercase",color:C.muted}}>📏 Per-Mile Rates</div>
          <button onClick={()=>setShowPeakSettings(true)} style={{background:"rgba(247,201,72,0.1)",border:"1px solid rgba(247,201,72,0.25)",borderRadius:10,color:"#F7C948",padding:"4px 10px",fontSize:10,fontWeight:700,cursor:"pointer",fontFamily:"'Syne',sans-serif"}}>Edit Hours</button>
        </div>
        <div style={{display:"flex",gap:10}}>
          <div style={{flex:1,background:"rgba(76,175,130,0.08)",border:`1.5px solid ${!isPeak?"rgba(76,175,130,0.5)":"rgba(76,175,130,0.2)"}`,borderRadius:14,padding:"14px",textAlign:"center"}}>
            <div style={{fontSize:9,fontWeight:700,letterSpacing:1,textTransform:"uppercase",color:"#4CAF82",marginBottom:4}}>🟢 Standard{!isPeak?" · NOW":""}</div>
            <div style={{fontSize:28,fontWeight:900,color:"#4CAF82"}}>$1.64<span style={{fontSize:11,color:C.muted}}>/mi</span></div>
          </div>
          <div style={{flex:1,background:"rgba(247,201,72,0.08)",border:`1.5px solid ${isPeak?"rgba(247,201,72,0.5)":"rgba(247,201,72,0.2)"}`,borderRadius:14,padding:"14px",textAlign:"center"}}>
            <div style={{fontSize:9,fontWeight:700,letterSpacing:1,textTransform:"uppercase",color:"#F7C948",marginBottom:4}}>🔴 Peak{isPeak?" · NOW":""}</div>
            <div style={{fontSize:28,fontWeight:900,color:"#F7C948"}}>$2.50<span style={{fontSize:11,color:C.muted}}>/mi</span></div>
          </div>
        </div>
      </div>
      {/* Tab switch — only show if looking at another role's rates for reference */}
      {accountType==="traveler" ? (
        <>
          <div style={{fontSize:11,fontWeight:700,letterSpacing:1.5,textTransform:"uppercase",color:C.muted,marginBottom:12}}>Your Traveler Plans</div>
          <div style={{display:bp.isDesktop?"grid":"block",gridTemplateColumns:"1fr 1fr 1fr",gap:14}}>
            {Object.keys(TRAVELER_TIERS).map(tier=><TravelerTierCard key={tier} tier={tier} isActive={tier===travelerTier&&accountType==="traveler"} usedTrips={usedTrips}/>)}
          </div>
        </>
      ) : (
        <>
          <div style={{fontSize:11,fontWeight:700,letterSpacing:1.5,textTransform:"uppercase",color:C.muted,marginBottom:12}}>Your Passenger Plan</div>
          <PassengerTierCard isActive={accountType==="passenger"}/>
          <div style={{marginTop:16,background:"rgba(255,255,255,0.03)",border:`1px solid ${C.border}`,borderRadius:14,padding:"12px 15px"}}>
            <div style={{fontSize:11,fontWeight:700,color:C.muted,marginBottom:4}}>🚗 Interested in becoming a Traveler?</div>
            <div style={{fontSize:11,color:C.muted,lineHeight:1.6}}>Travelers pay their own separate tier subscription ($50 / $100 / $200/mo) and keep 100% of every contribution — no passenger rate applies to them.</div>
          </div>
        </>
      )}
    </div>
  );

  // Called as functions (not <Components/>) so React never sees a new component type
  // and never remounts LiveMap / Leaflet on re-renders.
  const renderTabContent = () => {
    if (tab==='home')     return HomeTab();
    if (tab==='map')      return MapTab();
    if (tab==='news')     return NewsTab();
    if (tab==='services') return ServicesTab();
    if (tab==='tiers')    return TiersTab();
    return null;
  };

  return (
    <>
      <link href="https://fonts.googleapis.com/css2?family=Syne:wght@400;700;800;900&display=swap" rel="stylesheet"/>
      <style>{STYLES}</style>
      <div style={{fontFamily:"'Syne',sans-serif",minHeight:"100vh",background:C.bg,color:C.text,display:"flex"}}>

        {/* SIDEBAR — tablet + desktop */}
        {!bp.isMobile&&(
          <SideNav tab={tab} setTab={setTab} isDesktop={bp.isDesktop}
            accountType={accountType} travelerTier={travelerTier}
            isPeak={isPeak} onPeak={()=>setShowPeakSettings(true)} onReport={()=>setShowReport(true)}
            locationLabel={locationLabel} isTracking={isTracking}/>
        )}

        <div style={{flex:1,display:"flex",flexDirection:"column",minWidth:0}}>

          {/* Mobile top bar */}
          {bp.isMobile&&(
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"13px 16px 9px",position:"sticky",top:0,background:`${C.bg}ee`,backdropFilter:"blur(16px)",zIndex:50,borderBottom:`1px solid ${C.border}`}}>
              <div style={{fontSize:19,fontWeight:900,letterSpacing:"-1px"}}>on<span style={{color:"#FF6B35"}}>my</span>way</div>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <button onClick={()=>setShowPeakSettings(true)} style={{display:"flex",alignItems:"center",gap:4,background:isPeak?"rgba(247,201,72,0.1)":"rgba(76,175,130,0.08)",border:`1px solid ${isPeak?"rgba(247,201,72,0.3)":"rgba(76,175,130,0.22)"}`,borderRadius:20,padding:"4px 10px",cursor:"pointer",fontFamily:"'Syne',sans-serif"}}>
                  <span style={{fontSize:9}}>{isPeak?"🔴":"🟢"}</span>
                  <span style={{fontSize:9,fontWeight:800,color:isPeak?"#F7C948":"#4CAF82"}}>${isPeak?"2.50":"1.64"}/mi</span>
                </button>
                {accountType==="traveler"?<TierBadge tier={travelerTier} type="traveler"/>:<TierBadge tier="rider" type="passenger"/>}
                <button onClick={()=>setShowReport(true)} style={{background:"rgba(255,107,53,0.1)",border:"1px solid rgba(255,107,53,0.22)",borderRadius:18,color:"#FF6B35",padding:"6px 10px",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"'Syne',sans-serif"}}>+</button>
              </div>
            </div>
          )}

          {/* Desktop top bar */}
          {!bp.isMobile&&(
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 28px",borderBottom:`1px solid ${C.border}`,background:`${C.bg}cc`,backdropFilter:"blur(12px)",position:"sticky",top:0,zIndex:40}}>
              <div>
                <div style={{fontSize:18,fontWeight:900}}>{TABS.find(t=>t.id===tab)?.icon} {TABS.find(t=>t.id===tab)?.label}</div>
                <div style={{fontSize:11,color:C.muted,marginTop:2,display:"flex",alignItems:"center",gap:8}}>
                  <GPSStatusDot tracking={isTracking}/>
                  <span style={{color:isTracking?"#4CAF82":C.muted}}>{isTracking?"GPS active":"GPS off"}</span>
                  {isTracking&&locationLabel&&<span style={{color:C.muted}}>· {locationLabel}</span>}
                </div>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:12}}>
                {isTraveling&&activeRoute&&(
                  <div style={{background:"rgba(255,107,53,0.09)",border:"1px solid rgba(255,107,53,0.25)",borderRadius:12,padding:"6px 14px",display:"flex",alignItems:"center",gap:10}}>
                    <span style={{fontSize:11,fontWeight:800,color:"#FF6B35"}}>📡 Broadcasting → {activeRoute.destination}</span>
                    <button onClick={()=>{setIsTraveling(false);setActiveRoute(null);}} style={{background:"none",border:"none",color:C.muted,fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"'Syne',sans-serif"}}>Stop</button>
                  </div>
                )}
                {formData.name&&<div style={{fontSize:13,color:C.muted}}>{formData.name}</div>}
              </div>
            </div>
          )}

          {/* GPS status bar (mobile) */}
          {bp.isMobile&&(
            <div style={{background:isTracking?"rgba(76,175,130,0.06)":"rgba(255,107,53,0.06)",borderBottom:`1px solid ${isTracking?"rgba(76,175,130,0.15)":"rgba(255,107,53,0.12)"}`,padding:"4px 16px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div style={{display:"flex",alignItems:"center",gap:5}}>
                <GPSStatusDot tracking={isTracking}/>
                <span style={{fontSize:10,fontWeight:700,color:isTracking?"#4CAF82":"#FF6B35"}}>{isTracking?"Exact GPS":"GPS Off"}</span>
              </div>
              <span style={{fontSize:10,color:C.muted}}>
                {userPos&&isTracking?locationLabel||"Location acquired":gpsError?"Allow location access":"Acquiring location…"}
              </span>
            </div>
          )}

          {/* Mobile broadcast bar */}
          {bp.isMobile&&isTraveling&&activeRoute&&(
            <div style={{background:"rgba(255,107,53,0.09)",borderBottom:"1px solid rgba(255,107,53,0.18)",padding:"8px 16px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div><div style={{fontSize:11,fontWeight:800,color:"#FF6B35"}}>📡 LIVE · ${activeRoute.suggestedContribution||activeRoute.suggestedFare}/passenger</div><div style={{fontSize:11,color:C.muted}}>→ {activeRoute.destination}</div></div>
              <button onClick={()=>{setIsTraveling(false);setActiveRoute(null);}} style={{background:"rgba(255,255,255,0.05)",border:`1px solid ${C.border}`,borderRadius:8,color:C.muted,padding:"5px 10px",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"'Syne',sans-serif"}}>Stop</button>
            </div>
          )}

          {/* Main content */}
          <div style={{flex:1,overflowY:"auto",padding:mainPad}}>
            {renderTabContent()}
          </div>

          {/* Mobile bottom nav */}
          {bp.isMobile&&(
            <div style={{position:"fixed",bottom:0,left:0,right:0,background:`${C.bg}f2`,backdropFilter:"blur(20px)",borderTop:`1px solid ${C.border}`,display:"flex",padding:"8px 0 env(safe-area-inset-bottom,12px)",zIndex:50}}>
              {TABS.map(t=>(
                <button key={t.id} onClick={()=>setTab(t.id)} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:3,background:"none",border:"none",cursor:"pointer",fontFamily:"'Syne',sans-serif",paddingBottom:4}}>
                  <div style={{fontSize:17}}>{t.icon}</div>
                  <div style={{fontSize:9,fontWeight:700,color:tab===t.id?"#FF6B35":C.muted}}>{t.label}</div>
                  {tab===t.id&&<div style={{width:4,height:4,borderRadius:"50%",background:"#FF6B35"}}/>}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {showPostRoute&&<PostRouteModal userPos={userPos} travelerTier={travelerTier} peakWindows={peakWindows} locationLabel={locationLabel} onClose={()=>setShowPostRoute(false)} onPost={r=>{setActiveRoute(r);setIsTraveling(true);setTab("services");}}/>}
      {showPostDelivery&&<PostDeliveryModal userPos={userPos} travelerTier={travelerTier} peakWindows={peakWindows} locationLabel={locationLabel} onClose={()=>setShowPostDelivery(false)} onPost={d=>{setActiveDelivery(d);setIsDelivering(true);setTab("services");}}/>}
      {showReport&&<ReportModal onClose={()=>setShowReport(false)} onSubmit={handleReport}/>}
      {fareTraveler&&<FareModal traveler={fareTraveler} peak={isPeak} onClose={()=>setFareTraveler(null)}/>}
      {groceryCourierTarget&&<GroceryContributionModal courier={groceryCourierTarget} peak={isPeak} onClose={()=>setGroceryCourierTarget(null)}/>}
      {showPeakSettings&&<PeakModal windows={peakWindows} onSave={w=>{setPeakWindows(w);setShowPeakSettings(false);}} onClose={()=>setShowPeakSettings(false)}/>}
    </>
  );
}
