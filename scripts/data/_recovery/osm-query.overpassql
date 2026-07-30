[out:json][timeout:300];
(
  nwr[~"^parking:"~"."](-33.86,151.18,-33.79,151.245);
  nwr["maxstay"](-33.86,151.18,-33.79,151.245);
  nwr[~"^maxstay:"~"."](-33.86,151.18,-33.79,151.245);
  nwr["amenity"="parking_meter"](-33.86,151.18,-33.79,151.245);
  nwr["vending"="parking_tickets"](-33.86,151.18,-33.79,151.245);
);
out tags center;
