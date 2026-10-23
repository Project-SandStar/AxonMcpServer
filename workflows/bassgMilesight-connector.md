---
title: bassgMilesight Connector — How It Works and How to Build Records From It
description: How the bassgMilesight (Milesight LoRaWAN gateway) connector works in SkySpark 3.x — connector tags, ports, the two-level learn tree, point tags, write points, and how to import equips and points with lorawanImportEquipsAndPoints
category: connectors
tags: [milesight, bassgMilesight, bassgMilesightConn, lorawan, connector, connLearn, learn, import, equip, point, bassgMilesightCur, bassgMilesightWrite, embeddedWebServerPort, deveui, valve, door]
version: 1.0
---

# bassgMilesight Connector Workflow

## Overview

`bassgMilesight` is a third-party SkySpark 3.x connector library (ext `bassgMilesight`, "Milesight Connector for SkySpark 3.x"). It reads LoRaWAN sensors through a Milesight gateway.

Use this workflow to:
- understand the connector record and its ports,
- learn devices and points,
- know which tags each point carries,
- build equip and point records for a new site.

Facts below come from live projects (checked 2026-10-23).

Library depends on: `axon, bassgCommon, conn, hx, obs, ph, phIoT, phScience, point, skyarc`.

## How data flows

```
LoRaWAN sensors ──radio──► Milesight gateway (https://<gw-ip>:8080/)
                                │
                                │ 1. gateway HTTP-pushes uplinks to SkySpark
                                ▼    (port = embeddedWebServerPort,
                     SkySpark embedded web server     header X-Requester-Password)
                                │
                                ▼
                     bassgMilesightConn  ──► points (curVal, his)
                                │
                                │ 2. SkySpark calls the gateway API (uri + username/password)
                                ▼    for learn, ping and downlink writes
                         Milesight gateway
```

Two directions, two ports:

| Direction | Who opens it | Port / address | Used for |
|---|---|---|---|
| Gateway → SkySpark | gateway | `embeddedWebServerPort` on the SkySpark host (e.g. `9099`, `9098`) | Live uplink data (cur values) |
| SkySpark → Gateway | SkySpark | `uri` (e.g. `https://<gateway-ip>:8080/`) | Learn device list, ping, writes (downlinks) |

Each connector on one SkySpark host needs its **own** `embeddedWebServerPort`. For example, one project uses `9099` and another uses `9098`. Pick a free port for a new project and open it in the firewall from the gateway side.

## 1. The connector record

Example (password removed):

```
id:                       @p:<project>:r:<id> "Site X Connector"
dis:                      "Site X Connector"
conn:                     M
bassgMilesightConn:       M
uri:                      `https://<gateway-ip>:8080/`
username:                 "admin"
password                  (stored in the password store, set via passwordSet)
aesPasswordHashing:       M
runEmbeddedWebServer:     true
embeddedWebServerPort:    9099
milesightGatewayPassword: "<secret>"
milesightDeviceImportUri: ``
connStatus / connState:   "ok" / "open"   (transient, set by the connector)
```

| Tag | Meaning |
|---|---|
| `conn`, `bassgMilesightConn` | Marks the record as a Milesight connector |
| `uri` | Gateway web API base URL (https, port 8080 by default) |
| `username` + password store | Gateway login. `aesPasswordHashing` tells the lib to AES-hash the password the way the Milesight web UI does |
| `runEmbeddedWebServer` | `true` = start the HTTP listener that receives gateway pushes |
| `embeddedWebServerPort` | Port of that listener |
| `milesightGatewayPassword` | Must match the `X-Requester-Password` header set in the gateway's HTTP application settings |
| `milesightDeviceImportUri` | Optional device import file. Empty in all live projects |

**Gateway side:** in the Milesight gateway, add an HTTP(S) application / data forwarding target that points to `http://<skyspark-host>:<embeddedWebServerPort>/` and add header `X-Requester-Password: <milesightGatewayPassword>`.

Create one:

```axon
do
  c: diff(null, {dis:"Site X Milesight", conn, bassgMilesightConn,
                 uri:`https://<gateway-ip>:8080/`, username:"admin",
                 aesPasswordHashing, runEmbeddedWebServer:true,
                 embeddedWebServerPort:9100,
                 milesightGatewayPassword:"<shared secret>"}, {add}).commit
  passwordSet(c->id, "<gateway admin password>")
  connPing(c->id)
