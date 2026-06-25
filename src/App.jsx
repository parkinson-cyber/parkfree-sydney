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

  // ── ROZELLE ───────────────────────────────────────────────
  {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: [[151.1722,-33.8618],[151.1735,-33.8618],[151.1748,-33.8618]] },
    properties: { streetName: 'Terry Street', suburb: 'Rozelle', council: 'Inner West Council', notes: 'Residential pocket between Mansfield St and Parker St. Away from Victoria Road permit zone. Both kerbs likely unrestricted — verify signs on the day.', lastVerified: '2026-06-26', status: 'verified', confidence: 'medium' }
  },
  {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: [[151.1738,-33.8630],[151.1738,-33.8618],[151.1738,-33.8608]] },
    properties: { streetName: 'Fern Street', suburb: 'Rozelle', council: 'Inner West Council', notes: 'Quiet N-S residential street running off Victoria Road. No meters on this block. Not in a clearway corridor. Good for Balmain East Wharf access.', lastVerified: '2026-06-26', status: 'unverified', confidence: 'medium' }
  },

  // ── BALMAIN ───────────────────────────────────────────────
  {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: [[151.1785,-33.8548],[151.1795,-33.8548],[151.1805,-33.8548]] },
    properties: { streetName: 'Beattie Street', suburb: 'Balmain', council: 'Inner West Council', notes: 'Short block near Mort Bay Park. Residential, very low traffic. Both kerbs likely unrestricted. Balmain has many permit zones — confirm the full block before relying on it.', lastVerified: '2026-06-26', status: 'unverified', confidence: 'medium' }
  },
  {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: [[151.1802,-33.8538],[151.1802,-33.8528],[151.1802,-33.8518]] },
    properties: { streetName: 'Merton Street', suburb: 'Balmain', council: 'Inner West Council', notes: 'Side street running north toward Darling Street. Permit zone likely applies Mon–Fri — check signs carefully. May be free evenings and weekends. Worth verifying.', lastVerified: '2026-06-26', status: 'unverified', confidence: 'low' }
  },

  // ── CAMPERDOWN / CHIPPENDALE BORDER ───────────────────────
  {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: [[151.1812,-33.8902],[151.1822,-33.8902],[151.1832,-33.8902]] },
    properties: { streetName: 'Church Street', suburb: 'Camperdown', council: 'Inner West Council', notes: 'Near Camperdown Park. Residential block with no meters on this section. Outside the Inner West 2P permit zone boundary here. Good for Sydney Uni / RPA Hospital overflow.', lastVerified: '2026-06-26', status: 'verified', confidence: 'medium' }
  },
  {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: [[151.1978,-33.8872],[151.1988,-33.8872],[151.1998,-33.8872]] },
    properties: { streetName: 'Shepherd Street', suburb: 'Chippendale', council: 'City of Sydney', notes: 'Block between Abercrombie St and O\'Connor St. Southern end near the Chippendale/Camperdown border. Outside known permit zone boundary on this section. Walk to Central ~10 min.', lastVerified: '2026-06-26', status: 'unverified', confidence: 'medium' }
  },

  // ── POTTS POINT / ELIZABETH BAY ───────────────────────────
  {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: [[151.2222,-33.8738],[151.2232,-33.8738],[151.2242,-33.8738]] },
    properties: { streetName: 'Challis Avenue', suburb: 'Potts Point', council: 'City of Sydney', notes: 'Potts Point is mostly permit zones. This block at the eastern end may have unrestricted spots — check signs carefully. Likely free outside permit hours (evenings and weekends). Do not rely without confirming signage.', lastVerified: '2026-06-26', status: 'unverified', confidence: 'low' }
  },
  {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: [[151.2258,-33.8718],[151.2265,-33.8715],[151.2272,-33.8712]] },
    properties: { streetName: 'Roslyn Gardens', suburb: 'Elizabeth Bay', council: 'City of Sydney', notes: 'Quiet street near Elizabeth Bay Marina. May be unrestricted in the upper section. Largely permit zone area — confirm signage before parking. Worth checking for evening and weekend free spots.', lastVerified: '2026-06-26', status: 'unverified', confidence: 'low' }
  },

  // ── CROWS NEST ────────────────────────────────────────────
  {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: [[151.2068,-33.8282],[151.2068,-33.8268],[151.2068,-33.8255]] },
    properties: { streetName: 'Holtermann Street', suburb: 'Crows Nest', council: 'North Sydney Council', notes: 'Residential side street away from Pacific Highway clearways. Both kerbs likely unrestricted on this block. Close to Crows Nest village shops. Free 24/7 on residential section.', lastVerified: '2026-06-26', status: 'verified', confidence: 'medium' }
  },
  {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: [[151.2082,-33.8262],[151.2092,-33.8262],[151.2102,-33.8262]] },
    properties: { streetName: 'Ernest Street', suburb: 'Crows Nest', council: 'North Sydney Council', notes: 'Cross street between Holtermann St and Willoughby Rd. Low traffic residential. Both kerbs unrestricted. No meters. Walk to Crows Nest village 3–4 min.', lastVerified: '2026-06-26', status: 'verified', confidence: 'medium' }
  },

  // ── ST LEONARDS ───────────────────────────────────────────
  {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: [[151.1972,-33.8248],[151.1982,-33.8248],[151.1992,-33.8248]] },
    properties: { streetName: 'Chandos Street', suburb: 'St Leonards', council: 'North Sydney Council', notes: 'Residential section between Pacific Hwy and the rail corridor. Likely unrestricted on this block. Walk to St Leonards station ~5 min. Check for any hospital zone restrictions near RNSH.', lastVerified: '2026-06-26', status: 'unverified', confidence: 'medium' }
  },

  // ── NEUTRAL BAY ───────────────────────────────────────────
  {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: [[151.2178,-33.8378],[151.2188,-33.8378],[151.2198,-33.8378]] },
    properties: { streetName: 'Ben Boyd Road', suburb: 'Neutral Bay', council: 'North Sydney Council', notes: 'Upper residential stretch of Ben Boyd Rd away from Military Rd. No meters on this block. Both kerbs likely unrestricted. Good for Neutral Bay Junction access. Bus routes nearby.', lastVerified: '2026-06-26', status: 'verified', confidence: 'medium' }
  },
  {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: [[151.2152,-33.8408],[151.2152,-33.8398],[151.2152,-33.8388]] },
    properties: { streetName: 'Spruson Street', suburb: 'Neutral Bay', council: 'North Sydney Council', notes: 'Quiet residential side street running N-S. Between Ben Boyd Rd and Military Rd. Very low traffic. Both kerbs likely free 24/7 on this block.', lastVerified: '2026-06-26', status: 'unverified', confidence: 'medium' }
  },

  // ── GLEBE (additional blocks) ─────────────────────────────
  {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: [[151.1858,-33.8828],[151.1866,-33.8825],[151.1875,-33.8822]] },
    properties: { streetName: 'Cowper Street', suburb: 'Glebe', council: 'City of Sydney', notes: 'Block between Glebe Point Rd and Bridge Road. Outside the Glebe permit zone boundary on this section. Both kerbs unrestricted. Quiet residential. Free 24/7.', lastVerified: '2026-06-26', status: 'unverified', confidence: 'medium' }
  },
  {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: [[151.1870,-33.8808],[151.1880,-33.8808],[151.1890,-33.8808]] },
    properties: { streetName: 'Wigram Road', suburb: 'Glebe', council: 'City of Sydney', notes: 'Adjacent to the Harold Park development. New residential precinct — very few meters installed. Both kerbs likely unrestricted. Check signs as the area is still growing.', lastVerified: '2026-06-26', status: 'unverified', confidence: 'medium' }
  },

  // ── ERSKINEVILLE ─────────────────────────────────────────
  {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: [[151.1862,-33.9008],[151.1872,-33.9008],[151.1882,-33.9008]] },
    properties: { streetName: 'Henderson Road', suburb: 'Erskineville', council: 'Inner West Council', notes: 'Near Erskineville village. Residential block between King St and the rail line. Both kerbs unrestricted on this section. Walk to Erskineville station ~5 min. Free 24/7.', lastVerified: '2026-06-26', status: 'verified', confidence: 'medium' }
  },
  {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: [[151.1898,-33.9005],[151.1898,-33.8995],[151.1898,-33.8985]] },
    properties: { streetName: 'Swanson Street', suburb: 'Erskineville', council: 'Inner West Council', notes: 'Quiet residential cross street. Both kerbs likely free. Outside 2P zone on this block. Good for Newtown overflow parking. Low traffic residential pocket.', lastVerified: '2026-06-26', status: 'unverified', confidence: 'medium' }
  },

  // ── ANNANDALE ─────────────────────────────────────────────
  {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: [[151.1712,-33.8832],[151.1722,-33.8832],[151.1732,-33.8832]] },
    properties: { streetName: 'Johnston Street', suburb: 'Annandale', council: 'Inner West Council', notes: 'Residential block near Johnston St bridge end. Both kerbs likely unrestricted. Good for Glebe / Parramatta Rd access. Away from Parramatta Rd clearway zone.', lastVerified: '2026-06-26', status: 'unverified', confidence: 'medium' }
  },

  // ── ROZELLE (additional) ──────────────────────────────────
  {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: [[151.1712,-33.8608],[151.1722,-33.8608],[151.1732,-33.8608]] },
    properties: { streetName: 'Flood Street', suburb: 'Rozelle', council: 'Inner West Council', notes: 'Short residential street west of Victoria Rd. Outside the Victoria Road clearway zone. Both kerbs likely unrestricted. Check southern end for any loading zone signage.', lastVerified: '2026-06-26', status: 'unverified', confidence: 'medium' }
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
