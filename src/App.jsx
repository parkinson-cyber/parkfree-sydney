import React, { useState, useRef, useCallback } from 'react'
import Header from './components/Header'
import MapComponent from './components/MapComponent'
import BottomSheet from './components/BottomSheet'
import SearchBar from './components/SearchBar'
import ParkNearMeButton from './components/ParkNearMeButton'
import NearestPanel from './components/NearestPanel'

const PARKING_FEATURES = [
  // ── PYRMONT ──────────────────────────────────────────────
  {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: [[151.2055,-33.8745],[151.2055,-33.8730],[151.2055,-33.8715]] },
    properties: { streetName: 'Pyrmont Bridge Road', suburb: 'Pyrmont', council: 'City of Sydney', notes: 'Western kerb unrestricted. No clearway. No time limit. Check southern end near Harris St intersection.', lastVerified: '2026-06-01', status: 'verified', confidence: 'high' }
  },
  {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: [[151.1985,-33.8720],[151.1998,-33.8720],[151.2010,-33.8720]] },
    properties: { streetName: 'Allen Street', suburb: 'Pyrmont', council: 'City of Sydney', notes: 'Both kerbs unrestricted between Pyrmont St and Miller St. Residential pocket. No meters.', lastVerified: '2026-06-01', status: 'verified', confidence: 'high' }
  },
  {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: [[151.2005,-33.8700],[151.2005,-33.8688],[151.2005,-33.8675]] },
    properties: { streetName: 'Saunders Street', suburb: 'Pyrmont', council: 'City of Sydney', notes: 'Eastern kerb unrestricted. Western kerb has permit zone Mon–Fri 8am–6pm. Both kerbs free evenings and weekends.', lastVerified: '2026-06-01', status: 'verified', confidence: 'medium' }
  },
  {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: [[151.1968,-33.8695],[151.1975,-33.8695],[151.1983,-33.8695]] },
    properties: { streetName: 'Bulwara Road', suburb: 'Pyrmont', council: 'City of Sydney', notes: 'Northern end only. Eastern kerb unrestricted on the block between Union St and Fig St. No meters here.', lastVerified: '2026-05-28', status: 'verified', confidence: 'medium' }
  },
  {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: [[151.1978,-33.8708],[151.1978,-33.8698],[151.1978,-33.8688]] },
    properties: { streetName: 'Harris Street', suburb: 'Pyrmont', council: 'City of Sydney', notes: 'Residential section north of Union St. Both kerbs free after 6pm weekdays and all weekend. Meters operate 8:30am–6pm Mon–Sat.', lastVerified: '2026-05-28', status: 'verified', confidence: 'high' }
  },

  // ── WOOLLOOMOOLOO ─────────────────────────────────────────
  {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: [[151.2125,-33.8635],[151.2130,-33.8640],[151.2135,-33.8645]] },
    properties: { streetName: 'Forbes Street', suburb: 'Woolloomooloo', council: 'City of Sydney', notes: 'North end near Plunkett St. Eastern kerb unrestricted. No meters. Narrow street — no clearway.', lastVerified: '2026-05-20', status: 'verified', confidence: 'high' }
  },
  {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: [[151.2055,-33.8605],[151.2058,-33.8598],[151.2060,-33.8590]] },
    properties: { streetName: 'McElhone Street', suburb: 'Woolloomooloo', council: 'City of Sydney', notes: 'Steep residential street. Both kerbs unrestricted. Watch driveways. Free 24/7.', lastVerified: '2026-06-10', status: 'verified', confidence: 'high' }
  },
  {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: [[151.2092,-33.8618],[151.2098,-33.8618],[151.2105,-33.8618]] },
    properties: { streetName: 'Bourke Street', suburb: 'Woolloomooloo', council: 'City of Sydney', notes: 'Between Plunkett St and Cathedral St. Southern kerb unrestricted on weekends. Clearway Mon–Fri 7–9am and 4–7pm.', lastVerified: '2026-05-15', status: 'verified', confidence: 'medium' }
  },
  {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: [[151.2110,-33.8625],[151.2110,-33.8615],[151.2110,-33.8605]] },
    properties: { streetName: 'Plunkett Street', suburb: 'Woolloomooloo', council: 'City of Sydney', notes: 'Quiet residential block. Both kerbs free. No meters, no clearway. Great walk to the Domain.', lastVerified: '2026-06-05', status: 'verified', confidence: 'high' }
  },

  // ── MILSONS POINT / MCMAHONS POINT ───────────────────────
  {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: [[151.2065,-33.8400],[151.2068,-33.8410],[151.2070,-33.8420]] },
    properties: { streetName: 'Alfred Street South', suburb: 'Milsons Point', council: 'North Sydney Council', notes: 'Eastern kerb unrestricted between Broughton St and Blues Point Rd. No meters. Walk to Milsons Point station ~5 min.', lastVerified: '2026-05-15', status: 'verified', confidence: 'medium' }
  },
  {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: [[151.2072,-33.8378],[151.2080,-33.8375],[151.2090,-33.8372]] },
    properties: { streetName: 'Blues Point Road', suburb: 'McMahons Point', council: 'North Sydney Council', notes: 'Northern section near Blues Point Reserve. Eastern kerb unrestricted. Scenic harbour views. Free 24/7.', lastVerified: '2026-06-05', status: 'verified', confidence: 'high' }
  },
  {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: [[151.2058,-33.8368],[151.2065,-33.8368],[151.2073,-33.8368]] },
    properties: { streetName: 'Bank Street', suburb: 'McMahons Point', council: 'North Sydney Council', notes: 'Quiet cross street. Both kerbs unrestricted. Residential. Walk to ferry wharf ~3 min.', lastVerified: '2026-06-05', status: 'verified', confidence: 'high' }
  },
  {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: [[151.2080,-33.8358],[151.2085,-33.8352],[151.2090,-33.8345]] },
    properties: { streetName: 'Byrnes Avenue', suburb: 'McMahons Point', council: 'North Sydney Council', notes: 'Short cul-de-sac style block. Both sides free. Very low traffic. Free 24/7.', lastVerified: '2026-05-28', status: 'verified', confidence: 'high' }
  },

  // ── LAVENDER BAY / KIRRIBILLI ─────────────────────────────
  {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: [[151.2138,-33.8388],[151.2145,-33.8388],[151.2155,-33.8388]] },
    properties: { streetName: 'Holt Street', suburb: 'Lavender Bay', council: 'North Sydney Council', notes: 'Western stretch near Lavender St. Both kerbs unrestricted. Quiet residential. Free 24/7.', lastVerified: '2026-05-15', status: 'verified', confidence: 'high' }
  },
  {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: [[151.2148,-33.8418],[151.2148,-33.8410],[151.2148,-33.8400]] },
    properties: { streetName: 'Carabatta Street', suburb: 'Kirribilli', council: 'North Sydney Council', notes: 'Short residential street. Both kerbs unrestricted. Tight turning at top. Free 24/7.', lastVerified: '2026-06-05', status: 'unverified', confidence: 'low' }
  },
  {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: [[151.2162,-33.8408],[151.2168,-33.8405],[151.2175,-33.8402]] },
    properties: { streetName: 'Holbrook Avenue', suburb: 'Kirribilli', council: 'North Sydney Council', notes: 'Residential strip. Eastern kerb unrestricted. Western kerb 2P permit zone Mon–Fri. Both sides free evenings and weekends.', lastVerified: '2026-05-20', status: 'verified', confidence: 'medium' }
  },

  // ── ULTIMO ────────────────────────────────────────────────
  {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: [[151.1990,-33.8788],[151.1998,-33.8788],[151.2005,-33.8788]] },
    properties: { streetName: 'Mountain Street', suburb: 'Ultimo', council: 'City of Sydney', notes: 'Between Bulwara Rd and Quarry St. Both kerbs free after 6pm weekdays and weekends. Meters 8:30am–6pm Mon–Sat.', lastVerified: '2026-06-08', status: 'verified', confidence: 'medium' }
  },
  {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: [[151.1975,-33.8800],[151.1975,-33.8790],[151.1975,-33.8780]] },
    properties: { streetName: 'Quarry Street', suburb: 'Ultimo', council: 'City of Sydney', notes: 'Quiet block next to Harold Park. Eastern kerb unrestricted. Free 24/7 on this block. Good for UTS access.', lastVerified: '2026-06-08', status: 'verified', confidence: 'high' }
  },
  {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: [[151.2008,-33.8772],[151.2015,-33.8772],[151.2022,-33.8772]] },
    properties: { streetName: 'Fig Street', suburb: 'Ultimo', council: 'City of Sydney', notes: 'Between Jones St and Pyrmont Bridge Rd. Southern kerb unrestricted. No clearway on this block. Free 24/7.', lastVerified: '2026-05-30', status: 'verified', confidence: 'high' }
  },

  // ── GLEBE ─────────────────────────────────────────────────
  {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: [[151.1858,-33.8798],[151.1865,-33.8798],[151.1873,-33.8798]] },
    properties: { streetName: 'Toxteth Road', suburb: 'Glebe', council: 'City of Sydney', notes: 'Western end near Hereford St. Both kerbs unrestricted on this block. Outside permit zone boundary. Free 24/7.', lastVerified: '2026-06-02', status: 'verified', confidence: 'medium' }
  },
  {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: [[151.1840,-33.8815],[151.1840,-33.8805],[151.1840,-33.8795]] },
    properties: { streetName: 'Hereford Street', suburb: 'Glebe', council: 'City of Sydney', notes: 'Northern stretch. Both kerbs free. Residential. No permit zone on this block. Easy walk to Glebe Point Rd.', lastVerified: '2026-06-02', status: 'verified', confidence: 'high' }
  },
  {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: [[151.1878,-33.8818],[151.1885,-33.8822],[151.1892,-33.8825]] },
    properties: { streetName: 'St Johns Road', suburb: 'Glebe', council: 'City of Sydney', notes: 'Near Broadway end. Eastern kerb unrestricted evenings and weekends. Meters 9am–8pm Mon–Sat. Completely free Sundays.', lastVerified: '2026-05-25', status: 'verified', confidence: 'medium' }
  },

  // ── SURRY HILLS ───────────────────────────────────────────
  {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: [[151.2145,-33.8848],[151.2145,-33.8838],[151.2145,-33.8828]] },
    properties: { streetName: 'Fitzroy Street', suburb: 'Surry Hills', council: 'City of Sydney', notes: 'Between Foveaux St and Cleveland St. Eastern kerb unrestricted. Outside permit zone on this block. Free 24/7.', lastVerified: '2026-06-10', status: 'verified', confidence: 'medium' }
  },
  {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: [[151.2165,-33.8862],[151.2172,-33.8862],[151.2180,-33.8862]] },
    properties: { streetName: 'Gibbons Street', suburb: 'Surry Hills', council: 'City of Sydney', notes: 'Quiet block. Both kerbs unrestricted. No meters, no permit zone. Rare free pocket in Surry Hills. Free 24/7.', lastVerified: '2026-06-10', status: 'verified', confidence: 'high' }
  },

  // ── NORTH SYDNEY CBD ──────────────────────────────────────
  {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: [[151.2068,-33.8395],[151.2075,-33.8390],[151.2082,-33.8385]] },
    properties: { streetName: 'Napier Street', suburb: 'North Sydney', council: 'North Sydney Council', notes: 'Residential end near Berry St. Eastern kerb unrestricted evenings and weekends. 2P Mon–Fri 8am–6pm.', lastVerified: '2026-05-22', status: 'verified', confidence: 'medium' }
  },
  {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: [[151.2095,-33.8362],[151.2102,-33.8362],[151.2110,-33.8362]] },
    properties: { streetName: 'Ridge Street', suburb: 'North Sydney', council: 'North Sydney Council', notes: 'Between Walker St and Blue St. Southern kerb unrestricted. Good for North Sydney station overflow. Free 24/7 on this block.', lastVerified: '2026-05-22', status: 'unverified', confidence: 'low' }
  },

  // ── NEWTOWN ───────────────────────────────────────────────
  {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: [[151.1798,-33.8985],[151.1805,-33.8985],[151.1812,-33.8985]] },
    properties: { streetName: 'Brown Street', suburb: 'Newtown', council: 'Inner West Council', notes: 'Between King St and Erskineville Rd. Both kerbs free. Outside 2P zone. Residential. Free 24/7.', lastVerified: '2026-06-03', status: 'verified', confidence: 'high' }
  },
  {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: [[151.1812,-33.8968],[151.1812,-33.8958],[151.1812,-33.8948]] },
    properties: { streetName: 'Georgina Street', suburb: 'Newtown', council: 'Inner West Council', notes: 'Quiet residential block near Camperdown border. Both sides unrestricted. No permit zone here. Free 24/7.', lastVerified: '2026-06-03', status: 'verified', confidence: 'medium' }
  },

  // ── REDFERN ───────────────────────────────────────────────
  {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: [[151.2038,-33.8938],[151.2045,-33.8938],[151.2052,-33.8938]] },
    properties: { streetName: 'Louis Street', suburb: 'Redfern', council: 'City of Sydney', notes: 'Off Pitt St near Redfern station. Both kerbs unrestricted. Walk to Redfern station ~4 min. Free 24/7.', lastVerified: '2026-05-18', status: 'verified', confidence: 'high' }
  },
  {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: [[151.2015,-33.8958],[151.2015,-33.8948],[151.2015,-33.8938]] },
    properties: { streetName: 'Caroline Street', suburb: 'Redfern', council: 'City of Sydney', notes: 'Between Regent St and Lawson St. Eastern kerb unrestricted. Good for South Eveleigh access. Free 24/7.', lastVerified: '2026-05-18', status: 'verified', confidence: 'medium' }
  },

  // ── CHIPPENDALE ───────────────────────────────────────────
  {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: [[151.1985,-33.8882],[151.1992,-33.8882],[151.1999,-33.8882]] },
    properties: { streetName: 'Codrington Street', suburb: 'Chippendale', council: 'City of Sydney', notes: 'Between Abercrombie St and O\'Connor St. Southern kerb unrestricted. Outside permit zone boundary. Free 24/7.', lastVerified: '2026-06-12', status: 'verified', confidence: 'medium' }
  },
  {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: [[151.1960,-33.8868],[151.1967,-33.8865],[151.1974,-33.8862]] },
    properties: { streetName: 'Balfour Street', suburb: 'Chippendale', council: 'City of Sydney', notes: 'Quiet block near Victoria Park. Both kerbs unrestricted. Good for Sydney Uni access. Free 24/7.', lastVerified: '2026-06-12', status: 'verified', confidence: 'high' }
  },

  // ── CREMORNE ─────────────────────────────────────────────
  {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: [[151.2314936,-33.8247603],[151.2322759,-33.8248577],[151.2330582,-33.8249550]] },
    properties: { streetName: 'Erith Street', suburb: 'Cremorne', council: 'North Sydney Council', notes: 'Short E-W residential block. Both kerbs likely unrestricted. Away from Military Road commercial zone. Quiet pocket street near Cremorne Reserve.', lastVerified: '2026-06-26', status: 'unverified', confidence: 'medium' }
  },
  {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: [[151.2329277,-33.8263555],[151.2340371,-33.8265505],[151.2351465,-33.8267455]] },
    properties: { streetName: 'Prince Street', suburb: 'Cremorne', council: 'North Sydney Council', notes: 'Residential block running east through Cremorne. Both kerbs likely unrestricted. No meters. Walk to Cremorne Junction 5–8 min.', lastVerified: '2026-06-26', status: 'unverified', confidence: 'medium' }
  },

  // ── NEUTRAL BAY ───────────────────────────────────────────
  {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: [[151.2197755,-33.8342008],[151.2199767,-33.8331160],[151.2201778,-33.8320311]] },
    properties: { streetName: 'Bydown Street', suburb: 'Neutral Bay', council: 'North Sydney Council', notes: 'N-S residential block. Both kerbs likely unrestricted. Outside the Military Road clearway zone. Good for Neutral Bay village access.', lastVerified: '2026-06-26', status: 'unverified', confidence: 'medium' }
  },
  {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: [[151.2201778,-33.8320311],[151.2212177,-33.8321693],[151.2222575,-33.8323075]] },
    properties: { streetName: 'Yeo Street', suburb: 'Neutral Bay', council: 'North Sydney Council', notes: 'Short E-W residential cross street. Both kerbs likely free. Low traffic. No meters. Walk to Military Road 3–4 min.', lastVerified: '2026-06-26', status: 'unverified', confidence: 'medium' }
  },
  {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: [[151.2172161,-33.8316441],[151.2173296,-33.8309687],[151.2174430,-33.8302933]] },
    properties: { streetName: 'Laycock Street', suburb: 'Neutral Bay', council: 'North Sydney Council', notes: 'Quiet N-S residential pocket. Both kerbs likely unrestricted. Away from Military Road. Very low traffic. Check signs on the day.', lastVerified: '2026-06-26', status: 'unverified', confidence: 'medium' }
  },
  {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: [[151.2400521,-33.8284805],[151.2398654,-33.8294862],[151.2396786,-33.8304919]] },
    properties: { streetName: 'Noble Street', suburb: 'Neutral Bay', council: 'North Sydney Council', notes: 'Short N-S residential block near Military Road. Both kerbs likely unrestricted on this section. No meters here. Good for Neutral Bay Junction access.', lastVerified: '2026-06-26', status: 'unverified', confidence: 'medium' }
  },

  // ── MOSMAN ───────────────────────────────────────────────
  {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: [[151.2356486,-33.8216642],[151.2354737,-33.8225364],[151.2352987,-33.8234085]] },
    properties: { streetName: 'Countess Street', suburb: 'Mosman', council: 'Mosman Council', notes: 'Quiet residential block. Mosman Council manages this area with relatively few permit zones compared to City of Sydney. Both kerbs likely unrestricted. Check signs at both ends before parking.', lastVerified: '2026-06-26', status: 'unverified', confidence: 'medium' }
  },
  {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: [[151.2352987,-33.8234085],[151.2360097,-33.8235082],[151.2367206,-33.8236079]] },
    properties: { streetName: 'Earl Street', suburb: 'Mosman', council: 'Mosman Council', notes: 'Short E-W residential cross street. Both kerbs likely unrestricted. Low traffic. Connects Countess St to Rosebery St. Walk to Mosman Junction ~5 min.', lastVerified: '2026-06-26', status: 'unverified', confidence: 'medium' }
  },
  {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: [[151.2408861,-33.8232616],[151.2413850,-33.8229434],[151.2418839,-33.8226251]] },
    properties: { streetName: 'Heydon Street', suburb: 'Mosman', council: 'Mosman Council', notes: 'Residential street in eastern Mosman. Both kerbs likely unrestricted. Walk to Balmoral Beach ~15 min. No clearway on this block.', lastVerified: '2026-06-26', status: 'unverified', confidence: 'medium' }
  },
  {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: [[151.2403484,-33.8285202],[151.2405862,-33.8274709],[151.2408240,-33.8264215]] },
    properties: { streetName: 'Myahgah Road', suburb: 'Mosman', council: 'Mosman Council', notes: 'Residential street near Sirius Cove Reserve. Both kerbs likely unrestricted on this section. Scenic area. Walk to Sirius Cove beach ~5 min. Free 24/7 on residential blocks.', lastVerified: '2026-06-26', status: 'unverified', confidence: 'medium' }
  },

  // ── PADDINGTON ───────────────────────────────────────────
  {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: [[151.2267869,-33.8831691],[151.2266359,-33.8840805],[151.2264849,-33.8849919]] },
    properties: { streetName: 'Ormond Street', suburb: 'Paddington', council: 'City of Sydney', notes: 'Residential N-S block west of Oxford Street. Away from the main permit zone boundary. Check signage carefully — Paddington has many permit zones. May be free evenings and weekends.', lastVerified: '2026-06-26', status: 'unverified', confidence: 'medium' }
  },
  {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: [[151.2275702,-33.8835744],[151.2287185,-33.8837679],[151.2298668,-33.8839613]] },
    properties: { streetName: 'Stafford Street', suburb: 'Paddington', council: 'City of Sydney', notes: 'Residential E-W block in Paddington. Confirm signs on the day — many streets here are permit zones. If outside zone, both kerbs free 24/7. Good for Oxford Street access.', lastVerified: '2026-06-26', status: 'unverified', confidence: 'medium' }
  },
  {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: [[151.2289648,-33.8861165],[151.2297764,-33.8853223],[151.2305879,-33.8845280]] },
    properties: { streetName: 'William Street', suburb: 'Paddington', council: 'City of Sydney', notes: 'Diagonal residential block in central Paddington. Permit zones common here — check signs. May be free outside permit hours. Walk to Oxford Street 5 min.', lastVerified: '2026-06-26', status: 'unverified', confidence: 'medium' }
  },
  {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: [[151.2305879,-33.8845280],[151.2306533,-33.8840058],[151.2307186,-33.8834835]] },
    properties: { streetName: 'Hopetoun Street', suburb: 'Paddington', council: 'City of Sydney', notes: 'Short N-S residential block. Both kerbs may be unrestricted if outside the City of Sydney permit zone — verify the full block. Walk to Paddington RSL ~3 min.', lastVerified: '2026-06-26', status: 'unverified', confidence: 'medium' }
  },

  // ── WOOLLAHRA ─────────────────────────────────────────────
  {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: [[151.2260094,-33.8860925],[151.2271693,-33.8863512],[151.2283292,-33.8866098]] },
    properties: { streetName: 'Renny Street', suburb: 'Woollahra', council: 'Woollahra Council', notes: 'Residential E-W block. Woollahra has fewer permit zones than Paddington. Both kerbs likely unrestricted. Walk to Queen Street village ~8 min. Free 24/7 on residential section.', lastVerified: '2026-06-26', status: 'unverified', confidence: 'medium' }
  },
  {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: [[151.2374920,-33.8867418],[151.2376848,-33.8875286],[151.2378775,-33.8883154]] },
    properties: { streetName: 'Spicer Street', suburb: 'Woollahra', council: 'Woollahra Council', notes: 'Short N-S residential block in Woollahra. Both kerbs likely unrestricted. Low traffic. Quiet pocket near Centennial Park. Free 24/7 on this section.', lastVerified: '2026-06-26', status: 'unverified', confidence: 'medium' }
  },
  {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: [[151.2339872,-33.8886065],[151.2355306,-33.8883228],[151.2370739,-33.8880391]] },
    properties: { streetName: 'Smith Street', suburb: 'Woollahra', council: 'Woollahra Council', notes: 'Residential E-W block between Jersey Road and Nelson Street. Both kerbs likely unrestricted. Good for Queen Street and Centennial Park access.', lastVerified: '2026-06-26', status: 'unverified', confidence: 'medium' }
  },

  // ── RANDWICK ─────────────────────────────────────────────
  {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: [[151.2364673,-33.9051137],[151.2382119,-33.9045314],[151.2399565,-33.9039490]] },
    properties: { streetName: 'Govett Street', suburb: 'Randwick', council: 'Randwick Council', notes: 'Longer residential block. Both kerbs likely unrestricted. Away from main commercial strips. Good access to UNSW and Prince of Wales Hospital. Free 24/7 on residential section.', lastVerified: '2026-06-26', status: 'unverified', confidence: 'medium' }
  },
  {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: [[151.2392033,-33.9042950],[151.2401693,-33.9044504],[151.2411352,-33.9046058]] },
    properties: { streetName: 'White Street', suburb: 'Randwick', council: 'Randwick Council', notes: 'Short residential block in Randwick. Both kerbs likely unrestricted. Walk to Randwick Racecourse ~8 min. Free 24/7 on residential section.', lastVerified: '2026-06-26', status: 'unverified', confidence: 'medium' }
  },
  {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: [[151.2367393,-33.9079102],[151.2377414,-33.9080385],[151.2387435,-33.9081668]] },
    properties: { streetName: 'Burton Street', suburb: 'Randwick', council: 'Randwick Council', notes: 'Residential E-W block near Randwick town centre. Both kerbs likely unrestricted. Good for Randwick shops and UNSW access. Free 24/7 on residential section.', lastVerified: '2026-06-26', status: 'unverified', confidence: 'medium' }
  }
]