end
```

## 2. Connector functions

| Function | Use |
|---|---|
| `connLearn(conn)` / `connLearn(conn, learn)` | Standard learn (backed by `bassgMilesightLearn`) |
| `bassgMilesightPing(connRef)` | Ping/wake the connector. Call it before every `pointWrite` |
| `bassgMilesightSyncCur`, `bassgMilesightSyncHis` | Internal cur / his sync |
| `connPing`, `connClose` | Standard conn functions |

## 3. Learn tree — two levels

### Level 1: `connLearn(conn)` → one row per **device** (equip)

Columns: `dis, equip, learn`.

```
dis:   " WMEM500-PT100-ZONE1P - 24e1240000000001 "
equip: M
learn: "bassgMilesightDevice:WMEM500-PT100-ZONE1P,bassgMilesightDeviceEUI:24e1240000000001"
```

- `learn` is a **Str**, not a Dict. It holds the device name (as named in the gateway) and the DevEUI.
- `dis` has leading/trailing spaces. `trim` it.
- A large site can return 50+ devices.

Device name prefixes seen: `WMEM500-PT100-*` (PT100 temp probes), `WMEM300-MCS-*` (door/temp), `WMEM320`, `VutilityVoltDropDirect_*` (3-phase meters), `UC512-DI-*` (UC512 valve controller). The name is what the installer typed in the gateway; it is the best hint for room/zone.

### Level 2: `connLearn(conn, equip->learn)` → **points** of that device

Example (PT100 probe):

```
dis:                      "Temperature"
navName:                  "Temperature"
point:                    M
his:                      M
kind:                     "Number"
tz:                       "UTC"
disMacro:                 "$equipRef $navName"
bassgMilesightCur:        "WMEM500-PT100-ZONE5C_24e1240000000002_Temperature"
bassgMilesightWrite:      "WMEM500-PT100-ZONE5C_24e1240000000002_Temperature"
bassgMilesightDeviceEUI:  "24e1240000000002"
bassgMilesightPayloadKey: "temperature"
```

Notes:
- Learn gives **no `unit`**. Add it yourself (spreadsheet or by payload key).
- Learn gives `tz:"UTC"`. Replace with `site->tz`.
- Learn gives no `cur`, `writable`, `sensor`, `temp` etc. Add them yourself.

## 4. Point tags

| Tag | From | Meaning |
|---|---|---|
| `bassgMilesightCur` | learn | Address. Format `<DeviceName>_<DevEUI>_<PointName>`. **Unique per point** — use it as the dedupe key |
| `bassgMilesightWrite` | learn | Same string as cur. Address for downlink writes |
| `bassgMilesightHis` | (def only) | Defined by the lib but not used on any live point. History comes from `his` + `hisCollectInterval`/`hisCollectCov` |
| `bassgMilesightDeviceEUI` | learn | DevEUI of the device. Use it to group points into one equip |
| `bassgMilesightPayloadKey` | learn | Key in the decoded uplink JSON (`temperature`, `humidity`, `battery`, `door`, `valve_1`, `currentL1` …) |
| `bassgMilesightPoint` | you add | Marks the point as synced by this connector |
| `bassgMilesightConnRef` | you add | Ref to the connector record |

### Payload keys seen (one live project, 193 points)

| Payload key | kind | unit to set |
|---|---|---|
| `temperature` | Number | `°C` (or `°F` per site) |
| `humidity` | Number | `%` |
| `battery` | Number | `%` |
| `door` | Str | none — add `enum:"open,close"` |
| `currentL1` / `L2` / `L3` | Number | `A` |
| `voltageL1` / `L2` / `L3` | Number | `V` |
| `activeEnergyAccumulation` | Number | `Wh` (add `hisTotalized`) |
| `averagePowerFactor` | Number | none |
| `valve_1` (UC512) | Bool | none — see writable valve below |

Some live points still miss `unit`. Always set it at import.

### Full live point (door sensor)

```
point, his, cur, sensor, door, writable
kind:"Str", enum:"open,close"
navName:"Door", disMacro:"$equipRef $navName"
bassgMilesightPoint, bassgMilesightConnRef:@<conn>
bassgMilesightCur:"WMEM300-MCS-915MDOOR4_24e1240000000003_Door"
bassgMilesightWrite:"WMEM300-MCS-915MDOOR4_24e1240000000003_Door"
bassgMilesightDeviceEUI:"24e1240000000003"
bassgMilesightPayloadKey:"door"
equipRef, siteRef, tz:"<site tz>"
hisCollectInterval:10min, hisCollectCov
```

### Writable valve (UC512)

```
point, his, cur, writable, sensor, valve
kind:"Bool"
curConvert:"numberToBool()"
enum:{closed:{command:"ff1d0000", dis:"Closed"}, open:{command:"ff1d2000", dis:"Open"}}
bassgMilesightPayloadKey:"valve_1"
bassgMilesightCur / bassgMilesightWrite:"UC512-DI-915M_24e1240000000004_Valve 1"
schedulable:10
```

- The `enum` dict maps each state to the **hex downlink command** the gateway sends. This is how writes work.
- `curConvert:"numberToBool()"` turns the 0/1 uplink into Bool.
- Write pattern used in `pointWriteSchedule`:
  ```axon
  bassgMilesightPing(valve->bassgMilesightConnRef)
  pointWrite(valve, schedule, 10, "Schedule Job")
  ```
- On some projects, many sensors carry `writable` too, but they are read-only sensors. Do not add `writable` unless the device takes downlinks.

## 5. Equip tags

Learn gives only `dis, equip, learn`. You add the rest. Use this model for new projects:

```
equip, siteRef:@site
navName:"Evap5C"
learn:"bassgMilesightDevice:WMEM500-PT100-EVAP5C,bassgMilesightDeviceEUI:24e1240000000005"
freezerGroup:"Freezer 1"        // room
equipGroup:"Evaporators"           // Zones / Evaporators / Meters / Doors / Floor / Top Rack
equipTypeGroup:"Coil"              // Space / Product / Cell / Coil / Compressor / Compressor Total / Condensor / Evaporator
disMacro:"$siteRef $freezerGroup $equipGroup $equipTypeGroup $navName"
```

Keep the spelling `Condensor` — functions compare these strings. Keep `learn` on the equip so you can re-learn its points later.

## 6. Import: `lorawanImportEquipsAndPoints(conn, site, spreadsheet)`

It is a project func, not part of the lib. Copy it from a project that has it. Steps:

1. `connLearn(conn)` → all devices.
2. For each device: set `siteRef`, commit as a new equip.
3. `connLearn(conn, equip->learn)` → its points.
4. Optional CSV (`spreadsheet` = `io/...csv` or a published Google Sheet CSV URI): only rows with an `import` column count. A learned point is kept only if its `navName` matches a CSV row; the CSV `unit` overrides.
5. Each point gets: `equipRef`, `siteRef`, `his`, `hisCollectInterval:5min`, `bassgMilesightPoint`, `tz:site->tz`, `bassgMilesightConnRef`, `unit`.
6. Skip if a point with the same `bassgMilesightCur` already exists.

Run:

```axon
lorawanImportEquipsAndPoints(read(bassgMilesightConn), read(site), `io/uniquePoints.csv`)
```

### Known gaps

- **Equips are always added.** There is no check for an existing equip, so a second run makes duplicate equips (points are deduped, equips are not). Check `readAll(equip and learn)` before you re-run, or dedupe on `bassgMilesightDeviceEUI`.
- The CSV match is on `navName` only (e.g. `Temperature`), so it filters point *types*, not single devices.
- It does not add `cur`, `sensor`, `temp`, `door`, `enum`, `curConvert` or the equip tags (`freezerGroup` etc.). Add them in a second pass, keyed by payload key and DevEUI.

## 7. Recipes

Preview what learn returns before you commit anything:

```axon
do
  c: read(bassgMilesightConn)
  connLearn(c).futureGet().map(e=> {dis: e->dis.trim, learn: e->learn})
