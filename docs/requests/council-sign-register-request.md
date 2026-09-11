# Data requests — parking sign registers

Send these from your own address. They are deliberately short: council data
officers process dozens of these, and a specific, small ask gets answered far
more often than a broad one.

Councils that publish nothing and are worth asking, biggest gap first:

| council | unknown streets | contact |
|---|---:|---|
| Canterbury-Bankstown | 7,047 | council@cbcity.nsw.gov.au |
| Blacktown | 5,243 | council@blacktown.nsw.gov.au |
| Sutherland Shire | 4,984 | ssc@ssc.nsw.gov.au |
| The Hills Shire | 4,413 | council@thehills.nsw.gov.au |
| Cumberland | 3,979 | council@cumberland.nsw.gov.au |
| Fairfield | 3,003 | mail@fairfieldcity.nsw.gov.au |
| Hornsby | 2,957 | hsc@hornsby.nsw.gov.au |
| Liverpool | 2,700 | lcc@liverpool.nsw.gov.au |
| Georges River | 2,486 | mail@georgesriver.nsw.gov.au |
| Ku-ring-gai | 2,521 | kmc@kmc.nsw.gov.au |

Check each address on the council's own contact page before sending — these
change, and a bounced request looks like no answer.

---

## 1. To a council

**Subject:** Request for parking sign / restriction data (resident, personal project)

Hello,

I'm a resident building a small personal app that tells me when a street is
free to park on, using published council data. I'd like to include [COUNCIL]
but can't find parking restrictions published anywhere machine-readable.

Do you hold, and could you share, any of the following as a spreadsheet, CSV
or GIS export?

1. The parking sign asset register — sign locations with the sign type or
   legend (e.g. "2P 8:30am-6pm Mon-Fri").
2. Resident parking scheme areas, with the streets and the signed time limits
   and hours for each.
3. Metered or ticketed parking locations with their paid hours.

Northern Beaches, Randwick, Waverley, Woollahra, North Sydney, the City of
Sydney and the City of Parramatta all publish some version of this, so there
is precedent for releasing it. If it's easier as a formal access application,
I'm happy to lodge one — just point me at the form.

I'm not asking for personal information of any kind: no permit holders, no
infringements, no vehicle data. Only where the signs are and what they say.

Thanks for your time,
[YOUR NAME]
[SUBURB], [POSTCODE]

---

## 2. To Digital NSW / data.nsw

**Subject:** Dataset request — council parking sign registers as a state-wide layer

Hello,

TfNSW publishes clearways as a live feature service, which makes state roads
usable in a way council roads are not. Council parking signs are the missing
half: a handful of councils publish sign registers, most publish nothing, and
the formats differ where they do.

Is there any work underway on a standard or a state-wide layer for council
parking restrictions — or a mechanism for requesting councils publish theirs
to data.nsw? I'm a resident maintaining a personal app that uses published
parking data, and the gap is roughly 60,000 Sydney streets.

Happy to be pointed to the right team.

Thanks,
[YOUR NAME]

---

## What good looks like when it comes back

A sign register is useful only if a row carries **what the sign says**, not
just that a sign exists. Canterbury-Bankstown's `Traffic_Committee_Signs` has
1,726 rows and none of them do — it tracks work orders. If a council sends
something similar, ask specifically whether the sign *type* or *legend* field
exists in their asset system, even if it isn't in the published extract.