function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371000
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function getMidpoint(feature) {
  const coords = feature.geometry.coordinates
  const mid = coords[Math.floor(coords.length / 2)]
  return { lat: mid[1], lng: mid[0] }
}

export default function App() {
  const [selectedStreet, setSelectedStreet] = useState(null)
  const [nearestStreets, setNearestStreets] = useState([])
  const mapRef = useRef(null)
  const features = PARKING_FEATURES

  const handleStreetClick = useCallback((feature) => {
    setSelectedStreet(feature || null)
  }, [])

  const handleSheetClose = useCallback(() => {
    setSelectedStreet(null)
  }, [])

  const handleSearchResult = useCallback((feature) => {
    setSelectedStreet(feature)
    const mid = getMidpoint(feature)
    mapRef.current?.flyTo([mid.lat, mid.lng], 17)
  }, [])

  const handleSearchClear = useCallback(() => {
    setSelectedStreet(null)
    mapRef.current?.clearNearest()
    setNearestStreets([])
  }, [])

  const handleParkNearMe = useCallback(() => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        alert('Location is not supported on this browser.')
        reject(); return
      }
      const timeout = setTimeout(() => {
        reject(new Error('Location timeout'))
        alert('Location took too long. Please try again.')
      }, 10000)

      navigator.geolocation.getCurrentPosition(
        (pos) => {
          clearTimeout(timeout)
          const { latitude: userLat, longitude: userLng } = pos.coords
          const sydneyBounds = { north: -33.5, south: -34.2, east: 151.4, west: 150.9 }
          if (userLat < sydneyBounds.south || userLat > sydneyBounds.north ||
              userLng < sydneyBounds.west || userLng > sydneyBounds.east) {
            alert('ParkFree Sydney covers the Sydney metropolitan area only.')
            resolve(); return
          }
          const withDistances = features
            .filter(f => f.properties.status === 'verified')
            .map(f => {
              const mid = getMidpoint(f)
              return { feature: f, distanceM: haversine(userLat, userLng, mid.lat, mid.lng) }
            })
            .sort((a, b) => a.distanceM - b.distanceM)
            .slice(0, 3)
          mapRef.current?.showUserLocation(userLat, userLng)
          mapRef.current?.highlightNearest(withDistances.map(d => d.feature))
          setNearestStreets(withDistances)
          resolve()
        },
        (err) => {
          clearTimeout(timeout)
          if (err.code === err.PERMISSION_DENIED) {
            alert('Location access was denied. Enable location in your browser settings and try again.')
          } else {
            alert('Could not get your location. Please try again.')
          }
          reject(err)
        },
        { timeout: 9000, enableHighAccuracy: true }
      )
    })
  }, [features])

  const handleNearestSelect = useCallback((feature) => {
    setSelectedStreet(feature)
    const mid = getMidpoint(feature)
    mapRef.current?.flyTo([mid.lat, mid.lng], 17)
  }, [])

  const handleNearestClose = useCallback(() => {
    setNearestStreets([])
    mapRef.current?.clearNearest()
  }, [])

  const verifiedCount = features.filter(f => f.properties.status === 'verified').length

  return (
    <>
      <MapComponent ref={mapRef} features={features} onStreetClick={handleStreetClick} />
      <Header streetCount={verifiedCount} />
      <SearchBar features={features} onResult={handleSearchResult} onClear={handleSearchClear} />
      {nearestStreets.length === 0 && <ParkNearMeButton onLocate={handleParkNearMe} />}
      <NearestPanel streets={nearestStreets} onSelect={handleNearestSelect} onClose={handleNearestClose} />
      <BottomSheet street={selectedStreet} onClose={handleSheetClose} />
    </>
  )
}