end
```

Points of one device:

```axon
do
  c: read(bassgMilesightConn)
  e: connLearn(c).futureGet().first
  connLearn(c, e->learn).futureGet()
end
```

Find devices not yet imported:

```axon
do
  c: read(bassgMilesightConn)
  have: readAll(bassgMilesightPoint).colToList("bassgMilesightDeviceEUI").unique
  connLearn(c).futureGet().findAll(e=> not have.contains(e->learn.split(",")[1].split(":")[1]))
end
```

Add `cur` and units after import (example for temperature):

```axon
readAll(bassgMilesightPoint and bassgMilesightPayloadKey=="temperature" and not unit)
  .toRecList.map(p=> diff(p, {cur, sensor, temp, unit:"°C"})).commit
```

## 8. Troubleshooting

| Symptom | Check |
|---|---|
| `connStatus` fault | `uri`, `username`, password store, `aesPasswordHashing`. Can SkySpark reach `https://<gw>:8080/`? |
| Learn works, but no `curVal` | Gateway HTTP push: target host/port = `embeddedWebServerPort`, header `X-Requester-Password` = `milesightGatewayPassword`, firewall open on that port |
| Some points have history but no live `curVal` | Seen on some door Str points. Read history instead (see `cur_Door_Point` in `curRule-computed-points.md`) |
| Port conflict | Two connectors on one host share a port. Give each a unique `embeddedWebServerPort` |
| Need raw messages | `logRead(today().toSpan, null, {limit:9000000}).findAll(x=> x->name=="bassgMilesight" and x->msg.contains(<devEUI>))` |
| Write does nothing | Point needs `writable`, `bassgMilesightWrite`, and an `enum` dict with hex `command` per state. Call `bassgMilesightPing(connRef)` first |

## Related

- `curRule-computed-points.md` — door Str → Bool computed point
- `mobilytik-dashboard-generation.md` — dashboards on these points
- Synced source: `proj/<instance>/<project>/func/lorawanImportEquipsAndPoints.axon`
